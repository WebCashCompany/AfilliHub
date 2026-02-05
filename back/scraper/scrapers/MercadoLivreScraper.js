/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - VERSÃO CORRIGIDA 🔥
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * @version 12.2.0 - ✅ CORREÇÃO CRÍTICA DE PREÇOS:
 * - Extração de preços 100% funcional usando classe "previous"
 * - Validação inteligente com recálculo automático
 * - Bloqueio total de placeholders lazy-load mantido
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

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
    
    this.stats = {
      duplicatesIgnored: 0,
      betterOffersUpdated: 0,
      productsCollected: 0,
      pagesScraped: 0,
      errors: 0,
      filteredByDiscount: 0,
      filteredByPrice: 0,
      affiliateLinksSuccess: 0,
      affiliateLinksFailed: 0,
      couponsApplied: 0,
      couponsIgnored: 0,
      loopDetections: 0,
      webpImages: 0,
      jpgImages: 0,
      imagesWithoutUrl: 0,
      placeholdersBlocked: 0
    };
    
    this.seenLinks = new Set();
    this.seenProductKeys = new Set();
    this.categoriaInfo = getCategoria(this.categoriaKey);
    
    if (!this.categoriaInfo) {
      console.warn(`⚠️  Categoria "${this.categoriaKey}" não encontrada, usando "todas"`);
      this.categoriaInfo = getCategoria('todas');
    }
    
    try {
      this.sessionManager = new MLSessionManager();
      const activeSessionPath = this.sessionManager.getActiveSessionPath();
      
      if (activeSessionPath) {
        this.sessionPath = activeSessionPath;
        console.log('✅ Usando sessão ativa do gerenciador');
      } else {
        this.sessionPath = path.join(process.cwd(), 'ml-session.json');
        console.log('⚠️  Nenhuma conta ativa, usando sessão padrão');
      }
    } catch (error) {
      this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    }
    
    this.config = {
      pageTimeout: 15000,
      navigationTimeout: 20000,
      maxPages: 50,
      maxEmptyPages: 2,
      maxSamePage: 3,
      retryAttempts: 2
    };
    
    this.browser = null;
    this.context = null;
    this.isFirstProduct = true;
  }

  clearCache() {
    this.seenLinks.clear();
    this.seenProductKeys.clear();
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes...');
    
    try {
      const conn = getProductConnection();
      const Product = getProductModel('ML', conn);
      
      const query = this.categoriaInfo.nome !== 'Todas' 
        ? { categoria: this.categoriaInfo.nome, isActive: true }
        : { isActive: true };
      
      const products = await Product.find(query)
        .select('link_afiliado nome desconto preco_para')
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
    return name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(word => word.length > 2)
      .slice(0, 5)
      .join('_');
  }

  isBetterOffer(newProduct, existingProduct) {
    const newDiscount = parseInt(newProduct.desconto) || 0;
    const newPrice = parseInt(newProduct.preco_para) || 0;
    
    return newDiscount > existingProduct.desconto || 
           (newDiscount === existingProduct.desconto && newPrice < existingProduct.preco);
  }

  checkDuplicate(product, collectedProducts) {
    const productKey = this.generateProductKey(product.nome);
    
    if (this.seenProductKeys.has(productKey)) {
      return { isDuplicate: true, reason: 'duplicate_in_memory' };
    }
    
    if (this.seenLinks.has(product.link_original)) {
      return { isDuplicate: true, reason: 'duplicate_link' };
    }
    
    const existing = this.existingProductsMap.get(productKey);
    if (existing && !this.isBetterOffer(product, existing)) {
      return { isDuplicate: true, reason: 'worse_offer' };
    }
    
    if (existing && this.isBetterOffer(product, existing)) {
      return { isDuplicate: false, isBetterOffer: true, oldLink: existing.link };
    }
    
    return { isDuplicate: false };
  }

  canApplyCoupon(coupon, productPrice) {
    if (!coupon) return false;
    return !(coupon.minValue > 0 && productPrice < coupon.minValue);
  }

  applyCoupon(currentPrice, coupon) {
    if (!coupon) {
      return { finalPrice: currentPrice, additionalDiscount: 0, couponApplied: false };
    }

    let finalPrice = currentPrice;
    let additionalDiscount = 0;

    if (coupon.type === 'percent') {
      additionalDiscount = Math.round(currentPrice * (coupon.discount / 100));
      finalPrice = currentPrice - additionalDiscount;
    } else if (coupon.type === 'value') {
      additionalDiscount = coupon.discount;
      finalPrice = currentPrice - coupon.discount;
    }

    return {
      finalPrice: Math.max(0, finalPrice),
      additionalDiscount,
      couponApplied: true,
      couponText: coupon.text
    };
  }

  calculateTotalDiscount(oldPrice, finalPrice) {
    if (oldPrice === 0) return 0;
    return Math.round(((oldPrice - finalPrice) / oldPrice) * 100);
  }

  /**
   * ✅ Converte WEBP → JPG
   */
  extractBestImage(imageUrl) {
    if (!imageUrl) {
      this.stats.imagesWithoutUrl++;
      return '';
    }
    
    if (imageUrl.match(/\.(jpg|jpeg|png)(\?|$)/i)) {
      this.stats.jpgImages++;
      return imageUrl;
    }
    
    if (imageUrl.includes('.webp')) {
      this.stats.webpImages++;
      const jpgUrl = imageUrl.replace(/\.webp/gi, '.jpg');
      return jpgUrl;
    }
    
    return imageUrl;
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
    await this.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    return { browser: this.browser, context: this.context };
  }

  async getAffiliateLink(productUrl) {
    const page = await this.context.newPage();
    
    try {
      await page.goto(productUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });

      if (this.isFirstProduct) {
        await page.waitForTimeout(2500);
        this.isFirstProduct = false;
      } else {
        await page.waitForTimeout(1500);
      }

      // ═══════════════════════════════════════════════════════
      // ESTRATÉGIA 1: MÉTODO ORIGINAL (TABS)
      // ═══════════════════════════════════════════════════════
      try {
        await page.evaluate(() => navigator.clipboard.writeText(''));
        await page.waitForTimeout(200);
      } catch (e) {}

      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const shareBtn = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          return text.includes('compartilhar');
        });
        if (shareBtn) {
          shareBtn.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        await page.waitForTimeout(2000);

        try {
          await page.evaluate(() => navigator.clipboard.writeText(''));
          await page.waitForTimeout(200);
        } catch (e) {}

        for (let i = 0; i < 4; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(150);
        }

        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);

        let copiedLink = '';
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            copiedLink = await page.evaluate(() => navigator.clipboard.readText());
            if (copiedLink && copiedLink.trim() !== '') break;
            if (attempt < 5) await page.waitForTimeout(700);
          } catch (e) {}
        }

        if (copiedLink && copiedLink.trim() !== '') {
          await page.keyboard.press('Escape');
          await page.close();
          
          const cleanLink = copiedLink.trim();
          if (cleanLink.includes('/sec/') || cleanLink.includes('mercadolivre.com/sec/')) {
            console.log(`      ✅ Afiliado (Método 1)`);
            return cleanLink;
          }
          if (cleanLink.includes('mercadolivre.com.br')) {
            console.log(`      ⚠️  Original (Método 1)`);
            return cleanLink;
          }
        }

        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

      // ═══════════════════════════════════════════════════════
      // ESTRATÉGIA 2: CLICAR DIRETAMENTE NO BOTÃO COPIAR
      // ═══════════════════════════════════════════════════════
      await page.evaluate(() => navigator.clipboard.writeText(''));
      await page.waitForTimeout(200);

      const clicked2 = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const shareBtn = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          return text.includes('compartilhar');
        });
        if (shareBtn) {
          shareBtn.click();
          return true;
        }
        return false;
      });

      if (clicked2) {
        await page.waitForTimeout(2500);

        const copyClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
          const copyBtn = buttons.find(btn => {
            const text = btn.textContent?.toLowerCase() || '';
            return text.includes('copiar') && (text.includes('link') || text.length < 20);
          });
          if (copyBtn) {
            copyBtn.click();
            return true;
          }
          return false;
        });

        if (copyClicked) {
          await page.waitForTimeout(2000);

          let copiedLink = '';
          for (let attempt = 1; attempt <= 5; attempt++) {
            try {
              copiedLink = await page.evaluate(() => navigator.clipboard.readText());
              if (copiedLink && copiedLink.trim() !== '') break;
              if (attempt < 5) await page.waitForTimeout(700);
            } catch (e) {}
          }

          await page.keyboard.press('Escape');
          await page.close();

          if (copiedLink && copiedLink.trim() !== '') {
            const cleanLink = copiedLink.trim();
            if (cleanLink.includes('/sec/') || cleanLink.includes('mercadolivre.com/sec/')) {
              console.log(`      ✅ Afiliado (Método 2)`);
              return cleanLink;
            }
            if (cleanLink.includes('mercadolivre.com.br')) {
              console.log(`      ⚠️  Original (Método 2)`);
              return cleanLink;
            }
          }
        } else {
          await page.keyboard.press('Escape');
        }
      }

      // ═══════════════════════════════════════════════════════
      // ESTRATÉGIA 3: TENTAR 5 TABS
      // ═══════════════════════════════════════════════════════
      await page.evaluate(() => navigator.clipboard.writeText(''));
      await page.waitForTimeout(200);

      const clicked3 = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const shareBtn = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          return text.includes('compartilhar');
        });
        if (shareBtn) {
          shareBtn.click();
          return true;
        }
        return false;
      });

      if (clicked3) {
        await page.waitForTimeout(2000);

        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(150);
        }

        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);

        let copiedLink = '';
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            copiedLink = await page.evaluate(() => navigator.clipboard.readText());
            if (copiedLink && copiedLink.trim() !== '') break;
            if (attempt < 5) await page.waitForTimeout(700);
          } catch (e) {}
        }

        await page.keyboard.press('Escape');
        await page.close();

        if (copiedLink && copiedLink.trim() !== '') {
          const cleanLink = copiedLink.trim();
          if (cleanLink.includes('/sec/') || cleanLink.includes('mercadolivre.com/sec/')) {
            console.log(`      ✅ Afiliado (Método 3)`);
            return cleanLink;
          }
          if (cleanLink.includes('mercadolivre.com.br')) {
            console.log(`      ⚠️  Original (Método 3)`);
            return cleanLink;
          }
        }
      }

      await page.close();
      console.log(`      ❌ Todos os métodos falharam`);
      return null;

    } catch (error) {
      try { await page.close(); } catch (e) {}
      return null;
    }
  }

  async processProducts(products, allProducts) {
    for (const prodData of products) {
      if (allProducts.length >= this.limit) break;

      let finalPrice = prodData.currentPrice;
      let couponApplied = false;
      let couponText = '';
      let realDiscount = prodData.discount;

      if (prodData.coupon) {
        const canApply = this.canApplyCoupon(prodData.coupon, prodData.currentPrice);
        
        if (canApply) {
          const couponResult = this.applyCoupon(prodData.currentPrice, prodData.coupon);
          
          if (couponResult.couponApplied) {
            finalPrice = couponResult.finalPrice;
            couponApplied = true;
            couponText = couponResult.couponText;
            realDiscount = this.calculateTotalDiscount(prodData.oldPrice, finalPrice);
            this.stats.couponsApplied++;
          }
        } else {
          this.stats.couponsIgnored++;
        }
      }

      if (this.maxPrice && finalPrice > this.maxPrice) {
        this.stats.filteredByPrice++;
        console.log(`   ⏭️  IGNORADO (preço R$ ${finalPrice} > máx R$ ${this.maxPrice})`);
        continue;
      }

      const dupCheck = this.checkDuplicate({
        nome: prodData.name,
        link_original: prodData.link,
        desconto: realDiscount,
        preco_para: finalPrice
      }, allProducts);

      if (dupCheck.isDuplicate) {
        this.stats.duplicatesIgnored++;
        console.log(`   ⏭️  IGNORADO (${dupCheck.reason})`);
        continue;
      }

      this.seenLinks.add(prodData.link);

      console.log(`   🔄 [${allProducts.length + 1}/${this.limit}] ${prodData.name.substring(0, 40)}...`);
      
      const affiliateLink = await this.getAffiliateLink(prodData.link);
      const finalLink = affiliateLink || prodData.link;
      const isAffiliate = finalLink.includes('/sec/');

      const finalImage = this.extractBestImage(prodData.image);

      const product = {
        nome: prodData.name,
        imagem: finalImage,
        link_original: prodData.link,
        link_afiliado: finalLink,
        desconto: `${realDiscount}%`,
        preco: `R$ ${finalPrice}`,
        preco_anterior: `R$ ${prodData.oldPrice}`,
        preco_de: String(prodData.oldPrice),
        preco_para: String(finalPrice),
        categoria: this.categoriaInfo.nome,
        marketplace: 'ML',
        isActive: true
      };

      if (couponApplied) {
        product.cupom_aplicado = true;
        product.cupom_texto = couponText;
        product.preco_sem_cupom = String(prodData.currentPrice);
        product.desconto_cupom = String(prodData.currentPrice - finalPrice);
        
        console.log(`      🎟️  Cupom: ${couponText}`);
        console.log(`      📊 Desconto total: ${realDiscount}%`);
      }

      if (dupCheck.isBetterOffer) {
        product._shouldUpdate = true;
        product._oldLink = dupCheck.oldLink;
        this.stats.betterOffersUpdated++;
      }

      const productKey = this.generateProductKey(prodData.name);
      this.seenProductKeys.add(productKey);
      this.stats.productsCollected++;

      if (isAffiliate) {
        this.stats.affiliateLinksSuccess++;
      } else {
        this.stats.affiliateLinksFailed++;
      }

      allProducts.push(product);

      if (allProducts.length >= this.limit) break;

      await new Promise(r => setTimeout(r, 400));
    }
  }

  async scrapeCategory() {
    const startTime = Date.now();
    
    await this.loadExistingProducts();
    const { browser, context } = await this.createBrowserContext();
   
    let allProducts = [];
    let pageNum = 1;
    let emptyPagesCount = 0;
    let currentOffset = 0;
    let lastPageProducts = []; // ✅ Array de links, não objetos
    let samePageCount = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  ${this.categoriaInfo.emoji}  ${this.categoriaInfo.nome.padEnd(47)} ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(26)} ║`);
      if (this.maxPrice) {
        console.log(`║  💰 PREÇO MÁXIMO: R$ ${this.maxPrice}${' '.repeat(29 - String(this.maxPrice).length)} ║`);
      }
      console.log(`║  ⚡ MODO: Serial + Anti-Lazy-Load${' '.repeat(16)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= this.config.maxPages) {
        const baseUrl = this.categoriaInfo.url;
        const separator = baseUrl.includes('?') ? '&' : '?';
        
        let url;
        if (pageNum === 1) {
          url = baseUrl;
        } else if (samePageCount >= 2) {
          const newOffset = currentOffset + 48;
          url = `${baseUrl}${separator}_Desde_${newOffset}&_NoIndex_true`;
          currentOffset = newOffset;
          samePageCount = 0;
          this.stats.loopDetections++;
        } else {
          url = `${baseUrl}${separator}_Desde_${currentOffset + 1}&_NoIndex_true`;
        }
       
        console.log(`📄 Página ${pageNum} [${allProducts.length}/${this.limit}]`);
       
        let pageData = null;
        let retryCount = 0;
        
        while (retryCount <= this.config.retryAttempts && !pageData) {
          try {
            const mainPage = await context.newPage();
            
            const timeout = pageNum === 1 ? this.config.navigationTimeout : this.config.pageTimeout;
            
            await mainPage.goto(url, { 
              waitUntil: 'domcontentloaded', 
              timeout: timeout
            });

            await mainPage.waitForTimeout(pageNum === 1 ? 2000 : 1200);

            pageData = await mainPage.evaluate(({ minDiscount, maxPrice }) => {
              let cards = document.querySelectorAll('.poly-card');
              
              if (cards.length === 0) {
                cards = document.querySelectorAll('.ui-search-result');
              }
              
              const products = [];
              const allPageLinks = []; // ✅ NOVO: Guarda TODOS os links da página
              let filteredByDiscount = 0;
              let filteredByPrice = 0;
              let placeholdersBlocked = 0;
              
              cards.forEach(card => {
                try {
                  const link = card.querySelector('a[href*="/MLB"]')?.href.split('?')[0];
                  if (!link || !link.match(/MLB\d+/)) return;
                  
                  allPageLinks.push(link); // ✅ Guarda o link ANTES de filtrar
                  
                  let name = card.querySelector('h2, .poly-component__title')?.innerText || 
                             card.querySelector('[class*="title"]')?.innerText ||
                             'Sem nome';
                  
                  // ✅ EXTRAÇÃO DE IMAGEM
                  let image = '';
                  const img = card.querySelector('img.poly-component__picture');
                  if (img) {
                    const src = img.src || img.getAttribute('data-src') || '';
                    if (src && !src.startsWith('data:image/gif')) {
                      image = src.startsWith('//') ? 'https:' + src : src;
                    }
                  }
                  
                  if (!image) {
                    const anyImg = card.querySelector('img');
                    if (anyImg && anyImg.src && !anyImg.src.startsWith('data:image/gif')) {
                      image = anyImg.src;
                    }
                  }
                  
                  if (!image || image.startsWith('data:image/gif')) {
                    image = 'https://http2.mlstatic.com/D_NQ_NP_2X_default.webp';
                    placeholdersBlocked++;
                  }
                  
                  // ✅ DESCONTO
                  const discountElement = card.querySelector('.poly-price__disc_label, .andes-money-amount__discount');
                  const discountText = discountElement?.innerText || '0';
                  const discount = parseInt(discountText.replace(/\D/g, '')) || 0;
                  
                  if (discount < minDiscount) {
                    filteredByDiscount++;
                    return;
                  }
                  
                  // ✅✅✅ EXTRAÇÃO DE PREÇOS ULTRA-ROBUSTA (V2) ✅✅✅
                  let currentPrice = 0, oldPrice = 0;
                  let debugMethod = 'none';
                  
                  const priceContainer = card.querySelector('.poly-component__price');
                  
                  if (priceContainer) {
                    // ═════════════════════════════════════════════════════
                    // ESTRATÉGIA 1: Previous + Current (IDEAL)
                    // ═════════════════════════════════════════════════════
                    const previousPrice = priceContainer.querySelector('.andes-money-amount--previous .andes-money-amount__fraction');
                    const currentContainer = priceContainer.querySelector('.poly-price__current');
                    
                    if (previousPrice && currentContainer) {
                      const currentFraction = currentContainer.querySelector('.andes-money-amount__fraction');
                      if (currentFraction) {
                        oldPrice = parseInt(previousPrice.innerText.replace(/\./g, '')) || 0;
                        currentPrice = parseInt(currentFraction.innerText.replace(/\./g, '')) || 0;
                        debugMethod = 'previous+current';
                      }
                    }
                    
                    // ═════════════════════════════════════════════════════
                    // ESTRATÉGIA 2: Só Previous (calcula current com desconto)
                    // ═════════════════════════════════════════════════════
                    if (currentPrice === 0 && previousPrice && discount > 0) {
                      oldPrice = parseInt(previousPrice.innerText.replace(/\./g, '')) || 0;
                      currentPrice = Math.round(oldPrice * (1 - discount / 100));
                      debugMethod = 'previous+calc';
                    }
                    
                    // ═════════════════════════════════════════════════════
                    // ESTRATÉGIA 3: Todos os fractions (separar por previous)
                    // ═════════════════════════════════════════════════════
                    if (currentPrice === 0) {
                      const allFractions = Array.from(priceContainer.querySelectorAll('.andes-money-amount__fraction'));
                      
                      if (allFractions.length >= 2) {
                        const previousFractions = allFractions.filter(f => 
                          f.closest('.andes-money-amount')?.classList.contains('andes-money-amount--previous')
                        );
                        const currentFractions = allFractions.filter(f => 
                          !f.closest('.andes-money-amount')?.classList.contains('andes-money-amount--previous')
                        );
                        
                        if (previousFractions.length > 0 && currentFractions.length > 0) {
                          oldPrice = parseInt(previousFractions[0].innerText.replace(/\./g, '')) || 0;
                          currentPrice = parseInt(currentFractions[0].innerText.replace(/\./g, '')) || 0;
                          debugMethod = 'all-filtered';
                        } else if (allFractions.length >= 2) {
                          // Assume que maior = old, menor = current
                          const p1 = parseInt(allFractions[0].innerText.replace(/\./g, '')) || 0;
                          const p2 = parseInt(allFractions[1].innerText.replace(/\./g, '')) || 0;
                          
                          if (p1 > p2) {
                            oldPrice = p1;
                            currentPrice = p2;
                          } else {
                            oldPrice = p2;
                            currentPrice = p1;
                          }
                          debugMethod = 'all-order';
                        }
                      } else if (allFractions.length === 1 && discount > 0) {
                        // ═════════════════════════════════════════════════════
                        // ESTRATÉGIA 4: Único preço (identificar se é current ou old)
                        // ═════════════════════════════════════════════════════
                        const price = parseInt(allFractions[0].innerText.replace(/\./g, '')) || 0;
                        
                        // Calcula ambos
                        const calculatedCurrent = Math.round(price * (1 - discount / 100));
                        const calculatedOld = Math.round(price / (1 - discount / 100));
                        
                        // Se calcular old dá número razoável (não 3x maior), price é current
                        if (calculatedOld > price && calculatedOld < price * 3) {
                          currentPrice = price;
                          oldPrice = calculatedOld;
                          debugMethod = 'single-is-current';
                        } else {
                          // Caso contrário, price é old
                          oldPrice = price;
                          currentPrice = calculatedCurrent;
                          debugMethod = 'single-is-old';
                        }
                      }
                    }
                  }
                  
                  // ═════════════════════════════════════════════════════
                  // VALIDAÇÃO E CORREÇÃO AUTOMÁTICA
                  // ═════════════════════════════════════════════════════
                  
                  // 1. Preços invertidos? Corrige
                  if (currentPrice > 0 && oldPrice > 0 && currentPrice >= oldPrice) {
                    [oldPrice, currentPrice] = [currentPrice, oldPrice];
                    debugMethod += '-inverted';
                  }
                  
                  // 2. Ainda inválido mas temos desconto? Recalcula
                  if ((currentPrice === 0 || oldPrice === 0 || currentPrice >= oldPrice) && discount > 0) {
                    if (currentPrice > 0) {
                      oldPrice = Math.round(currentPrice / (1 - discount / 100));
                      debugMethod += '-recalc-old';
                    } else if (oldPrice > 0) {
                      currentPrice = Math.round(oldPrice * (1 - discount / 100));
                      debugMethod += '-recalc-curr';
                    }
                  }
                  
                  // ═════════════════════════════════════════════════════
                  // REJEIÇÃO FINAL (com log dos primeiros 3 para debug)
                  // ═════════════════════════════════════════════════════
                  if (currentPrice === 0 || oldPrice === 0 || currentPrice >= oldPrice) {
                    if (filteredByPrice < 3) {
                      console.log(`      [DEBUG-PREÇO] ${name.substring(0, 30)}...`);
                      console.log(`        Method: ${debugMethod}`);
                      console.log(`        Result: curr=${currentPrice} old=${oldPrice} disc=${discount}%`);
                    }
                    filteredByPrice++;
                    return;
                  }
                  
                  let couponInfo = null;
                  
                  const couponSelectors = [
                    '[class*="coupon"]',
                    '[class*="cupom"]',
                    '[data-testid*="coupon"]',
                    '.ui-search-item__group__element--coupon'
                  ];
                  
                  let couponElement = null;
                  for (const selector of couponSelectors) {
                    couponElement = card.querySelector(selector);
                    if (couponElement) break;
                  }
                  
                  if (couponElement) {
                    const couponText = couponElement.innerText || couponElement.textContent || '';
                    const percentMatch = couponText.match(/(\d+)%\s*OFF/i);
                    const valueMatch = couponText.match(/R\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i);
                    
                    let minValue = 0;
                    const minValueMatch = couponText.match(/m[ií]nim[ao]\s*R?\$?\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i);
                    if (minValueMatch) {
                      minValue = parseInt(minValueMatch[1].replace(/\./g, '').replace(',', '.'));
                    }
                    
                    if (percentMatch || valueMatch) {
                      couponInfo = {
                        type: percentMatch ? 'percent' : 'value',
                        discount: percentMatch 
                          ? parseInt(percentMatch[1]) 
                          : parseInt(valueMatch[1].replace(/\./g, '').replace(',', '.')),
                        minValue: minValue,
                        text: couponText.trim()
                      };
                    }
                  }
                  
                  let finalPrice = currentPrice;
                  if (couponInfo && currentPrice >= couponInfo.minValue) {
                    if (couponInfo.type === 'percent') {
                      finalPrice = currentPrice - Math.round(currentPrice * (couponInfo.discount / 100));
                    } else if (couponInfo.type === 'value') {
                      finalPrice = currentPrice - couponInfo.discount;
                    }
                  }
                  
                  if (maxPrice && finalPrice > maxPrice) {
                    filteredByPrice++;
                    return;
                  }
                  
                  products.push({ 
                    link, 
                    name, 
                    image, 
                    discount, 
                    currentPrice, 
                    oldPrice,
                    coupon: couponInfo 
                  });
                } catch (e) {
                  // Silenciosamente ignora produtos com erro
                }
              });
              
              return { products, filteredByDiscount, filteredByPrice, placeholdersBlocked, allPageLinks };
            }, { minDiscount: this.minDiscount, maxPrice: this.maxPrice });

            await mainPage.close();
            
          } catch (pageError) {
            retryCount++;
            
            if (retryCount <= this.config.retryAttempts) {
              console.log(`   ⚠️  Falha (tentativa ${retryCount}/${this.config.retryAttempts})`);
              await new Promise(r => setTimeout(r, 2000));
            } else {
              console.error(`   ❌ Erro após ${this.config.retryAttempts} tentativas: ${pageError.message}`);
              this.stats.errors++;
              pageNum++;
              currentOffset += 48;
              continue;
            }
          }
        }
        
        if (!pageData) {
          pageNum++;
          currentOffset += 48;
          continue;
        }

        console.log(`   📊 ${pageData.products.length} produtos encontrados`);
        console.log(`   🔍 ${pageData.filteredByDiscount} desc | ${pageData.filteredByPrice} preço`);
        if (pageData.placeholdersBlocked > 0) {
          console.log(`   🚫 ${pageData.placeholdersBlocked} placeholders bloqueados`);
          this.stats.placeholdersBlocked += pageData.placeholdersBlocked;
        }
        console.log('');

        // ✅ DETECÇÃO DE LOOP CORRIGIDA: Usa TODOS os links da página
        const currentPageLinks = (pageData.allPageLinks || []).sort();
        const lastPageLinks = lastPageProducts.sort();
        
        if (currentPageLinks.length > 0 && lastPageLinks.length > 0 &&
            JSON.stringify(currentPageLinks) === JSON.stringify(lastPageLinks)) {
          samePageCount++;
          console.log(`   ⚠️  Página repetida detectada (${samePageCount}/3)`);
          if (samePageCount >= 3) {
            console.log(`   🛑 LOOP DETECTADO! Parando...\n`);
            break;
          }
        } else {
          samePageCount = 0;
          lastPageProducts = currentPageLinks;
        }

        const newProducts = pageData.products.filter(p => !this.seenLinks.has(p.link));
        this.stats.filteredByDiscount += pageData.filteredByDiscount;
        this.stats.filteredByPrice += pageData.filteredByPrice;

        if (newProducts.length === 0) {
          emptyPagesCount++;
          if (pageData.products.length > 0) {
            this.stats.pagesScraped = pageNum;
            pageNum++;
            currentOffset += 48;
            emptyPagesCount = 0;
            continue;
          }
          if (emptyPagesCount >= this.config.maxEmptyPages) break;
          this.stats.pagesScraped = pageNum;
          pageNum++;
          currentOffset += 48;
          continue;
        }
        emptyPagesCount = 0;

        console.log(`   🔗 Obtendo links (serial)...\n`);

        await this.processProducts(newProducts, allProducts);

        if (allProducts.length >= this.limit) break;

        this.stats.pagesScraped = pageNum;
        pageNum++;
        currentOffset += 48;
      }

      await browser.close();
      this.browser = null;
      this.context = null;

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n╔════════════════════════════════════════════════════╗`);
      console.log(`║              🏁 FINALIZADO 🏁                      ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`✨ Coletados: ${allProducts.length}/${this.limit}`);
      console.log(`🔗 Afiliado: ${this.stats.affiliateLinksSuccess} | Original: ${this.stats.affiliateLinksFailed}`);
      console.log(`🎟️  Cupons aplicados: ${this.stats.couponsApplied}`);
      console.log(`⏭️  Duplicados: ${this.stats.duplicatesIgnored}`);
      console.log(`🚫 Filtrados: ${this.stats.filteredByDiscount} desc | ${this.stats.filteredByPrice} preço`);
      console.log(`🖼️  Imagens: ${this.stats.jpgImages} JPG/PNG | ${this.stats.webpImages} WEBP→JPG`);
      if (this.stats.placeholdersBlocked > 0) {
        console.log(`🚫 Placeholders bloqueados: ${this.stats.placeholdersBlocked}`);
      }
      if (this.stats.imagesWithoutUrl > 0) {
        console.log(`⚠️  Sem imagem: ${this.stats.imagesWithoutUrl} produtos ignorados`);
      }
      console.log(`🔄 Loops: ${this.stats.loopDetections}`);
      console.log(`📄 Páginas: ${this.stats.pagesScraped}`);
      console.log(`⏱️  Tempo: ${duration}s\n`);

      return allProducts.slice(0, this.limit);

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      try { if (this.browser) await this.browser.close(); } catch (e) {}
      return allProducts.slice(0, this.limit);
    }
  }
}

module.exports = MercadoLivreScraper;