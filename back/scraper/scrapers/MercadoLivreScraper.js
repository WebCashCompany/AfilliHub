/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - VERSÃO CORRIGIDA ANTI-LOOP
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * @version 9.2.0 - 🔥 CORREÇÕES CRÍTICAS:
 * 1. Detecção de loop infinito (mesma página repetida)
 * 2. Múltiplas estratégias de paginação
 * 3. Garante coleta de TODOS os produtos válidos da página
 * 4. Filtro de preço aplicado ANTES do processamento de links
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
    
    if (this.maxPrice) {
      console.log(`💰 Filtro de preço ativo: máximo R$ ${this.maxPrice}\n`);
    }
    
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
      couponsApplied: 0,
      couponsIgnored: 0,
      loopDetections: 0
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
      parallelTabs: 1,
      maxSamePage: 3  // 🔥 NOVO: Máximo de vezes que aceita mesma página
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

  canApplyCoupon(coupon, productPrice) {
    if (!coupon) return false;
    
    if (coupon.minValue > 0 && productPrice < coupon.minValue) {
      return false;
    }
    
    return true;
  }

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
      additionalDiscount = Math.round(currentPrice * (coupon.discount / 100));
      finalPrice = currentPrice - additionalDiscount;
    } else if (coupon.type === 'value') {
      additionalDiscount = coupon.discount;
      finalPrice = currentPrice - coupon.discount;
    }

    finalPrice = Math.max(0, finalPrice);

    return {
      finalPrice,
      additionalDiscount,
      couponApplied: true,
      couponText: coupon.text
    };
  }

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
            
            console.log(`      🎟️  Cupom aplicado: ${couponText}`);
            console.log(`      💰 Preço sem cupom: R$ ${prodData.currentPrice}`);
            console.log(`      ✨ Preço com cupom: R$ ${finalPrice}`);
            console.log(`      📊 Desconto total: ${realDiscount}%`);
          }
        } else {
          this.stats.couponsIgnored++;
          console.log(`      ⏭️  Cupom não aplicável (valor mínimo: R$ ${prodData.coupon.minValue})`);
        }
      }

      // 🔥 FILTRO DE PREÇO APLICADO ANTES DE PROCESSAR LINK
      if (this.maxPrice && finalPrice > this.maxPrice) {
        this.stats.filteredByPrice++;
        console.log(`      ⏭️  IGNORADO (preço R$ ${finalPrice} > máx R$ ${this.maxPrice})`);
        continue;
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
    
    // 🔥 NOVO: Detecção de loop infinito
    let lastPageProducts = [];
    let samePageCount = 0;
    const MAX_SAME_PAGE = 3;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  ${this.categoriaInfo.emoji}  ${this.categoriaInfo.nome.padEnd(47)} ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(26)} ║`);
      if (this.maxPrice) {
        console.log(`║  💰 PREÇO MÁXIMO: R$ ${this.maxPrice}${' '.repeat(29 - String(this.maxPrice).length)} ║`);
      }
      console.log(`║  🔧 MODO: Com detecção de loop e coleta garantida${' '.repeat(1)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= this.config.maxPages) {
        const baseUrl = this.categoriaInfo.url;
        const separator = baseUrl.includes('?') ? '&' : '?';
        
        // 🔥 ESTRATÉGIA MÚLTIPLA DE PAGINAÇÃO
        let url;
        if (pageNum === 1) {
          url = baseUrl;
        } else if (samePageCount >= 2) {
          // Se detectou loop, pula mais produtos
          const newOffset = currentOffset + 48;
          url = `${baseUrl}${separator}_Desde_${newOffset}&_NoIndex_true`;
          console.log(`   🔥 LOOP DETECTADO! Pulando para offset ${newOffset}`);
          currentOffset = newOffset;
          samePageCount = 0;
          this.stats.loopDetections++;
        } else {
          url = `${baseUrl}${separator}_Desde_${currentOffset + 1}&_NoIndex_true`;
        }
       
        console.log(`📄 Página ${pageNum} [${allProducts.length}/${this.limit}]`);
        if (pageNum > 1) {
          console.log(`   🔗 Offset: ${currentOffset + 1}`);
        }
       
        try {
          const mainPage = await context.newPage();
          
          await mainPage.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: this.config.pageTimeout 
          });

          await mainPage.waitForTimeout(1200); // 🔥 Aumentado para garantir carregamento

          const pageData = await mainPage.evaluate(({ minDiscount, maxPrice }) => {
            let cards = document.querySelectorAll('.poly-card, .ui-search-result');
            
            if (cards.length === 0) {
              cards = document.querySelectorAll('[class*="ui-search-result__content"]');
            }
            
            if (cards.length === 0) {
              cards = document.querySelectorAll('.ui-search-layout__item');
            }
            
            if (cards.length === 0) {
              const allLis = document.querySelectorAll('li');
              cards = Array.from(allLis).filter(li => {
                return li.querySelector('a[href*="/MLB"]');
              });
            }
            
            if (cards.length === 0) {
              const mlbLinks = document.querySelectorAll('a[href*="/MLB"]');
              const cardSet = new Set();
              mlbLinks.forEach(link => {
                let parent = link.parentElement;
                let level = 0;
                while (parent && level < 5) {
                  if (parent.querySelector('h2') && parent.querySelector('[class*="price"]')) {
                    cardSet.add(parent);
                    break;
                  }
                  parent = parent.parentElement;
                  level++;
                }
              });
              cards = Array.from(cardSet);
            }
            
            const products = [];
            let filteredByDiscount = 0;
            let filteredByPrice = 0; // 🔥 NOVO contador
            
            cards.forEach(card => {
              try {
                const link = card.querySelector('a[href*="/MLB"]')?.href.split('?')[0];
                if (!link || !link.match(/MLB\d+/)) return;
                
                let name = card.querySelector('h2')?.innerText || 
                           card.querySelector('.poly-component__title')?.innerText ||
                           card.querySelector('[class*="title"]')?.innerText ||
                           card.querySelector('[class*="name"]')?.innerText ||
                           'Sem nome';
                
                const image = card.querySelector('img')?.src || '';
                
                const discountElement = card.querySelector('.poly-price__disc_label') ||
                                       card.querySelector('.ui-search-price__discount') ||
                                       card.querySelector('[class*="discount"]') ||
                                       card.querySelector('[class*="off"]');
                
                const discountText = discountElement?.innerText || '0';
                const discount = parseInt(discountText.replace(/\D/g, '')) || 0;
                
                // 🔥 FILTRO DE DESCONTO
                if (discount < minDiscount) {
                  filteredByDiscount++;
                  return;
                }
                
                let currentPrice = 0, oldPrice = 0;
                
                const prices = Array.from(card.querySelectorAll('.andes-money-amount__fraction'));
                
                if (prices.length >= 2) {
                  currentPrice = parseInt(prices[0]?.innerText.replace(/\./g, '')) || 0;
                  oldPrice = parseInt(prices[1]?.innerText.replace(/\./g, '')) || 0;
                } else if (prices.length === 1) {
                  currentPrice = parseInt(prices[0]?.innerText.replace(/\./g, '')) || 0;
                  oldPrice = discount > 0 ? Math.round(currentPrice / (1 - discount / 100)) : currentPrice;
                } else {
                  const allText = card.innerText || card.textContent;
                  const priceMatches = allText.match(/R\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/g);
                  
                  if (priceMatches && priceMatches.length > 0) {
                    const extractedPrices = priceMatches.map(p => {
                      return parseInt(p.replace(/[^\d]/g, ''));
                    }).filter(p => p > 0);
                    
                    if (extractedPrices.length >= 2) {
                      currentPrice = Math.min(...extractedPrices);
                      oldPrice = Math.max(...extractedPrices);
                    } else if (extractedPrices.length === 1) {
                      currentPrice = extractedPrices[0];
                      oldPrice = discount > 0 ? Math.round(currentPrice / (1 - discount / 100)) : currentPrice;
                    }
                  }
                }
                
                if (currentPrice === 0 || oldPrice === 0) return;
                if (oldPrice < currentPrice) [oldPrice, currentPrice] = [currentPrice, oldPrice];
                
                let couponInfo = null;
                
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
                  
                  const percentMatch = couponText.match(/(\d+)%\s*OFF/i);
                  const valueMatch = couponText.match(/R\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i);
                  
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
                
                // 🔥 PRÉ-FILTRO DE PREÇO (antes de adicionar à lista)
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
                console.error('Erro ao processar card:', e);
              }
            });
            
            return { products, filteredByDiscount, filteredByPrice };
          }, { minDiscount: this.minDiscount, maxPrice: this.maxPrice });

          await mainPage.close();

          console.log(`   📊 DEBUG: ${pageData.products.length} produtos encontrados na página`);
          console.log(`   🔍 DEBUG: ${pageData.filteredByDiscount} filtrados por desconto | ${pageData.filteredByPrice} filtrados por preço`);

          // 🔥 DETECÇÃO DE LOOP: Compara produtos da página atual com anterior
          const currentPageLinks = pageData.products.map(p => p.link).sort();
          const lastPageLinks = lastPageProducts.map(p => p.link).sort();
          
          if (currentPageLinks.length > 0 && 
              JSON.stringify(currentPageLinks) === JSON.stringify(lastPageLinks)) {
            samePageCount++;
            console.log(`   ⚠️  MESMA PÁGINA DETECTADA (${samePageCount}/${MAX_SAME_PAGE})`);
            
            if (samePageCount >= MAX_SAME_PAGE) {
              console.log(`   🛑 LOOP INFINITO CONFIRMADO - Encerrando categoria\n`);
              break;
            }
          } else {
            samePageCount = 0;
            lastPageProducts = pageData.products;
          }

          const newProducts = pageData.products.filter(p => !this.seenLinks.has(p.link));
          this.stats.filteredByDiscount += pageData.filteredByDiscount;
          this.stats.filteredByPrice += pageData.filteredByPrice;

          console.log(`   ✅ ${newProducts.length} novos | ${pageData.filteredByDiscount} desc | ${pageData.filteredByPrice} preço\n`);
          
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
      console.log(`🚫 Filtrados: ${this.stats.filteredByDiscount} desconto | ${this.stats.filteredByPrice} preço`);
      console.log(`🔄 Loops detectados: ${this.stats.loopDetections}`);
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