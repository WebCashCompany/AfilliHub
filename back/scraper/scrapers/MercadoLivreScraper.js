/**
 * MERCADO LIVRE SCRAPER - INTEGRAL E PROFISSIONAL
 * @version 3.0.0 - ✅ NOVO: Links de afiliado via API (sem Playwright!)
 */

const { chromium } = require('playwright');
const path = require('path');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoria } = require('../../config/categorias-ml');
const MLSessionManager = require('../../services/ml-session-manager');
const mlAffiliate = require('../../services/MLAffiliateService');
class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.maxPrice = options.maxPrice ? parseInt(options.maxPrice) : null;
    this.categoriaKey = options.categoria || 'todas';
    this.searchTerm = options.searchTerm || null;
    
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
      this.categoriaInfo = getCategoria(this.categoriaKey) || getCategoria('informatica');
    } else {
      this.categoriaInfo = getCategoria('informatica');
    }
    
    try {
      this.sessionManager = new MLSessionManager();
      const activeSessionPath = this.sessionManager.getActiveSessionPath();
      this.sessionPath = activeSessionPath || path.join(process.cwd(), 'ml-session.json');
    } catch (error) {
      this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    }
    
    this.browser = null;
    this.context = null;
  }

  getSearchUrl() {
    if (this.searchTerm) {
      const encodedTerm = encodeURIComponent(this.searchTerm);
      return `https://lista.mercadolivre.com.br/${encodedTerm}`;
    }
    return this.categoriaInfo.url;
  }

  async loadExistingProducts() {
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
        '--disable-blink-features=AutomationControlled'
      ]
    });

    let contextOptions = {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    };

    const fs = require('fs');
    if (fs.existsSync(this.sessionPath)) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(this.sessionPath, 'utf-8'));
        if (sessionData.cookies) contextOptions.storageState = sessionData;
      } catch (error) {}
    }

    this.context = await this.browser.newContext(contextOptions);
    return { browser: this.browser, context: this.context };
  }

  /**
   * ✅ NOVO: Gera link de afiliado via API interna do ML
   * Muito mais rápido que Playwright — sem abrir página, sem clipboard
   * 
   * Se o MLAffiliateService não estiver autenticado, usa fallback
   * para o método antigo via Playwright (compatibilidade garantida)
   */
  async getAffiliateLink(productUrl) {
    // ── Método novo: API interna (instantâneo) ──────────────
    if (mlAffiliate.isAuthenticated()) {
      try {
        const link = await mlAffiliate.generateAffiliateLink(productUrl);
        if (link && link.includes('/sec/')) return link;
      } catch (e) {
        console.warn('⚠️  [Scraper] Falha na API, usando fallback Playwright');
      }
    }

    // ── Fallback: método antigo via Playwright ──────────────
    // Só executa se a API não estiver disponível
    if (!this.context) return productUrl;

    const page = await this.context.newPage();
    try {
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await page.waitForTimeout(1000);

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
        const maxAttempts = isRetry ? 10 : 15;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await page.waitForTimeout(300);
          try {
            copiedLink = await page.evaluate(() => navigator.clipboard.readText());
            if (copiedLink && copiedLink.trim().length > 20 && copiedLink.includes('/sec/')) break;
          } catch (e) {}
        }
        await page.keyboard.press('Escape');
        return copiedLink;
      };

      let copiedLink = await tryGetLink(false);
      if (!copiedLink || !copiedLink.includes('/sec/')) {
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
    // Processa em paralelo em lotes de 5 para maior velocidade
    const BATCH_SIZE = mlAffiliate.isAuthenticated() ? 5 : 1;

    const validProducts = products
      .filter(p => !this.seenLinks.has(p.link))
      .slice(0, this.limit - allProducts.length);

    for (let i = 0; i < validProducts.length; i += BATCH_SIZE) {
      if (allProducts.length >= this.limit) break;

      const batch = validProducts.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(batch.map(async (prodData) => {
        let finalPrice = prodData.currentPrice;
        let couponApplied = false;
        let couponText = '';
        let realDiscount = prodData.discount;

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
          return null;
        }

        this.seenLinks.add(prodData.link);

        const affiliateLink = await this.getAffiliateLink(prodData.link);
        const isAffiliate = affiliateLink.includes('/sec/');

        if (isAffiliate) this.stats.affiliateLinksSuccess++;
        else this.stats.affiliateLinksFailed++;

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

        if (this.onProductCollected) {
          setImmediate(() => {
            try { this.onProductCollected(product, allProducts.length, this.limit); } catch (err) {}
          });
        }

        return product;
      }));

      for (const p of results) {
        if (p && allProducts.length < this.limit) allProducts.push(p);
      }
    }
  }

  async scrapeCategory() {
    await this.loadExistingProducts();

    // Só abre browser se precisar do fallback Playwright
    if (!mlAffiliate.isAuthenticated()) {
      console.log('⚠️  [Scraper] MLAffiliateService não autenticado — usando Playwright como fallback');
      console.log('💡 Acesse GET /api/ml/auth para autenticar e ganhar velocidade máxima!\n');
      await this.createBrowserContext();
    } else {
      console.log('⚡ [Scraper] MLAffiliateService autenticado — modo RÁPIDO ativado!\n');
      // Ainda abre browser só para scraping das páginas de lista
      await this.createBrowserContext();
    }

    let allProducts = [];
    let pageNum = 1;
    let currentOffset = 0;

    try {
      while (allProducts.length < this.limit && pageNum <= 15) {
        const baseUrl = this.getSearchUrl();
        const url = pageNum === 1 ? baseUrl : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_Desde_${currentOffset + 1}`;
        
        const mainPage = await this.context.newPage();
        
        try {
          await mainPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch (e) {
          console.warn(`⚠️  Timeout na página ${pageNum}, encerrando coleta`);
          await mainPage.close();
          break;
        }

        await mainPage.waitForTimeout(1000);

        await mainPage.evaluate(async () => {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(r => setTimeout(r, 500));
        });

        const pageData = await mainPage.evaluate(({ minDiscount }) => {
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
                let currentPrice = 0;
                const currentPriceContainer = card.querySelector('.poly-price__current');
                if (currentPriceContainer) {
                  const currentFractions = Array.from(currentPriceContainer.querySelectorAll('.andes-money-amount__fraction'));
                  if (currentFractions.length > 0) {
                    currentPrice = parseInt(currentFractions[0].innerText.replace(/\./g, '').replace(/\D/g, ''));
                  }
                }
                
                if (!currentPrice) {
                  const fractions = Array.from(card.querySelectorAll('.andes-money-amount__fraction'));
                  if (fractions.length >= 1) currentPrice = parseInt(fractions[fractions.length - 1].innerText.replace(/\./g, ''));
                }

                let oldPrice = 0;
                const oldPriceEl = card.querySelector('.andes-money-amount--previous .andes-money-amount__fraction');
                if (oldPriceEl) {
                  oldPrice = parseInt(oldPriceEl.innerText.replace(/\./g, '').replace(/\D/g, ''));
                } else if (currentPrice) {
                  oldPrice = Math.round(currentPrice / (1 - discount/100));
                }
                
                if (currentPrice > 0 && oldPrice > currentPrice) {
                  products.push({ link, name, image: img, discount, currentPrice, oldPrice });
                }
              }
            } catch (e) {}
          });
          return { products };
        }, { minDiscount: this.minDiscount });

        await mainPage.close();
        
        const newProducts = pageData.products.filter(p => !this.seenOriginalLinks.has(p.link));
        if (newProducts.length === 0) break;

        await this.processProducts(newProducts, allProducts);

        pageNum++;
        currentOffset += 48;
      }

      if (this.browser) await this.browser.close();
      return allProducts;

    } catch (error) {
      if (this.browser) await this.browser.close();
      return allProducts;
    }
  }
}

module.exports = MercadoLivreScraper;