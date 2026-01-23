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
      pageTimeout: 12000,
      affiliateLinkTimeout: 5000,
      scrollDelay: 80,
      scrollIterations: 2,
      maxPages: 50,
      maxEmptyPages: 3,
      maxRetries: 2
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

  async getAffiliateLink(productUrl) {
    console.log(`      🔍 Tentando obter link de afiliado...`);
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`      → Tentativa ${attempt}/${this.config.maxRetries}`);
        
        await this.page.goto(productUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: this.config.affiliateLinkTimeout 
        });
        await this.page.waitForTimeout(500);

        console.log(`      → Procurando botão Compartilhar...`);
        const clicked = await this.page.evaluate(() => {
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
          console.log(`      ⚠️  Botão Compartilhar não encontrado`);
          if (attempt < this.config.maxRetries) {
            await this.page.waitForTimeout(500);
            continue;
          }
          return null;
        }

        console.log(`      ✓ Botão clicado`);
        await this.page.waitForTimeout(1500);

        await this.context.grantPermissions(['clipboard-read', 'clipboard-write']);

        console.log(`      → Tab 4x + Enter...`);
        for (let i = 0; i < 4; i++) {
          await this.page.keyboard.press('Tab');
          await this.page.waitForTimeout(150);
        }

        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(800);

        const clipboardText = await this.page.evaluate(async () => {
          return await navigator.clipboard.readText();
        });

        console.log(`      → Clipboard: ${clipboardText ? clipboardText.substring(0, 60) + '...' : 'VAZIO'}`);

        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(200);

        if (clipboardText && clipboardText.includes('mercadolivre.com/sec/')) {
          console.log(`      ✅ Link de afiliado obtido!`);
          return clipboardText;
        }

        console.log(`      ❌ Link inválido ou vazio`);
        
        if (attempt < this.config.maxRetries) {
          await this.page.waitForTimeout(500);
          continue;
        }

        return null;

      } catch (error) {
        console.log(`      ❌ Erro: ${error.message}`);
        if (attempt < this.config.maxRetries) {
          try { await this.page.keyboard.press('Escape'); } catch (e) {}
          await this.page.waitForTimeout(500);
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
          await this.page.waitForTimeout(800);

          await this.page.evaluate(async () => {
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 100));
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 300));
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

          console.log(`   🔗 Obtendo links de afiliado...\n`);
          
          for (const prodData of newProducts) {
            if (allProducts.length >= this.limit) {
              console.log(`   🎯 META! ${allProducts.length}/${this.limit}\n`);
              break;
            }

            this.processedLinks.add(prodData.link);

            console.log(`\n   📱 [${allProducts.length + 1}/${this.limit}] ${prodData.name.substring(0, 40)}...`);
            const affiliateLink = await this.getAffiliateLink(prodData.link);

            if (!affiliateLink) {
              console.log(`      ⚠️  FALHOU - Usando link original como fallback\n`);
            }

            const product = {
              nome: prodData.name,
              imagem: prodData.image,
              link_original: prodData.link,
              link_afiliado: affiliateLink || prodData.link,
              desconto: `${prodData.discount}%`,
              preco: `R$ ${prodData.currentPrice}`,
              preco_anterior: `R$ ${prodData.oldPrice}`,
              preco_de: String(prodData.oldPrice),
              preco_para: String(prodData.currentPrice),
              categoria: this.categoriaInfo.nome,
              marketplace: 'ML',
              isActive: true
            };

            const result = await this.processProduct(product, allProducts);
           
            if (result.action === 'add' || result.action === 'update') {
              if (result.action === 'update') {
                product._shouldUpdate = true;
                product._oldLink = result.oldLink;
              }
             
              allProducts.push(product);
              this.stats.productsCollected++;
              
              if (affiliateLink && affiliateLink.includes('mercadolivre.com/sec/')) {
                console.log(`      ✅ SALVO COM LINK DE AFILIADO: ${affiliateLink}\n`);
              } else {
                console.log(`      ⚠️  SALVO COM LINK ORIGINAL (falha ao obter afiliado)\n`);
              }
            }

            try {
              await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 3000 });
              await this.page.waitForTimeout(200);
            } catch (e) {
              await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
              await this.page.waitForTimeout(300);
            }
          }

          if (allProducts.length >= this.limit) break;

          this.stats.pagesScraped = pageNum;
          pageNum++;
          currentOffset += 48;
          await this.page.waitForTimeout(300);

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