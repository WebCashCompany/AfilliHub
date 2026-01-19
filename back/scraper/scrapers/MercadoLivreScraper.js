const { chromium } = require('playwright');
const Product = require('../../database/models/Product');
const { getCategoria } = require('../../config/categorias-ml');

class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    this.existingProductsMap = new Map();
    
    this.categoria = options.categoria || 'todas';
    this.categoriaInfo = getCategoria(this.categoria);
    this.maxPrice = options.maxPrice || null;
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes do banco...');
   
    try {
      const products = await Product.find({
        marketplace: { $in: ['ML', 'ml', 'Mercado Livre', 'mercadolivre', 'MercadoLivre'] }
      }).select('link_original nome desconto preco_para preco_de isActive marketplace categoria').lean();
     
      console.log(`   📊 Produtos do Mercado Livre encontrados: ${products.length}`);
     
      if (products.length > 0) {
        console.log(`   📊 Exemplo do primeiro produto:`, {
          nome: products[0].nome?.substring(0, 30),
          marketplace: products[0].marketplace,
          categoria: products[0].categoria,
          link_original: products[0].link_original ? products[0].link_original.substring(0, 50) + '...' : '❌ VAZIO',
          isActive: products[0].isActive
        });
      }
     
      console.log(`   ├─ Ativos: ${products.filter(p => p.isActive).length}`);
      console.log(`   └─ Inativos: ${products.filter(p => !p.isActive).length}`);
     
      let added = 0;
      products.forEach(p => {
        if (p.link_original) {
          p.desconto = String(p.desconto || '0').replace(/\D/g, '');
          p.preco_para = String(p.preco_para || '0').replace(/\D/g, '');
          this.existingProductsMap.set(p.link_original, p);
          added++;
        }
      });
     
      console.log(`   ✅ ${added} produtos carregados no cache\n`);
    } catch (error) {
      console.error('⚠️  Erro ao carregar produtos do banco:', error.message);
    }
  }

  normalizeProductName(name) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

    if (duplicateInMemory) {
      return { action: 'skip', reason: 'duplicate_in_memory' };
    }

    const existingInDb = this.existingProductsMap.get(product.link_original);
   
    if (!existingInDb) {
      for (const [link, existingProd] of this.existingProductsMap.entries()) {
        const existingNormalized = this.normalizeProductName(existingProd.nome);
        if (existingNormalized.split(' ').slice(0, 5).join(' ') ===
            normalizedName.split(' ').slice(0, 5).join(' ')) {
         
          if (this.isBetterOffer(product, existingProd)) {
            return {
              action: 'update',
              reason: 'better_offer',
              oldLink: link
            };
          } else {
            return { action: 'skip', reason: 'worse_offer' };
          }
        }
      }
     
      return { action: 'add', reason: 'new_product' };
    }

    if (this.isBetterOffer(product, existingInDb)) {
      return {
        action: 'update',
        reason: 'better_offer',
        oldLink: product.link_original
      };
    }

    return { action: 'skip', reason: 'worse_or_equal_offer' };
  }

  async scrapeCategory() {
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
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    let emptyPagesCount = 0; // ✅ Contador de páginas vazias consecutivas

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      if (this.categoriaInfo) {
        console.log(`║  ${this.categoriaInfo.emoji}  CATEGORIA: ${this.categoriaInfo.nome.padEnd(38)} ║`);
      }
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+ desconto)            ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const offset = (pageNum - 1) * 48;
        
        const baseUrl = this.categoriaInfo ? this.categoriaInfo.url : 'https://www.mercadolivre.com.br/ofertas';
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = `${baseUrl}${separator}page=${pageNum}${offset > 0 ? `&_Desde_${offset + 1}` : ''}`;
       
        const progressBar = this.getProgressBar(allProducts.length, this.limit);
        console.log(`📄 Pág ${pageNum.toString().padStart(2, '0')}/${maxPages} ${progressBar} [${allProducts.length}/${this.limit}] (${this.duplicatesIgnored} ignorados | ${this.betterOffersUpdated} melhorados)`);
       
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); // ✅ Aumentado para 60s
          await page.waitForTimeout(3000); // ✅ Aumentado para 3s

          await page.evaluate(async () => {
            for (let i = 0; i < 5; i++) {
              window.scrollBy(0, 800);
              await new Promise(r => setTimeout(r, 400));
            }
            window.scrollTo(0, 0);
          });

          await page.waitForTimeout(1500);

          const productsFromPage = await page.evaluate(({ minDisc, maxPriceLimit }) => {
            const items = document.querySelectorAll('.poly-card, .promotion-item__container, .ui-search-result, [class*="promotion-item"]');
            const results = [];

            items.forEach(item => {
              try {
                const discEl = item.querySelector(
                  '.poly-discount-badge, .andes-money-amount__discount, .promotion-item__discount-text, [class*="discount"]'
                );
                const discountText = discEl ? discEl.innerText : '';
                const discountVal = parseInt(discountText.replace(/[^\d]/g, '')) || 0;

                if (discountVal >= minDisc) {
                  const titleEl = item.querySelector(
                    '.poly-component__title, .promotion-item__title, .ui-search-item__title, h2, [class*="title"]'
                  );
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

                  const currentPriceNum = parseInt(currentPrice);
                  const oldPriceNum = parseInt(oldPrice);
                  
                  let finalCurrentPrice = currentPrice;
                  let finalOldPrice = oldPrice;
                  
                  if (currentPriceNum > oldPriceNum) {
                    finalCurrentPrice = oldPrice;
                    finalOldPrice = currentPrice;
                  }

                  if (maxPriceLimit) {
                    const maxPrice = parseInt(maxPriceLimit);
                    const productPrice = parseInt(finalCurrentPrice);
                    
                    if (productPrice > maxPrice) {
                      return;
                    }
                  }

                  if (titleEl && linkEl && linkEl.href) {
                    const cleanLink = linkEl.href.split('?')[0];
                   
                    if (!cleanLink || cleanLink.length < 20 || !cleanLink.startsWith('http')) {
                      return;
                    }
                   
                    results.push({
                      nome: titleEl.innerText.trim(),
                      imagem: imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '',
                      link_original: cleanLink,
                      preco: `R$ ${finalCurrentPrice}`,
                      preco_anterior: `R$ ${finalOldPrice}`,
                      preco_de: finalOldPrice,
                      preco_para: finalCurrentPrice,
                      desconto: `${discountVal}%`,
                      marketplace: 'ML',
                      isActive: true
                    });
                  }
                }
              } catch (e) {
                // Silencioso
              }
            });
           
            return results;
          }, { 
            minDisc: this.minDiscount,
            maxPriceLimit: this.maxPrice
          });

          for (const product of productsFromPage) {
            if (!product.link_original || product.link_original.length < 20) {
              continue;
            }

            product.categoria = this.categoriaInfo ? this.categoriaInfo.nome : 'Todas as Ofertas';

            const result = await this.processProduct(product, allProducts);
           
            if (result.action === 'add' || result.action === 'update') {
              if (result.action === 'update') {
                product._shouldUpdate = true;
                product._oldLink = result.oldLink;
                this.betterOffersUpdated++;
              }
             
              allProducts.push(product);
             
              if (allProducts.length >= this.limit) {
                console.log(`   ✅ Limite atingido! ${allProducts.length}/${this.limit}\n`);
                break;
              }
            } else {
              this.duplicatesIgnored++;
            }
          }

          // Contador de páginas vazias consecutivas
          if (productsFromPage.length === 0) {
            emptyPagesCount = (emptyPagesCount || 0) + 1;
            console.log(`   ⚠️  Página vazia (${emptyPagesCount}/3).\n`);
            
            // Só para se tiver 3 páginas vazias seguidas
            if (emptyPagesCount >= 3) {
              console.log(`   ⚠️  3 páginas vazias consecutivas, encerrando.\n`);
              break;
            }
          } else {
            emptyPagesCount = 0; // Reseta contador se encontrou produtos
          }

          if (allProducts.length >= this.limit) break;

          pageNum++;
          await page.waitForTimeout(1500 + Math.random() * 1000);

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}:`, pageError.message);
          pageNum++;
        }
      }

      await browser.close();

      const finalProducts = allProducts.slice(0, this.limit);
     
      const affiliateId = process.env.ML_AFFILIATE_ID || '77997172';
      const productsWithAffiliate = finalProducts.map(p => ({
        ...p,
        link_afiliado: `${p.link_original.split('?')[0]}?matt_tool=${affiliateId}&utm_source=affiliate&utm_medium=webcash`
      }));
     
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║           🏁 SCRAPING FINALIZADO 🏁              ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`✨ Produtos coletados: ${finalProducts.length}/${this.limit}`);
      console.log(`   └─ Novos: ${finalProducts.filter(p => !p._shouldUpdate).length}`);
      console.log(`   └─ Ofertas melhoradas: ${this.betterOffersUpdated}`);
      console.log(`⏭️  Ignorados (pior/igual oferta): ${this.duplicatesIgnored}`);
      console.log(`📄 Páginas percorridas: ${pageNum - 1}`);
      console.log(`💾 Produtos no banco antes: ${this.existingProductsMap.size}`);
      
      if (this.maxPrice) {
        console.log(`💰 Filtro de preço: Máximo R$ ${this.maxPrice}`);
      }
     
      if (finalProducts.length < this.limit) {
        console.log(`\n⚠️  ATENÇÃO: Só ${finalProducts.length} produtos válidos.`);
        console.log(`   • Reduza MIN_DISCOUNT para mais resultados`);
        if (this.maxPrice) {
          console.log(`   • Aumente o filtro de preço (atual: R$ ${this.maxPrice})`);
        }
      }
     
      console.log('╚════════════════════════════════════════════════════╝\n');

      return productsWithAffiliate;

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      await browser.close();
      
      const affiliateId = process.env.ML_AFFILIATE_ID || '77997172';
      return allProducts.slice(0, this.limit).map(p => ({
        ...p,
        link_afiliado: `${p.link_original.split('?')[0]}?matt_tool=${affiliateId}&utm_source=affiliate&utm_medium=webcash`
      }));
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