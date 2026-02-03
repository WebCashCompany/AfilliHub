/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - VERSÃO COM SUPORTE INTELIGENTE A CUPONS
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * @version 9.0.0 - NOVO: Detecção e aplicação automática de cupons
 * 
 * FUNCIONALIDADES DE CUPOM:
 * - Detecta cupons no anúncio
 * - Valida valor mínimo de compra
 * - Aplica desconto automaticamente no preço final
 * - Calcula desconto real (desconto padrão + cupom)
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
    this.maxPrice = options.maxPrice || null;
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
      timeouts: 0,
      couponsApplied: 0,        // ✨ NOVO
      couponsIgnored: 0         // ✨ NOVO
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
        
        const activeAccount = this.sessionManager.getActiveAccount();
        if (activeAccount) {
          console.log(`   📧 Conta: ${activeAccount.name} (${activeAccount.email})`);
          console.log(`   📊 Status: ${activeAccount.status}`);
        }
      } else {
        this.sessionPath = path.join(process.cwd(), 'ml-session.json');
        console.log('⚠️  Nenhuma conta ativa, usando sessão padrão');
        console.log('💡 Configure contas via interface: /configuracoes/conexoes');
      }
    } catch (error) {
      this.sessionPath = path.join(process.cwd(), 'ml-session.json');
      console.log('⚠️  Session Manager não disponível, usando método legado');
    }
    
    this.config = {
      pageTimeout: 10000,
      maxPages: 50,
      maxEmptyPages: 2,
      parallelTabs: 1
    };
    
    this.browser = null;
    this.context = null;
    this.isFirstProduct = true;
  }

  clearCache() {
    this.seenLinks.clear();
    this.seenProductKeys.clear();
    console.log('🧹 Cache limpo');
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
      console.log('   ⚠️  Continuando sem cache do banco\n');
      this.existingProductsMap = new Map();
    }
  }

  generateProductKey(name) {
    return name
      .toLowerCase()
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

  // ═══════════════════════════════════════════════════════════════════════
  // 🎟️ SISTEMA INTELIGENTE DE CUPONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Valida se o cupom pode ser aplicado ao produto
   * @param {Object} coupon - Informações do cupom
   * @param {number} productPrice - Preço atual do produto
   * @returns {boolean} True se o cupom pode ser aplicado
   */
  canApplyCoupon(coupon, productPrice) {
    if (!coupon) return false;
    
    // Verifica valor mínimo
    if (coupon.minValue > 0 && productPrice < coupon.minValue) {
      return false;
    }
    
    return true;
  }

  /**
   * Calcula o preço final após aplicar o cupom
   * @param {number} currentPrice - Preço atual
   * @param {Object} coupon - Informações do cupom
   * @returns {Object} Preço final e desconto adicional
   */
  applyCoupon(currentPrice, coupon) {
    if (!coupon) {
      return { 
        finalPrice: currentPrice, 
        additionalDiscount: 0,
        couponApplied: false
      };
    }

    let finalPrice = currentPrice;
    let additionalDiscount = 0;

    if (coupon.type === 'percent') {
      // Cupom percentual (ex: 5% OFF)
      additionalDiscount = Math.round(currentPrice * (coupon.discount / 100));
      finalPrice = currentPrice - additionalDiscount;
    } else if (coupon.type === 'value') {
      // Cupom de valor fixo (ex: R$ 20 OFF)
      additionalDiscount = coupon.discount;
      finalPrice = currentPrice - coupon.discount;
    }

    // Garante que o preço não fique negativo
    finalPrice = Math.max(0, finalPrice);

    return {
      finalPrice,
      additionalDiscount,
      couponApplied: true,
      couponText: coupon.text
    };
  }

  /**
   * Calcula o desconto total real (desconto padrão + cupom)
   * @param {number} oldPrice - Preço original
   * @param {number} finalPrice - Preço final após cupom
   * @returns {number} Desconto total em porcentagem
   */
  calculateTotalDiscount(oldPrice, finalPrice) {
    if (oldPrice === 0) return 0;
    return Math.round(((oldPrice - finalPrice) / oldPrice) * 100);
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
        '--disable-gpu'
      ]
    });

    let contextOptions = {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
        console.log('   ⚠️  Erro ao carregar sessão, usando nova\n');
      }
    } else {
      console.log('   ⚠️  Arquivo de sessão não encontrado\n');
      console.log('   💡 Configure uma conta via interface: /configuracoes/conexoes\n');
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
        timeout: this.config.pageTimeout
      });

      if (this.isFirstProduct) {
        await page.waitForTimeout(2500);
        this.isFirstProduct = false;
      } else {
        await page.waitForTimeout(1500);
      }

      try {
        await page.evaluate(() => navigator.clipboard.writeText(''));
        await page.waitForTimeout(300);
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

      if (!clicked) {
        console.log(`      ⚠️  Botão compartilhar não encontrado`);
        await page.close();
        return null;
      }

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
      await page.waitForTimeout(1500);

      let copiedLink = '';
      try {
        copiedLink = await page.evaluate(() => navigator.clipboard.readText());
      } catch (e) {
        console.log(`      ❌ Erro ao ler clipboard: ${e.message}`);
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.close();

      if (!copiedLink || copiedLink.trim() === '') {
        console.log(`      ⚠️  Clipboard vazio`);
        return null;
      }

      const cleanLink = copiedLink.trim();

      if (cleanLink.includes('/sec/') || cleanLink.includes('mercadolivre.com/sec/')) {
        console.log(`      ✅ Afiliado`);
        return cleanLink;
      }

      if (cleanLink.includes('mercadolivre.com.br') || cleanLink.includes('mercadolibre.com')) {
        console.log(`      ✅ Link ML válido`);
        return cleanLink;
      }

      console.log(`      ⚠️  Link inválido: ${cleanLink.substring(0, 50)}...`);
      return null;

    } catch (error) {
      console.log(`      ❌ Erro: ${error.message}`);
      try {
        await page.close();
      } catch (e) {}
      return null;
    }
  }

  async processProducts(products, allProducts) {
    for (const prodData of products) {
      if (allProducts.length >= this.limit) break;

      console.log(`   🔄 [${allProducts.length + 1}/${this.limit}] ${prodData.name.substring(0, 40)}...`);

      // ═══════════════════════════════════════════════════════════
      // 🎟️ VALIDAÇÃO E APLICAÇÃO DE CUPOM
      // ═══════════════════════════════════════════════════════════
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
            
            // Recalcula o desconto total real
            realDiscount = this.calculateTotalDiscount(prodData.oldPrice, finalPrice);
            
            this.stats.couponsApplied++;
            
            console.log(`      🎟️  Cupom aplicado: ${couponText}`);
            console.log(`      💰 Preço original: R$ ${prodData.currentPrice}`);
            console.log(`      ✨ Preço final: R$ ${finalPrice}`);
            console.log(`      📊 Desconto total: ${realDiscount}%`);
          }
        } else {
          this.stats.couponsIgnored++;
          console.log(`      ⏭️  Cupom não aplicável (valor mínimo: R$ ${prodData.coupon.minValue})`);
        }
      }

      const productKey = this.generateProductKey(prodData.name);

      const dupCheck = this.checkDuplicate({
        nome: prodData.name,
        link_original: prodData.link,
        desconto: realDiscount,
        preco_para: finalPrice
      }, allProducts);

      if (dupCheck.isDuplicate) {
        this.stats.duplicatesIgnored++;
        console.log(`      ⏭️  IGNORADO (${dupCheck.reason})`);
        continue;
      }

      this.seenLinks.add(prodData.link);

      const affiliateLink = await this.getAffiliateLink(prodData.link);
      const finalLink = affiliateLink || prodData.link;
      const isAffiliate = finalLink.includes('/sec/');

      const product = {
        nome: prodData.name,
        imagem: prodData.image,
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

      // Adiciona informações do cupom se aplicado
      if (couponApplied) {
        product.cupom_aplicado = true;
        product.cupom_texto = couponText;
        product.preco_sem_cupom = String(prodData.currentPrice);
        product.desconto_cupom = String(prodData.currentPrice - finalPrice);
      }

      if (dupCheck.isBetterOffer) {
        product._shouldUpdate = true;
        product._oldLink = dupCheck.oldLink;
        this.stats.betterOffersUpdated++;
      }

      allProducts.push(product);
      this.seenProductKeys.add(productKey);
      this.stats.productsCollected++;

      if (isAffiliate) {
        this.stats.affiliateLinksSuccess++;
      } else {
        this.stats.affiliateLinksFailed++;
      }

      await new Promise(r => setTimeout(r, 500));
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

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  ${this.categoriaInfo.emoji}  ${this.categoriaInfo.nome.padEnd(47)} ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(26)} ║`);
      console.log(`║  🔧 MODO: Com detecção inteligente de cupons${' '.repeat(6)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= this.config.maxPages) {
        const baseUrl = this.categoriaInfo.url;
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = pageNum === 1 ? baseUrl : `${baseUrl}${separator}_Desde_${currentOffset + 1}&_NoIndex_true`;
       
        console.log(`📄 Página ${pageNum} [${allProducts.length}/${this.limit}]`);
       
        try {
          const mainPage = await context.newPage();
          
          await mainPage.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: this.config.pageTimeout 
          });

          await mainPage.waitForTimeout(800);

          // ═══════════════════════════════════════════════════════════
          // 🎟️ SCRAPING COM DETECÇÃO DE CUPONS
          // ═══════════════════════════════════════════════════════════
          const pageData = await mainPage.evaluate(({ minDiscount, maxPrice }) => {
            const cards = document.querySelectorAll('.poly-card, .ui-search-result');
            const products = [];
            let filtered = 0;
            
            cards.forEach(card => {
              try {
                const link = card.querySelector('a[href*="/MLB"]')?.href.split('?')[0];
                if (!link || !link.match(/MLB\d+/)) return;
                
                const name = card.querySelector('h2, .poly-component__title')?.innerText || 'Sem nome';
                const image = card.querySelector('img')?.src || '';
                
                const discountText = card.querySelector('.poly-price__disc_label, .ui-search-price__discount')?.innerText || '0';
                const discount = parseInt(discountText.replace(/\D/g, '')) || 0;
                
                if (discount < minDiscount) {
                  filtered++;
                  return;
                }
                
                const prices = Array.from(card.querySelectorAll('.andes-money-amount__fraction'));
                let currentPrice = 0, oldPrice = 0;
                
                if (prices.length >= 2) {
                  currentPrice = parseInt(prices[0]?.innerText.replace(/\./g, '')) || 0;
                  oldPrice = parseInt(prices[1]?.innerText.replace(/\./g, '')) || 0;
                } else if (prices.length === 1) {
                  currentPrice = parseInt(prices[0]?.innerText.replace(/\./g, '')) || 0;
                  oldPrice = discount > 0 ? Math.round(currentPrice / (1 - discount / 100)) : currentPrice;
                }
                
                if (oldPrice < currentPrice) [oldPrice, currentPrice] = [currentPrice, oldPrice];
                
                // ═══════════════════════════════════════════════════════════
                // 🎟️ DETECÇÃO AVANÇADA DE CUPONS
                // ═══════════════════════════════════════════════════════════
                let couponInfo = null;
                
                // Seletores variados para encontrar cupons
                const couponSelectors = [
                  '[class*="coupon"]',
                  '[class*="cupom"]',
                  '[data-testid*="coupon"]',
                  '.ui-search-item__group__element--coupon',
                  '.promotion-item__discount-text',
                  '.poly-component__price-coupon',
                  '.andes-tag',
                  '[class*="discount-tag"]',
                  '[class*="promo"]'
                ];
                
                let couponElement = null;
                for (const selector of couponSelectors) {
                  couponElement = card.querySelector(selector);
                  if (couponElement) break;
                }
                
                if (couponElement) {
                  const couponText = couponElement.innerText || couponElement.textContent || '';
                  
                  // Extrai desconto do cupom
                  // Padrões: "5% OFF", "Aplicar 5% OFF", "R$ 20 OFF", etc
                  const percentMatch = couponText.match(/(\d+)%\s*OFF/i);
                  const valueMatch = couponText.match(/R\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i);
                  
                  // Extrai valor mínimo
                  // Padrões: "Compra mínima R$ 120", "mínima R$120", "min. 120"
                  const minValuePatterns = [
                    /m[ií]nim[ao]\s*R?\$?\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i,
                    /compra\s+de\s+R?\$?\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i,
                    /acima\s+de\s+R?\$?\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i
                  ];
                  
                  let minValue = 0;
                  for (const pattern of minValuePatterns) {
                    const match = couponText.match(pattern);
                    if (match) {
                      minValue = parseInt(match[1].replace(/\./g, '').replace(',', '.'));
                      break;
                    }
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
                
                if (maxPrice && currentPrice > parseInt(maxPrice)) {
                  filtered++;
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
                console.error('Erro ao processar card:', e);
              }
            });
            
            return { products, filtered };
          }, { minDiscount: this.minDiscount, maxPrice: this.maxPrice });

          await mainPage.close();

          const newProducts = pageData.products.filter(p => !this.seenLinks.has(p.link));
          this.stats.filteredByDiscount += pageData.filtered;

          console.log(`   ✅ ${newProducts.length} novos | ${pageData.filtered} filtrados\n`);
          
          if (newProducts.length === 0) {
            emptyPagesCount++;
            if (emptyPagesCount >= this.config.maxEmptyPages) {
              console.log(`   ⚠️  Sem novos produtos\n`);
              break;
            }
            pageNum++;
            currentOffset += 48;
            continue;
          }
          emptyPagesCount = 0;

          console.log(`   🔗 Obtendo links...\n`);

          await this.processProducts(newProducts, allProducts);

          if (allProducts.length >= this.limit) break;

          this.stats.pagesScraped = pageNum;
          pageNum++;
          currentOffset += 48;

        } catch (pageError) {
          console.error(`   ❌ Erro: ${pageError.message}`);
          this.stats.errors++;
          pageNum++;
          currentOffset += 48;
        }
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
      console.log(`⏭️  Cupons ignorados: ${this.stats.couponsIgnored}`);
      console.log(`⏭️  Duplicados: ${this.stats.duplicatesIgnored}`);
      console.log(`📄 Páginas: ${this.stats.pagesScraped}`);
      console.log(`⏱️  Tempo: ${duration}s\n`);

      return allProducts.slice(0, this.limit);

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      
      try {
        if (this.browser) await this.browser.close();
      } catch (e) {}
      
      return allProducts.slice(0, this.limit);
    }
  }
}

module.exports = MercadoLivreScraper;