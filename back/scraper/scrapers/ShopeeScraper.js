const axios = require('axios');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');

class ShopeeScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    this.existingProductsMap = new Map();
    
    this.categoria = options.categoria || 'todas';
    this.maxPrice = options.maxPrice || null;
    
    // ID de afiliado da Shopee
    this.affiliateId = process.env.SHOPEE_AFFILIATE_ID || '18182230010';
    
    // Base API URL (não oficial)
    this.apiBase = 'https://shopee.com.br/api/v4';
  }

  /**
   * Gera link de afiliado no formato correto da Shopee
   */
  generateAffiliateLink(shopId, itemId) {
    const productUrl = `https://shopee.com.br/product/${shopId}/${itemId}`;
    
    const params = new URLSearchParams({
      'af_siteid': this.affiliateId,
      'pid': 'affiliates',
      'af_click_lookback': '7d',
      'af_viewthrough_lookback': '1d',
      'is_retargeting': 'true',
      'af_reengagement_window': '7d'
    });
    
    return `${productUrl}?${params.toString()}`;
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes do banco...');
   
    try {
      const conn = getProductConnection();
      const Product = getProductModel('shopee', conn);
      
      const products = await Product.find({}).select('link_original nome desconto preco_para preco_de isActive marketplace categoria').lean();
     
      console.log(`   📊 Produtos da Shopee encontrados: ${products.length}`);
     
      if (products.length > 0) {
        console.log(`   ├─ Ativos: ${products.filter(p => p.isActive).length}`);
        console.log(`   └─ Inativos: ${products.filter(p => !p.isActive).length}`);
      }
     
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

    let allProducts = [];
    let offset = 0;
    const limit = 60; // Items por página
    const maxPages = 50;
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    let emptyPagesCount = 0;
    let pageNum = 1;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  🛍️  SHOPEE BRASIL - API PUBLICA                   ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+ desconto)            ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const progressBar = this.getProgressBar(allProducts.length, this.limit);
        console.log(`📄 Pág ${pageNum.toString().padStart(2, '0')}/${maxPages} ${progressBar} [${allProducts.length}/${this.limit}] (${this.duplicatesIgnored} ignorados | ${this.betterOffersUpdated} melhorados)`);
       
        try {
          // ✅ USA API PUBLICA DA SHOPEE
          // Busca produtos com desconto
          const url = `${this.apiBase}/search/search_items`;
          
          const params = {
            by: 'relevancy',
            keyword: 'desconto oferta',
            limit: limit,
            newest: offset,
            order: 'desc',
            page_type: 'search',
            scenario: 'PAGE_GLOBAL_SEARCH',
            version: 2
          };
          
          const response = await axios.get(url, {
            params,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://shopee.com.br/',
              'Accept': 'application/json'
            },
            timeout: 30000
          });

          const items = response.data?.items || [];
          
          console.log(`   🔍 Resposta da API: ${items.length} items`);

          for (const item of items) {
            try {
              const itemBasic = item.item_basic || {};
              
              // Extrai dados
              const shopId = itemBasic.shopid;
              const itemId = itemBasic.itemid;
              const name = itemBasic.name || '';
              const image = itemBasic.image ? `https://cf.shopee.com.br/file/${itemBasic.image}` : '';
              
              // Preços em centavos
              const currentPrice = itemBasic.price || 0;
              const originalPrice = itemBasic.price_before_discount || currentPrice;
              
              // Calcula desconto
              let discount = 0;
              if (originalPrice > currentPrice && currentPrice > 0) {
                discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
              }
              
              // Filtros
              if (discount < this.minDiscount) continue;
              
              // Filtro de preço máximo
              if (this.maxPrice) {
                const maxPriceCents = parseInt(this.maxPrice) * 100000; // API usa centavos * 100
                if (currentPrice > maxPriceCents) continue;
              }
              
              // Formata preços (API usa centavos * 100000)
              const formattedCurrent = (currentPrice / 100000).toFixed(2);
              const formattedOld = (originalPrice / 100000).toFixed(2);
              
              const product = {
                nome: name,
                imagem: image,
                link_original: `https://shopee.com.br/product/${shopId}/${itemId}`,
                preco: `R$ ${formattedCurrent}`,
                preco_anterior: `R$ ${formattedOld}`,
                preco_de: Math.round(originalPrice / 1000).toString(),
                preco_para: Math.round(currentPrice / 1000).toString(),
                desconto: `${discount}%`,
                marketplace: 'Shopee',
                categoria: 'Ofertas Shopee',
                isActive: true,
                link_afiliado: this.generateAffiliateLink(shopId, itemId)
              };
              
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
              
            } catch (itemError) {
              // Silencioso
            }
          }

          if (items.length === 0) {
            emptyPagesCount++;
            console.log(`   ⚠️  Página vazia (${emptyPagesCount}/3).\n`);
            
            if (emptyPagesCount >= 3) {
              console.log(`   ⚠️  3 páginas vazias consecutivas, encerrando.\n`);
              break;
            }
          } else {
            emptyPagesCount = 0;
          }

          if (allProducts.length >= this.limit) break;

          offset += limit;
          pageNum++;
          
          // Aguarda entre requests
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}:`, pageError.message);
          pageNum++;
        }
      }

      const finalProducts = allProducts.slice(0, this.limit);
     
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║           🏁 SCRAPING FINALIZADO 🏁              ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`✨ Produtos coletados: ${finalProducts.length}/${this.limit}`);
      console.log(`   └─ Novos: ${finalProducts.filter(p => !p._shouldUpdate).length}`);
      console.log(`   └─ Ofertas melhoradas: ${this.betterOffersUpdated}`);
      console.log(`⏭️  Ignorados (pior/igual oferta): ${this.duplicatesIgnored}`);
      console.log(`📄 Páginas percorridas: ${pageNum - 1}`);
      console.log(`💾 Produtos no banco antes: ${this.existingProductsMap.size}`);
      console.log(`🔗 ID Afiliado Shopee: ${this.affiliateId}`);
      
      if (finalProducts.length > 0) {
        console.log(`\n🔗 Exemplo de link gerado:`);
        console.log(`   ${finalProducts[0].link_afiliado.substring(0, 100)}...`);
      }
      
      if (this.maxPrice) {
        console.log(`\n💰 Filtro de preço: Máximo R$ ${this.maxPrice}`);
      }
     
      if (finalProducts.length < this.limit) {
        console.log(`\n⚠️  ATENÇÃO: Só ${finalProducts.length} produtos válidos.`);
        console.log(`   • Reduza MIN_DISCOUNT para mais resultados`);
        if (this.maxPrice) {
          console.log(`   • Aumente o filtro de preço (atual: R$ ${this.maxPrice})`);
        }
      }
     
      console.log('╚════════════════════════════════════════════════════╝\n');

      return finalProducts;

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
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

module.exports = ShopeeScraper;