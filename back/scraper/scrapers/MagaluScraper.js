/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAGALU SCRAPER - USANDO API INTERNA (SEM CAPTCHA)
 * ═══════════════════════════════════════════════════════════════════════
 * @version 4.0.0 - API Direct Access
 * @description Acessa a API interna do Magazine Luiza para evitar captcha
 * 
 * VANTAGENS:
 * - ✅ Sem captcha
 * - ✅ Rápido (JSON direto)
 * - ✅ FREE
 * - ✅ Funciona no Render
 * 
 * DESVANTAGENS:
 * - ⚠️ Pode parar de funcionar se mudarem a API
 * - ⚠️ Precisa descobrir endpoints de cada categoria
 */

const axios = require('axios');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoryName, MAGALU_CATEGORIES } = require('../../config/categorias-magalu');

class MagaluScraperAPI {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    
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
    
    // Headers para parecer um browser real
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.magazinevoce.com.br/',
      'Origin': 'https://www.magazinevoce.com.br',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="131", "Google Chrome";v="131"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };
  }

  setCategory(categoryKey) {
    if (!categoryKey) {
      console.warn('⚠️  setCategory chamado sem categoryKey, mantendo categoria atual');
      return;
    }

    if (!MAGALU_CATEGORIES[categoryKey]) {
      console.error(`❌ Categoria "${categoryKey}" não existe nas configurações`);
      throw new Error(`Categoria "${categoryKey}" não existe`);
    }
    
    const oldCategory = this.currentCategory;
    this.currentCategory = categoryKey;
    this.categoryName = MAGALU_CATEGORIES[categoryKey].name;
    this.categoryNameForDB = getCategoryName(categoryKey);
    
    console.log(`🔄 Categoria alterada: "${oldCategory}" → "${this.currentCategory}"`);
  }

  getCurrentCategory() {
    return {
      key: this.currentCategory,
      name: this.categoryName,
      dbName: this.categoryNameForDB
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

  checkDuplicate(product) {
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

  extractPriceInCents(priceFloat) {
    return Math.round(priceFloat * 100);
  }

  calculateDiscount(oldPrice, currentPrice) {
    if (!oldPrice || !currentPrice || oldPrice <= currentPrice) {
      return 0;
    }
    const discount = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
    return Math.max(0, Math.min(99, discount));
  }

  /**
   * Mapeia a categoria para o endpoint da API
   */
  getCategoryApiEndpoint(categoryKey) {
    const endpoints = {
      'OFERTAS_DIA': '/api/catalog/v2/selecao/ofertasdodia',
      'ELETRONICOS': '/api/catalog/v2/categoria/eletronicos',
      'CASA': '/api/catalog/v2/categoria/casa-e-decoracao',
      'ESPORTE': '/api/catalog/v2/categoria/esporte-e-lazer',
      // Adicione mais conforme descobrir
    };

    return endpoints[categoryKey] || endpoints['OFERTAS_DIA'];
  }

  async scrapeCategory() {
    const startTime = Date.now();
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║   🔍 SCRAPING VIA API INTERNA                       ║`);
    console.log(`╚════════════════════════════════════════════════════╝`);
    console.log(`🎯 Categoria: ${this.categoryName}`);
    console.log(`💾 DB: ${this.categoryNameForDB}`);
    console.log(`🏪 Affiliate ID: ${this.affiliateId}\n`);
    
    await this.loadExistingProducts();

    let allProducts = [];
    let pageNum = 1;
    const maxPages = 50;
    let emptyPagesCount = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║   📂 ${this.categoryName.padEnd(48)} ║`);
      console.log(`║   🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(19)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        console.log(`📄 Página ${pageNum.toString().padStart(2, '0')}/${maxPages} [${allProducts.length}/${this.limit}]`);
        
        try {
          const apiEndpoint = this.getCategoryApiEndpoint(this.currentCategory);
          const url = `https://www.magazinevoce.com.br${apiEndpoint}`;
          
          console.log(`🔗 API: ${url}`);
          
          const response = await axios.get(url, {
            params: {
              page: pageNum,
              limit: 48
            },
            headers: this.headers,
            timeout: 30000
          });

          // Estrutura da resposta pode variar
          let productsData = [];
          
          if (response.data.products) {
            productsData = response.data.products;
          } else if (response.data.data && response.data.data.products) {
            productsData = response.data.data.products;
          } else if (Array.isArray(response.data)) {
            productsData = response.data;
          } else {
            console.log('⚠️  Estrutura de resposta desconhecida');
            console.log('   Estrutura recebida:', Object.keys(response.data));
            break;
          }

          console.log(`   ✅ API retornou: ${productsData.length} produtos`);

          if (productsData.length === 0) {
            emptyPagesCount++;
            if (emptyPagesCount >= 2) {
              console.log(`   ⚠️  Sem produtos, encerrando\n`);
              break;
            }
            pageNum++;
            continue;
          }

          let newProductsCount = 0;

          for (const item of productsData) {
            if (allProducts.length >= this.limit) break;

            try {
              // Extrai dados do JSON
              const productName = item.title || item.name || item.productTitle || '';
              if (!productName || productName.length < 3) continue;

              const productId = item.id || item.productId || item.code || '';
              if (!productId) continue;

              // Preços
              const currentPrice = item.price?.current || item.priceFrom || item.bestPrice || 0;
              const oldPrice = item.price?.from || item.priceFrom || item.originalPrice || currentPrice;

              if (!currentPrice || currentPrice === 0) continue;

              const currentPriceCents = this.extractPriceInCents(currentPrice);
              const oldPriceCents = this.extractPriceInCents(oldPrice);

              const discount = this.calculateDiscount(oldPriceCents, currentPriceCents);

              if (discount < this.minDiscount) {
                this.stats.filteredByDiscount++;
                continue;
              }

              // Imagem
              const imageUrl = item.image || item.imageUrl || item.images?.[0] || '';

              // Link do produto
              const productSlug = item.slug || item.url || '';
              let productLink = '';
              
              if (productSlug.startsWith('http')) {
                productLink = productSlug;
              } else {
                productLink = `https://www.magazinevoce.com.br/${this.affiliateId}/produto/${productId}/${productSlug}`;
              }

              const cleanLink = productLink.split('?')[0].split('#')[0];

              const product = {
                nome: productName,
                imagem: imageUrl,
                link_original: cleanLink,
                preco_de: oldPriceCents.toString(),
                preco_para: currentPriceCents.toString(),
                desconto: discount.toString(),
                categoria: this.categoryNameForDB,
                marketplace: 'MAGALU',
                isActive: true
              };

              const dupCheck = this.checkDuplicate(product);
              
              if (dupCheck.isDuplicate) {
                this.stats.duplicatesIgnored++;
                continue;
              }
              
              this.seenLinks.add(product.link_original);
              const productKey = this.generateProductKey(product.nome);
              this.seenProductKeys.add(productKey);
              
              const finalProduct = {
                ...product,
                preco: this.formatPrice(currentPriceCents),
                preco_anterior: this.formatPrice(oldPriceCents),
                desconto: `${discount}%`
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

            } catch (itemError) {
              console.log(`   ⚠️  Erro ao processar item:`, itemError.message);
              this.stats.invalidProducts++;
            }
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
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}:`, pageError.message);
          
          if (pageError.response) {
            console.log(`   Status: ${pageError.response.status}`);
            console.log(`   Data:`, JSON.stringify(pageError.response.data).substring(0, 200));
          }
          
          this.stats.errors++;
          
          // Se recebeu 404 ou 403, provavelmente acabou
          if (pageError.response && [404, 403].includes(pageError.response.status)) {
            console.log(`   ⚠️  API retornou ${pageError.response.status}, encerrando\n`);
            break;
          }
          
          pageNum++;
        }
      }

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
      return allProducts.slice(0, this.limit);
    }
  }
}

module.exports = MagaluScraperAPI;