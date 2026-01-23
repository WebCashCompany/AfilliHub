/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - DEBUG MODE
 * ═══════════════════════════════════════════════════════════════════════
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoria } = require('../../config/categorias-ml');

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
      filteredByPrice: 0
    };
    
    this.existingProductsMap = new Map();
    this.processedLinks = new Set();
    
    this.categoriaInfo = getCategoria(this.categoriaKey);
    if (!this.categoriaInfo) {
      console.warn(`⚠️  Categoria "${this.categoriaKey}" não encontrada, usando "todas"`);
      this.categoriaInfo = getCategoria('todas');
    }
    
    this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    
    this.config = {
      pageTimeout: 10000,          // 12s → 10s
      affiliateLinkTimeout: 4000,  // 5s → 4s
      scrollDelay: 60,             // 80ms → 60ms
      scrollIterations: 1,         // 2 → 1
      maxPages: 50,
      maxEmptyPages: 3,
      maxRetries: 2,
      parallelTabs: 3              // Processa 3 produtos simultaneamente
    };
    
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  clearCache() {
    this.processedLinks.clear();
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes...');
    
    try {
      const conn = getProductConnection();
      const Product = getProductModel('ML', conn);
      
      const products = await Product.find({})
        .select('link_afiliado nome desconto preco_para preco_de isActive')
        .lean();
      
      console.log(`   📊 ${products.length} produtos no banco`);
      
      for (const product of products) {
        if (product.link_afiliado) {
          product.desconto = String(product.desconto || '0').replace(/\D/g, '');
          product.preco_para = String(product.preco_para || '0').replace(/\D/g, '');
          this.existingProductsMap.set(product.link_afiliado, product);
        }
      }
      
      console.log(`   ✅ ${this.existingProductsMap.size} no cache\n`);
      
    } catch (error) {
      console.log('   ⚠️  Continuando sem cache\n');
    }
  }

  normalizeProductName(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  isBetterOffer(newProduct, existingProduct) {
    const newDiscount = parseInt(newProduct.desconto) || 0;
    const existingDiscount = parseInt(existingProduct.desconto) || 0;
    const newPrice = parseInt(newProduct.preco_para) || 0;
    const existingPrice = parseInt(existingProduct.preco_para) || 0;
    return newDiscount > existingDiscount || (newDiscount === existingDiscount && newPrice < existingPrice);
  }

  async processProduct(product, collectedProducts) {
    const normalizedName = this.normalizeProductName(product.nome);
    
    const duplicateInMemory = collectedProducts.some(p => {
      const existingNormalized = this.normalizeProductName(p.nome);
      const nameMatch = existingNormalized.split(' ').slice(0, 5).join(' ') === normalizedName.split(' ').slice(0, 5).join(' ');
      return p.link_afiliado === product.link_afiliado || nameMatch;
    });

    if (duplicateInMemory) {
      this.stats.duplicatesIgnored++;
      return { action: 'skip', reason: 'duplicate_in_memory' };
    }

    const existingInDb = this.existingProductsMap.get(product.link_afiliado);
    
    if (!existingInDb) {
      for (const [link, existingProd] of this.existingProductsMap.entries()) {
        const existingNormalized = this.normalizeProductName(existingProd.nome);
        const nameMatch = existingNormalized.split(' ').slice(0, 5).join(' ') === normalizedName.split(' ').slice(0, 5).join(' ');
        
        if (nameMatch) {
          if (this.isBetterOffer(product, existingProd)) {
            this.stats.betterOffersUpdated++;
            return { action: 'update', reason: 'better_offer', oldLink: link };
          }
          this.stats.duplicatesIgnored++;
          return { action: 'skip', reason: 'worse_offer' };
        }
      }
      return { action: 'add', reason: 'new_product' };
    }

    if (this.isBetterOffer(product, existingInDb)) {
      this.stats.betterOffersUpdated++;
      return { action: 'update', reason: 'better_offer', oldLink: product.link_afiliado };
    }

    this.stats.duplicatesIgnored++;
    return { action: 'skip', reason: 'worse_or_equal_offer' };
  }

  async createBrowserContext() {
    if (this.browser) {
      try { await this.browser.close(); } catch (e) {}
    }

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    if (fs.existsSync(this.sessionPath)) {
      console.log('🔐 Sessão salva\n');
      try {
        this.context = await this.browser.newContext({
          storageState: this.sessionPath,
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        return { browser: this.browser, context: this.context };
      } catch (error) {
        console.warn('⚠️  Erro ao carregar sessão');
      }
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    return { browser: this.browser, context: this.context };
  }

  async getAffiliateLink(page, productUrl) {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await page.goto(productUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: this.config.affiliateLinkTimeout 
        });
        await page.waitForTimeout(300);

        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a'));
          const shareBtn = buttons.find(btn => 
            btn.textContent && btn.textContent.toLowerCase().includes('compartilhar')
          );
          
          if (shareBtn) {
            shareBtn.click();
            return true;
          }
          return false;
        });

        if (!clicked) {
          if (attempt < this.config.maxRetries) {
            await page.waitForTimeout(400);
            continue;
          }
          return null;
        }

        await page.waitForTimeout(1200);

        await this.context.grantPermissions(['clipboard-read', 'clipboard-write']);

        for (let i = 0; i < 4; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(100);
        }

        await page.keyboard.press('Enter');
        await page.waitForTimeout(600);

        const clipboardText = await page.evaluate(async () => {
          return await navigator.clipboard.readText();
        });

        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);

        if (clipboardText && clipboardText.includes('mercadolivre.com/sec/')) {
          return clipboardText;
        }

        if (attempt < this.config.maxRetries) {
          await page.waitForTimeout(400);
          continue;
        }

        return null;

      } catch (error) {
        if (attempt < this.config.maxRetries) {
          try { await page.keyboard.press('Escape'); } catch (e) {}
          await page.waitForTimeout(400);
          continue;
        }
        return null;
      }
    }
    return null;
  }

  async scrapeCategory() {
    await this.loadExistingProducts();

    const { browser, context } = await this.createBrowserContext();
    this.page = await context.newPage();
   
    let allProducts = [];
    let pageNum = 1;
    let emptyPagesCount = 0;
    let currentOffset = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  ${this.categoriaInfo.emoji}  ${this.categoriaInfo.nome.padEnd(47)} ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(26)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= this.config.maxPages) {
        const baseUrl = this.categoriaInfo.url;
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = pageNum === 1 ? baseUrl : `${baseUrl}${separator}_Desde_${currentOffset + 1}&_NoIndex_true`;
       
        console.log(`📄 Pág ${pageNum}/${this.config.maxPages} [${allProducts.length}/${this.limit}]`);
        if (pageNum === 1) console.log(`   ${url}\n`);
       
        try {
          await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.config.pageTimeout });
          await this.page.waitForTimeout(600);

          await this.page.evaluate(async () => {
            window.scrollBy(0, 1200);
            await new Promise(r => setTimeout(r, 80));
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 200));
          });

          const pageData = await this.page.evaluate(({ minDiscount, maxPrice }) => {
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
                if (maxPrice && currentPrice > parseInt(maxPrice)) {
                  filtered++;
                  return;
                }
                
                products.push({ link, name, image, discount, currentPrice, oldPrice });
              } catch (e) {}
            });
            
            return { products, filtered, total: cards.length };
          }, { minDiscount: this.minDiscount, maxPrice: this.maxPrice });

          const newProducts = pageData.products.filter(p => !this.processedLinks.has(p.link));
          
          this.stats.filteredByDiscount += pageData.filtered;

          console.log(`   ✅ ${newProducts.length} novos | ${pageData.filtered} filtrados`);
          
          if (newProducts.length === 0) {
            emptyPagesCount++;
            if (emptyPagesCount >= this.config.maxEmptyPages) {
              console.log(`   ⚠️  Sem novos produtos, encerrando\n`);
              break;
            }
            pageNum++;
            currentOffset += 48;
            continue;
          }
          emptyPagesCount = 0;

          console.log(`   🔗 Obtendo links de afiliado (${this.config.parallelTabs} abas paralelas)...\n`);
          
          // Processa produtos em paralelo
          const batches = [];
          for (let i = 0; i < newProducts.length; i += this.config.parallelTabs) {
            batches.push(newProducts.slice(i, i + this.config.parallelTabs));
          }

          for (const batch of batches) {
            if (allProducts.length >= this.limit) {
              console.log(`   🎯 META! ${allProducts.length}/${this.limit}\n`);
              break;
            }

            // Abre múltiplas abas
            const tabs = await Promise.all(
              batch.map(() => this.context.newPage())
            );

            // Processa produtos em paralelo
            const results = await Promise.all(
              batch.map(async (prodData, idx) => {
                this.processedLinks.add(prodData.link);
                
                const tab = tabs[idx];
                const affiliateLink = await this.getAffiliateLink(tab, prodData.link);
                
                return {
                  data: prodData,
                  affiliateLink: affiliateLink || prodData.link,
                  success: !!affiliateLink
                };
              })
            );

            // Fecha todas as abas
            await Promise.all(tabs.map(tab => tab.close().catch(() => {})));

            // Processa resultados
            for (const result of results) {
              if (allProducts.length >= this.limit) break;

              const product = {
                nome: result.data.name,
                imagem: result.data.image,
                link_original: result.data.link,
                link_afiliado: result.affiliateLink,
                desconto: `${result.data.discount}%`,
                preco: `R$ ${result.data.currentPrice}`,
                preco_anterior: `R$ ${result.data.oldPrice}`,
                preco_de: String(result.data.oldPrice),
                preco_para: String(result.data.currentPrice),
                categoria: this.categoriaInfo.nome,
                marketplace: 'ML',
                isActive: true
              };

              const processResult = await this.processProduct(product, allProducts);
             
              if (processResult.action === 'add' || processResult.action === 'update') {
                if (processResult.action === 'update') {
                  product._shouldUpdate = true;
                  product._oldLink = processResult.oldLink;
                }
               
                allProducts.push(product);
                this.stats.productsCollected++;
                
                const status = result.success ? '✅' : '⚠️';
                const linkType = result.success ? 'AFILIADO' : 'ORIGINAL';
                console.log(`   ${status} [${allProducts.length}/${this.limit}] ${product.nome.substring(0, 45)}... (${linkType})`);
              }
            }
          }

          if (allProducts.length >= this.limit) break;

          this.stats.pagesScraped = pageNum;
          pageNum++;
          currentOffset += 48;
          await this.page.waitForTimeout(200);

        } catch (pageError) {
          console.error(`   ❌ Erro: ${pageError.message}`);
          this.stats.errors++;
          pageNum++;
          currentOffset += 48;
        }
      }

      try {
        await browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
      } catch (e) {}

      console.log(`\n╔════════════════════════════════════════════════════╗`);
      console.log(`║              🏁 FINALIZADO 🏁                      ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`✨ Coletados: ${allProducts.length}/${this.limit}`);
      console.log(`⏭️  Ignorados: ${this.stats.duplicatesIgnored}`);
      console.log(`🔥 Filtrados: ${this.stats.filteredByDiscount}`);
      console.log(`📄 Páginas: ${this.stats.pagesScraped}\n`);

      return allProducts.slice(0, this.limit);

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      
      try {
        if (this.browser) await this.browser.close();
      } catch (e) {}
      
      return allProducts.slice(0, this.limit);
    }
  }

  getProgressBar(current, total) {
    const percentage = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.floor(percentage / 5);
    return `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${percentage}%`;
  }
}

module.exports = MercadoLivreScraper;