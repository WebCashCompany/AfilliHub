/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAGALU SCRAPER - VERSÃO FINAL CORRIGIDA (HYBRID STRUCTURE SUPPORT)
 * ═══════════════════════════════════════════════════════════════════════
 * @version 3.2.2 - PRODUCTION READY - RENDER COMPATIBLE
 * @fixes Argumentos robustos para Chromium funcionar no Render
 */

const { chromium } = require('playwright');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoryUrl, getCategoryName, MAGALU_CATEGORIES } = require('../../config/categorias-magalu');

class MagaluScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    
    // 🔥 PRIORIDADE: options.affiliateId > env > padrão
    this.affiliateId = options.affiliateId || process.env.MAGALU_AFFILIATE_ID || 'magazinepromoforia';
    
    this.stats = {
      duplicatesIgnored: 0,
      betterOffersUpdated: 0,
      productsCollected: 0,
      pagesScraped: 0,
      errors: 0,
      filteredByDiscount: 0,
      invalidProducts: 0
    };
    
    this.seenLinks = new Set();
    this.seenProductKeys = new Set();
    this.existingProductsMap = new Map();
    
    if (options.categoryKey && MAGALU_CATEGORIES[options.categoryKey]) {
      this.currentCategory = options.categoryKey;
      this.categoryName = MAGALU_CATEGORIES[options.categoryKey].name;
      this.categoryNameForDB = getCategoryName(options.categoryKey);
      console.log(`🎯 Categoria definida no construtor: ${this.categoryName} → "${this.categoryNameForDB}"`);
    } else {
      this.currentCategory = 'OFERTAS_DIA';
      this.categoryName = 'Ofertas do Dia';
      this.categoryNameForDB = 'Ofertas do Dia';
      console.log(`⚠️  Nenhuma categoria especificada, usando padrão: ${this.categoryName}`);
    }
    
    console.log(`🏪 Affiliate ID ativo: ${this.affiliateId}`);
  }

  setCategory(categoryKey) {
    if (!categoryKey) {
      console.warn('⚠️  setCategory chamado sem categoryKey, mantendo categoria atual');
      return;
    }

    if (!MAGALU_CATEGORIES[categoryKey]) {
      console.error(`❌ Categoria "${categoryKey}" não existe nas configurações`);
      console.log('📋 Categorias disponíveis:', Object.keys(MAGALU_CATEGORIES).join(', '));
      throw new Error(`Categoria "${categoryKey}" não existe`);
    }
    
    const oldCategory = this.currentCategory;
    this.currentCategory = categoryKey;
    this.categoryName = MAGALU_CATEGORIES[categoryKey].name;
    this.categoryNameForDB = getCategoryName(categoryKey);
    
    console.log(`🔄 Categoria alterada: "${oldCategory}" → "${this.currentCategory}"`);
    console.log(`📂 Nome da categoria: ${this.categoryName}`);
    console.log(`💾 Salva no DB como: "${this.categoryNameForDB}"\n`);
  }

  getCurrentCategory() {
    return {
      key: this.currentCategory,
      name: this.categoryName,
      dbName: this.categoryNameForDB,
      url: getCategoryUrl(this.currentCategory, this.affiliateId, 1)
    };
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes...');
    
    try {
      const conn = getProductConnection();
      const Product = getProductModel('magalu', conn);
      
      const products = await Product.find({ 
        isActive: true,
        marketplace: 'MAGALU'
      })
      .select('link_original nome desconto preco_para preco_de categoria')
      .lean()
      .limit(500)
      .sort({ createdAt: -1 });
      
      console.log(`   📊 ${products.length} produtos no banco\n`);
      
      for (const product of products) {
        if (product.link_original) {
          const key = this.generateProductKey(product.nome);
          this.existingProductsMap.set(key, {
            link: product.link_original,
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

  formatPrice(cents) {
    if (!cents || cents === 0) return 'R$ 0,00';
    const reais = Math.floor(cents / 100);
    const centavos = cents % 100;
    return `R$ ${reais.toLocaleString('pt-BR')},${centavos.toString().padStart(2, '0')}`;
  }

  async scrapeCategory() {
    const startTime = Date.now();
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║   🔍 VALIDAÇÃO DE CATEGORIA                         ║`);
    console.log(`╚════════════════════════════════════════════════════╝`);
    console.log(`🎯 Categoria Key: ${this.currentCategory}`);
    console.log(`📂 Nome: ${this.categoryName}`);
    console.log(`💾 DB: ${this.categoryNameForDB}`);
    console.log(`🏪 Affiliate ID: ${this.affiliateId}`);
    console.log(`🔗 URL Base: ${getCategoryUrl(this.currentCategory, this.affiliateId, 1)}\n`);
    
    await this.loadExistingProducts();

    console.log('🌐 Tentando lançar browser...');
    
    const browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-software-rasterizer',
        '--disable-dev-tools',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      timeout: 60000
    });
    
    console.log('✅ Browser lançado com sucesso!');
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo'
    });
    
    const page = await context.newPage();
    
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 50;
    let emptyPagesCount = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║   📂 ${this.categoryName.padEnd(48)} ║`);
      console.log(`║   💾 Salva como: "${this.categoryNameForDB}"${' '.repeat(Math.max(0, 48 - 16 - this.categoryNameForDB.length))} ║`);
      console.log(`║   🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(19)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const url = getCategoryUrl(this.currentCategory, this.affiliateId, pageNum);
        
        console.log(`📄 Pág ${pageNum.toString().padStart(2, '0')}/${maxPages} [${allProducts.length}/${this.limit}]`);
        console.log(`🔗 URL: ${url.substring(0, 80)}...`);
        
        try {
          await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
          });
          
          await page.waitForTimeout(3000);

          await page.evaluate(async () => {
            const scrollDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            for (let i = 0; i < 8; i++) {
              window.scrollBy(0, 400);
              await scrollDelay(400);
            }
            window.scrollTo(0, 0);
          });
          
          await page.waitForTimeout(2000);

          // 🔍 DEBUG: Ver o que o Playwright está vendo (apenas na primeira página)
          if (pageNum === 1) {
            console.log('🔍 DEBUG: Analisando primeira página...');
            
            const debugInfo = await page.evaluate(() => {
              const items = document.querySelectorAll('[data-testid*="product-card"], [data-testid="product-card-container"]');
              
              if (items.length === 0) {
                const links = document.querySelectorAll('a[href*="/produto/"]');
                return {
                  cardsFound: 0,
                  linksFound: links.length,
                  bodyText: document.body.innerText.substring(0, 500)
                };
              }
              
              // Pegar o primeiro card
              const firstCard = items[0];
              const priceValue = firstCard.querySelector('[data-testid="price-value"]');
              const priceOriginal = firstCard.querySelector('[data-testid="price-original"]');
              const allText = firstCard.innerText;
              
              // Procurar todos os elementos que parecem preços
              const allPriceElements = Array.from(firstCard.querySelectorAll('*'))
                .filter(el => el.innerText && el.innerText.match(/R\$\s*[\d.,]+/))
                .map(el => ({
                  tag: el.tagName,
                  class: el.className,
                  text: el.innerText.substring(0, 50)
                }));
              
              return {
                cardsFound: items.length,
                hasPriceValue: !!priceValue,
                priceValueText: priceValue ? priceValue.innerText : 'NÃO ENCONTRADO',
                hasPriceOriginal: !!priceOriginal,
                priceOriginalText: priceOriginal ? priceOriginal.innerText : 'NÃO ENCONTRADO',
                cardText: allText,
                allPriceElements: allPriceElements.slice(0, 5)
              };
            });
            
            console.log('📊 DEBUG INFO:');
            console.log(`   Cards encontrados: ${debugInfo.cardsFound}`);
            console.log(`   Preço atual: ${debugInfo.hasPriceValue} - "${debugInfo.priceValueText}"`);
            console.log(`   Preço original: ${debugInfo.hasPriceOriginal} - "${debugInfo.priceOriginalText}"`);
            console.log(`   Texto do card:\n${debugInfo.cardText}`);
            console.log(`   Elementos com preço:`, JSON.stringify(debugInfo.allPriceElements, null, 2));
          }

          const productsFromPage = await page.evaluate(({ minDisc, affiliateId, categoryNameForDB }) => {
            const results = [];
            
            function extractPriceInCents(text) {
              if (!text) return 0;
              const cleaned = text.replace(/[^\d.,]/g, ''); 
              let priceStr = cleaned;
              
              if (priceStr.includes(',')) {
                priceStr = priceStr.replace(/\./g, '').replace(',', '');
              } else if (priceStr.includes('.')) {
                const parts = priceStr.split('.');
                if (parts.length === 2 && parts[1].length === 2) {
                  priceStr = priceStr.replace('.', '');
                } else {
                  priceStr = priceStr.replace(/\./g, '') + '00';
                }
              } else {
                if (priceStr.length <= 3) {
                  priceStr = priceStr + '00';
                }
              }
              return parseInt(priceStr) || 0;
            }
            
            function calculateDiscount(oldPriceCents, currentPriceCents) {
              if (!oldPriceCents || !currentPriceCents || oldPriceCents <= currentPriceCents) {
                return 0;
              }
              const discount = Math.round(((oldPriceCents - currentPriceCents) / oldPriceCents) * 100);
              return Math.max(0, Math.min(99, discount));
            }
            
            let items = document.querySelectorAll('[data-testid*="product-card"], [data-testid="product-card-container"]');
            if (items.length === 0) {
              items = document.querySelectorAll('a[href*="/produto/"]');
            }

            items.forEach((item) => {
              try {
                let card = item;
                if (item.tagName === 'A') {
                  card = item.closest('li') || item.closest('div[class*="card"]') || item.parentElement || item;
                }
                
                let linkEl = card.querySelector('a[href*="/produto/"]') || (item.tagName === 'A' ? item : null);
                if (!linkEl || !linkEl.href) return;
                
                let titleEl = card.querySelector('[data-testid*="title"]') || 
                             card.querySelector('h2, h3') ||
                             card.querySelector('[class*="title"]');
                
                let productTitle = titleEl ? titleEl.innerText.trim() : '';
                if (!productTitle && linkEl.title) productTitle = linkEl.title;
                if (!productTitle || productTitle.length < 3) return;
                
                let imgEl = card.querySelector('img');
                let imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';
                
                const cardText = card.innerText || '';
                
                let currentPriceCents = 0;
                let oldPriceCents = 0;
                let discountVal = 0;
                
                const currentPriceEl = card.querySelector('[data-testid="price-value"]');
                if (currentPriceEl) {
                  currentPriceCents = extractPriceInCents(currentPriceEl.innerText);
                } else {
                  const priceMatch = cardText.match(/R\$\s*[\d.,]+/);
                  if (priceMatch) currentPriceCents = extractPriceInCents(priceMatch[0]);
                }
                
                if (!currentPriceCents || currentPriceCents === 0) return;
                
                const oldPriceEl = card.querySelector('[data-testid="price-original"]');
                if (oldPriceEl) {
                  oldPriceCents = extractPriceInCents(oldPriceEl.innerText);
                }
                
                if (oldPriceCents === 0) {
                  const pixMatch = cardText.match(/(\d+)%\s+(?:de\s+)?desconto\s+(?:no\s+)?pix/i);
                  
                  if (pixMatch) {
                    const foundDiscount = parseInt(pixMatch[1]);
                    
                    if (foundDiscount > 0 && foundDiscount < 100) {
                      oldPriceCents = Math.round(currentPriceCents / (1 - foundDiscount / 100));
                      discountVal = foundDiscount;
                    }
                  }
                }
                
                if (discountVal === 0 && oldPriceCents > 0) {
                  discountVal = calculateDiscount(oldPriceCents, currentPriceCents);
                }
                
                if (oldPriceCents > 0 && currentPriceCents > 0 && oldPriceCents < currentPriceCents) {
                  [oldPriceCents, currentPriceCents] = [currentPriceCents, oldPriceCents];
                  discountVal = calculateDiscount(oldPriceCents, currentPriceCents);
                }
                
                if (discountVal < minDisc) return;
                if (oldPriceCents === 0 || oldPriceCents <= currentPriceCents) return;
                
                let fullUrl = linkEl.href;
                if (!fullUrl.includes(affiliateId)) {
                  try {
                    const url = new URL(fullUrl);
                    url.pathname = `/${affiliateId}${url.pathname}`;
                    fullUrl = url.toString();
                  } catch (e) {}
                }
                
                const cleanLink = fullUrl.split('?')[0].split('#')[0];
                
                results.push({
                  nome: productTitle,
                  imagem: imageUrl,
                  link_original: cleanLink,
                  preco_de: oldPriceCents.toString(),
                  preco_para: currentPriceCents.toString(),
                  desconto: discountVal.toString(),
                  categoria: categoryNameForDB,
                  marketplace: 'MAGALU',
                  isActive: true
                });
                
              } catch (e) {
                // Pula produto com erro de DOM
              }
            });
            
            return results;
          }, { 
            minDisc: this.minDiscount, 
            affiliateId: this.affiliateId,
            categoryNameForDB: this.categoryNameForDB
          });

          console.log(`   ✅ Extraídos: ${productsFromPage.length} produtos\n`);

          let newProductsCount = 0;
          
          for (const product of productsFromPage) {
            if (allProducts.length >= this.limit) break;
            
            const dupCheck = this.checkDuplicate(product, allProducts);
            
            if (dupCheck.isDuplicate) {
              this.stats.duplicatesIgnored++;
              continue;
            }
            
            this.seenLinks.add(product.link_original);
            const productKey = this.generateProductKey(product.nome);
            this.seenProductKeys.add(productKey);
            
            const finalProduct = {
              ...product,
              preco: this.formatPrice(parseInt(product.preco_para)),
              preco_anterior: this.formatPrice(parseInt(product.preco_de)),
              desconto: `${product.desconto}%`
            };
            
            if (dupCheck.isBetterOffer) {
              finalProduct._shouldUpdate = true;
              finalProduct._oldLink = dupCheck.oldLink;
              this.stats.betterOffersUpdated++;
            }
            
            allProducts.push(finalProduct);
            this.stats.productsCollected++;
            newProductsCount++;
            
            console.log(`   ✅ [${allProducts.length}/${this.limit}] ${finalProduct.nome.substring(0, 50)}... (${finalProduct.desconto})`);
          }

          if (newProductsCount === 0) {
            emptyPagesCount++;
            if (emptyPagesCount >= 2) {
              console.log(`   ⚠️  Sem novos produtos, encerrando\n`);
              break;
            }
          } else {
            emptyPagesCount = 0;
          }

          this.stats.pagesScraped = pageNum;
          pageNum++;
          
          await page.waitForTimeout(2500 + Math.random() * 2000);

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}:`, pageError.message);
          this.stats.errors++;
          pageNum++;
        }
      }

      await browser.close();

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║               🏁 FINALIZADO 🏁                       ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`📂 Categoria: ${this.categoryName}`);
      console.log(`💾 Salvo como: ${this.categoryNameForDB}`);
      console.log(`✨ Coletados: ${allProducts.length}/${this.limit}`);
      console.log(`   └─ Novos: ${allProducts.filter(p => !p._shouldUpdate).length}`);
      console.log(`   └─ Melhorados: ${this.stats.betterOffersUpdated}`);
      console.log(`⏭️  Ignorados: ${this.stats.duplicatesIgnored}`);
      console.log(`📄 Páginas: ${this.stats.pagesScraped}`);
      console.log(`⏱️  Tempo: ${duration}s\n`);

      return allProducts.slice(0, this.limit);

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      console.error(error.stack);
      await browser.close();
      return allProducts.slice(0, this.limit);
    }
  }
}

module.exports = MagaluScraper;