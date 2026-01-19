const { chromium } = require('playwright');
const Product = require('../../database/models/Product');

class MercadoLivreScraper {
  constructor(minDiscount = 30) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    this.existingProductsMap = new Map();

    // Mapeamento profissional de IDs de categoria do Mercado Livre
    this.categoryIds = {
      'tecnologia': 'MLB1051',
      'beleza': 'MLB1246',
      'eletrodomesticos': 'MLB5726',
      'casa': 'MLB1574',
      'ferramentas': 'MLB1506',
      'moda': 'MLB1430',
      'brinquedos': 'MLB1132',
      'informatica': 'MLB1648'
    };
  }

  /**
   * Carrega produtos existentes do MongoDB
   */
  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes do banco...');
    try {
      const products = await Product.find({ 
        marketplace: { $in: ['ML', 'ml', 'Mercado Livre', 'mercadolivre', 'MercadoLivre'] }
      }).select('link_original nome desconto preco_para preco_de isActive marketplace').lean();
      
      console.log(`   📊 Produtos do Mercado Livre encontrados: ${products.length}`);
      
      products.forEach(p => {
        if (p.link_original) {
          p.desconto = String(p.desconto || '0').replace(/\D/g, '');
          p.preco_para = String(p.preco_para || '0').replace(/\D/g, '');
          this.existingProductsMap.set(p.link_original, p);
        }
      });
      console.log(`   ✅ ${this.existingProductsMap.size} produtos carregados no cache\n`);
    } catch (error) {
      console.error('⚠️ Erro ao carregar produtos do banco:', error.message);
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
    if (newDiscount > existingDiscount) return true;
    if (newDiscount === existingDiscount && newPrice < existingPrice) return true;
    return false;
  }

  async processProduct(product, collectedProducts) {
    const normalizedName = this.normalizeProductName(product.nome);
    const duplicateInMemory = collectedProducts.some(p => {
      const existingNormalized = this.normalizeProductName(p.nome);
      return p.link_original === product.link_original ||
             existingNormalized.split(' ').slice(0, 5).join(' ') === 
             normalizedName.split(' ').slice(0, 5).join(' ');
    });

    if (duplicateInMemory) return { action: 'skip', reason: 'duplicate_in_memory' };

    const existingInDb = this.existingProductsMap.get(product.link_original);
    if (!existingInDb) {
      for (const [link, existingProd] of this.existingProductsMap.entries()) {
        const existingNormalized = this.normalizeProductName(existingProd.nome);
        if (existingNormalized.split(' ').slice(0, 5).join(' ') === 
            normalizedName.split(' ').slice(0, 5).join(' ')) {
          if (this.isBetterOffer(product, existingProd)) {
            return { action: 'update', reason: 'better_offer', oldLink: link };
          } else {
            return { action: 'skip', reason: 'worse_offer' };
          }
        }
      }
      return { action: 'add', reason: 'new_product' };
    }

    if (this.isBetterOffer(product, existingInDb)) {
      return { action: 'update', reason: 'better_offer', oldLink: product.link_original };
    }
    return { action: 'skip', reason: 'worse_or_equal_offer' };
  }

  async scrapeCategory(options = {}) {
    const { category = null, maxPrice = null } = options;
    await this.loadExistingProducts();

    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 50;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║ 🎯 META: ${this.limit} produtos | Cat: ${category || 'Geral'} | Máx: ${maxPrice || 'Sem limite'} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const offset = (pageNum - 1) * 48;
        
        // CONSTRUÇÃO DA URL COM FILTROS
        let url = `https://www.mercadolivre.com.br/ofertas?page=${pageNum}${offset > 0 ? `&_Desde_${offset + 1}` : ''}`;
        const catId = this.categoryIds[category?.toLowerCase()] || category;
        if (catId) url += `&category_id=${catId}`;
        if (maxPrice) url += `&price=-${maxPrice}`;

        const progressBar = this.getProgressBar(allProducts.length, this.limit);
        console.log(`📄 Pág ${pageNum.toString().padStart(2, '0')}/${maxPages} ${progressBar} [${allProducts.length}/${this.limit}]`);
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(2000);

          await page.evaluate(async () => {
            for (let i = 0; i < 5; i++) {
              window.scrollBy(0, 800);
              await new Promise(r => setTimeout(r, 400));
            }
            window.scrollTo(0, 0);
          });

          await page.waitForTimeout(1500);

          const productsFromPage = await page.evaluate(({ minDisc }) => {
            const items = document.querySelectorAll('.poly-card, .promotion-item__container, .ui-search-result, [class*="promotion-item"]');
            const results = [];

            items.forEach(item => {
              try {
                const discEl = item.querySelector('.poly-discount-badge, .andes-money-amount__discount, .promotion-item__discount-text, [class*="discount"]');
                const discountText = discEl ? discEl.innerText : '';
                const discountVal = parseInt(discountText.replace(/[^\d]/g, '')) || 0;

                if (discountVal >= minDisc) {
                  const titleEl = item.querySelector('.poly-component__title, .promotion-item__title, .ui-search-item__title, h2, [class*="title"]');
                  const linkEl = item.querySelector('a');
                  const imgEl = item.querySelector('img');
                  const priceElements = item.querySelectorAll('.andes-money-amount__fraction');
                  
                  let currentPrice = '0';
                  let oldPrice = '0';
                  
                  if (priceElements.length >= 2) {
                    currentPrice = priceElements[0].innerText.replace(/\./g, '');
                    oldPrice = priceElements[1].innerText.replace(/\./g, '');
                  } else if (priceElements.length === 1) {
                    currentPrice = priceElements[0].innerText.replace(/\./g, '');
                    const currentVal = parseInt(currentPrice);
                    oldPrice = Math.round(currentVal / (1 - discountVal / 100)).toString();
                  }

                  if (titleEl && linkEl && linkEl.href) {
                    const cleanLink = linkEl.href.split('?')[0];
                    if (!cleanLink || cleanLink.length < 20 || !cleanLink.startsWith('http')) return;
                    
                    results.push({
                      nome: titleEl.innerText.trim(),
                      imagem: imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '',
                      link_original: cleanLink,
                      preco: `R$ ${currentPrice}`,
                      preco_anterior: `R$ ${oldPrice}`,
                      preco_de: oldPrice,
                      preco_para: currentPrice,
                      desconto: `${discountVal}%`,
                      marketplace: 'ML',
                      isActive: true
                    });
                  }
                }
              } catch (e) {}
            });
            return results;
          }, { minDisc: this.minDiscount });

          for (const product of productsFromPage) {
            const result = await this.processProduct(product, allProducts);
            if (result.action === 'add' || result.action === 'update') {
              if (result.action === 'update') {
                product._shouldUpdate = true;
                product._oldLink = result.oldLink;
                this.betterOffersUpdated++;
              }
              allProducts.push(product);
              if (allProducts.length >= this.limit) break;
            } else {
              this.duplicatesIgnored++;
            }
          }

          if (productsFromPage.length === 0) break;
          if (allProducts.length >= this.limit) break;
          pageNum++;
          await page.waitForTimeout(1500 + Math.random() * 1000);

        } catch (pageError) {
          pageNum++;
        }
      }

      await browser.close();
      return allProducts.slice(0, this.limit);

    } catch (error) {
      await browser.close();
      return allProducts.slice(0, this.limit);
    }
  }

  getProgressBar(current, total) {
    const percentage = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`;
  }
}

module.exports = MercadoLivreScraper;