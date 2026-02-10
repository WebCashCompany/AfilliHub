/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - COM SSE REAL-TIME & AFILIAÇÃO ATIVA 🚀
 * ═══════════════════════════════════════════════════════════════════════
 * * @version 2.5.2 - ✅ CORRIGIDO: Categorias Enterprise + Links de Afiliado
 */

const { chromium } = require('playwright');
const path = require('path');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoria } = require('../../config/categorias-ml');
const MLSessionManager = require('../../services/ml-session-manager');

class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.maxPrice = options.maxPrice ? parseInt(options.maxPrice) : null;
    this.categoriaKey = options.categoria || 'todas';
    this.searchTerm = options.searchTerm || null;
    
    // 🔥 SSE Callback (não-bloqueante)
    this.onProductCollected = options.onProductCollected || null;
    
    this.stats = {
      duplicatesIgnored: 0,
      productsCollected: 0,
      pagesScraped: 0,
      filteredByDiscount: 0,
      filteredByPrice: 0,
      affiliateLinksSuccess: 0,
      affiliateLinksFailed: 0,
      couponsApplied: 0
    };
    
    this.seenLinks = new Set();
    this.seenProductKeys = new Set();
    this.seenOriginalLinks = new Set();
    
    if (!this.searchTerm) {
      this.categoriaInfo = getCategoria(this.categoriaKey);
      if (!this.categoriaInfo) {
        this.categoriaInfo = getCategoria('informatica');
      }
    } else {
      this.categoriaInfo = getCategoria('informatica');
    }
    
    try {
      this.sessionManager = new MLSessionManager();
      const activeSessionPath = this.sessionManager.getActiveSessionPath();
      this.sessionPath = activeSessionPath || path.join(process.cwd(), 'ml-session.json');
      console.log(activeSessionPath ? '✅ Usando sessão ativa do gerenciador' : '⚠️  Usando sessão padrão');
    } catch (error) {
      this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    }
    
    this.browser = null;
    this.context = null;
    this.isFirstProduct = true;
  }

  getSearchUrl() {
    if (this.searchTerm) {
      const encodedTerm = encodeURIComponent(this.searchTerm);
      return `https://lista.mercadolivre.com.br/${encodedTerm}`;
    }
    return this.categoriaInfo.url;
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes...');
    
    try {
      const conn = getProductConnection();
      const Product = getProductModel('ML', conn);
      
      const query = this.searchTerm 
        ? { isActive: true }
        : this.categoriaInfo && this.categoriaInfo.nome !== 'Todas'
          ? { categoria: this.categoriaInfo.nome, isActive: true }
          : { isActive: true };
      
      const products = await Product.find(query)
        .select('link_afiliado link_original nome desconto preco_para')
        .lean()
        .limit(500)
        .sort({ createdAt: -1 });
      
      console.log(`   📊 ${products.length} produtos no banco\n`);
      
      this.existingProductsMap = new Map();
      for (const product of products) {
        if (product.link_afiliado) {
          const key = this.generateProductKey(product.nome);
          this.existingProductsMap.set(key, {
            link: product.link_afiliado,
            originalLink: product.link_original,
            desconto: parseInt(product.desconto) || 0,
            preco: parseInt(product.preco_para) || 0
          });
        }
      }
      
    } catch (error) {
      this.existingProductsMap = new Map();
    }
  }

  generateProductKey(name) {
    const cleanName = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b\d+gb\b|\b\d+tb\b|\d{4,}/gi, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const words = cleanName.split(' ')
      .filter(word => word.length >= 3)
      .slice(0, 8);
    
    return words.join('_');
  }

  async createBrowserContext() {
    if (this.browser) {
      try { await this.browser.close(); } catch (e) {}
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    let contextOptions = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    };

    const fs = require('fs');
    if (fs.existsSync(this.sessionPath)) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(this.sessionPath, 'utf-8'));
        if (sessionData.cookies) {
          contextOptions.storageState = sessionData;
          console.log('   ✅ Sessão carregada (cookies restaurados)\n');
        }
      } catch (error) {
        console.log('   ⚠️  Erro ao carregar sessão\n');
      }
    }

    this.context = await this.browser.newContext(contextOptions);
    
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });
    
    await this.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    return { browser: this.browser, context: this.context };
  }

  async getAffiliateLink(productUrl) {
    const page = await this.context.newPage();
    try {
      const initialDelay = this.isFirstProduct ? 1500 : 400;
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(initialDelay);
      
      this.isFirstProduct = false;

      const tryGetLink = async (isRetry = false) => {
        try {
          await page.waitForSelector('button[class*="share"], button[aria-label*="Compartilhar"]', {
            timeout: 2000, state: 'visible'
          });
        } catch (e) {}

        await page.evaluate(() => { try { navigator.clipboard.writeText(''); } catch(e) {} });
        await page.waitForTimeout(100);

        for (let i = 0; i < 4; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(80);
        }
        
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1200);

        for (let i = 0; i < 4; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(80);
        }
        
        await page.keyboard.press('Enter');
        
        let copiedLink = '';
        const maxAttempts = isRetry ? 8 : 12;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await page.waitForTimeout(200);
          try {
            copiedLink = await page.evaluate(() => navigator.clipboard.readText());
            if (copiedLink && copiedLink.trim().length > 20 && (copiedLink.includes('/sec/') || copiedLink.includes('mercadolivre.com'))) {
              break;
            }
          } catch (e) {}
        }

        await page.keyboard.press('Escape');
        return copiedLink;
      };

      let copiedLink = await tryGetLink(false);

      if (!copiedLink || !copiedLink.includes('/sec/')) {
        console.log(`      🔄 Retry Affiliate Link...`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 });
        await page.waitForTimeout(800);
        copiedLink = await tryGetLink(true);
      }

      await page.close();
      return (copiedLink && copiedLink.includes('/sec/')) ? copiedLink.trim() : productUrl;

    } catch (error) {
      try { await page.close(); } catch (e) {}
      return productUrl;
    }
  }

  async processProducts(products, allProducts) {
    for (const prodData of products) {
      if (allProducts.length >= this.limit) break;

      let finalPrice = prodData.currentPrice;
      let couponApplied = false;
      let couponText = '';
      let realDiscount = prodData.discount;

      // Lógica de Cupom
      if (prodData.coupon && prodData.currentPrice >= prodData.coupon.minValue) {
        if (prodData.coupon.type === 'percent') {
          finalPrice = prodData.currentPrice - Math.round(prodData.currentPrice * (prodData.coupon.discount / 100));
        } else if (prodData.coupon.type === 'value') {
          finalPrice = prodData.currentPrice - prodData.coupon.discount;
        }
        couponApplied = true;
        couponText = prodData.coupon.text;
        realDiscount = Math.round(((prodData.oldPrice - finalPrice) / prodData.oldPrice) * 100);
        this.stats.couponsApplied++;
      }

      if (this.maxPrice && finalPrice > this.maxPrice) {
        this.stats.filteredByPrice++;
        continue;
      }

      if (this.seenLinks.has(prodData.link)) {
        this.stats.duplicatesIgnored++;
        continue;
      }

      this.seenLinks.add(prodData.link);
      const currentProgress = allProducts.length + 1;
      console.log(`   🔄 [${currentProgress}/${this.limit}] ${prodData.name.substring(0, 40)}...`);
      
      const affiliateLink = await this.getAffiliateLink(prodData.link);
      const isAffiliate = affiliateLink.includes('/sec/');

      if (isAffiliate) {
        console.log(`      ✅ Afiliado`);
        this.stats.affiliateLinksSuccess++;
      } else {
        console.log(`      ⚠️  Original (Falha no link de afiliado)`);
        this.stats.affiliateLinksFailed++;
      }

      // IMPORTANTE: Normalização da categoria para bater com o ENUM do Model
      let categoriaFinal = this.searchTerm ? 'Informática' : this.categoriaInfo.nome;
      if (categoriaFinal === 'esportes') categoriaFinal = 'Esportes e Fitness';

      const product = {
        nome: prodData.name,
        imagem: prodData.image,
        link_original: prodData.link,
        link_afiliado: affiliateLink,
        desconto: `${realDiscount}%`,
        preco: `R$ ${finalPrice}`,
        preco_anterior: `R$ ${prodData.oldPrice}`,
        preco_de: String(prodData.oldPrice),
        preco_para: String(finalPrice),
        categoria: categoriaFinal,
        marketplace: 'ML',
        isActive: true
      };

      if (couponApplied) {
        product.cupom_aplicado = true;
        product.cupom_texto = couponText;
        product.preco_sem_cupom = String(prodData.currentPrice);
        product.desconto_cupom = String(prodData.currentPrice - finalPrice);
      }

      this.stats.productsCollected++;
      allProducts.push(product);

      // 🔥 SSE NÃO-BLOQUEANTE
      if (this.onProductCollected) {
        setImmediate(() => {
          try {
            this.onProductCollected(product, allProducts.length, this.limit);
          } catch (err) {}
        });
      }
    }
  }

  async scrapeCategory() {
    const startTime = Date.now();
    await this.loadExistingProducts();
    const { browser, context } = await this.createBrowserContext();
   
    let allProducts = [];
    let pageNum = 1;
    let currentOffset = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  🚀 MERCADO LIVRE - MODO AFILIADO ATIVO            ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)           ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= 15) {
        const baseUrl = this.getSearchUrl();
        const url = pageNum === 1 ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_Desde_${currentOffset + 1}`;
        console.log(`📄 Página ${pageNum} [${allProducts.length}/${this.limit}]`);
       
        const mainPage = await context.newPage();
        await mainPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await mainPage.waitForTimeout(1000);

        // Scroll para carregar imagens
        await mainPage.evaluate(async () => {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(r => setTimeout(r, 500));
        });

        const pageData = await mainPage.evaluate(({ minDiscount, maxPrice }) => {
          const cards = document.querySelectorAll('.poly-card, .ui-search-result');
          const products = [];
          cards.forEach(card => {
            try {
              const linkEl = card.querySelector('a');
              if (!linkEl) return;
              const link = linkEl.href.split('?')[0];
              const name = card.querySelector('h2, .poly-component__title')?.innerText || 'Sem nome';
              const img = card.querySelector('img')?.src;
              const discountEl = card.querySelector('.andes-money-amount__discount, .poly-price__disc_label');
              const discount = parseInt(discountEl?.innerText.replace(/\D/g, '') || '0');

              if (discount >= minDiscount) {
                const fractions = Array.from(card.querySelectorAll('.andes-money-amount__fraction'));
                if (fractions.length >= 1) {
                  const currentPrice = parseInt(fractions[fractions.length - 1].innerText.replace(/\./g, ''));
                  const oldPrice = fractions.length > 1 ? parseInt(fractions[0].innerText.replace(/\./g, '')) : Math.round(currentPrice / (1 - discount/100));
                  
                  products.push({ link, name, image: img, discount, currentPrice, oldPrice });
                }
              }
            } catch (e) {}
          });
          return { products };
        }, { minDiscount: this.minDiscount, maxPrice: this.maxPrice });

        await mainPage.close();
        
        const newProducts = pageData.products.filter(p => !this.seenOriginalLinks.has(p.link));
        if (newProducts.length === 0) break;

        await this.processProducts(newProducts, allProducts);

        pageNum++;
        currentOffset += 48;
      }

      await browser.close();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n🏁 FINALIZADO EM ${duration}s | Sucesso: ${this.stats.affiliateLinksSuccess}`);
      return allProducts;

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      if (this.browser) await this.browser.close();
      return allProducts;
    }
  }
}

module.exports = MercadoLivreScraper;