const Product = require('../../database/models/Product');
const MLProductAPI = require('../../api/mercadolivre/MLProductAPI');
const MLAffiliateAPI = require('../../api/mercadolivre/MLAffiliateAPI');
const MercadoLivreScraper = require('../scrapers/MercadoLivreScraper');

class ScrapingService {
  constructor() {
    this.marketplaces = new Map();
    this.mlAffiliateApi = new MLAffiliateAPI();
    this.initializeMarketplaces();
  }

  initializeMarketplaces() {
    try {
      this.marketplaces.set('mercadolivre', {
        name: 'Mercado Livre',
        code: 'ML',
        api: new MLProductAPI(),
        scraper: new MercadoLivreScraper(),
        enabled: true
      });
    } catch (error) {
      console.error('⚠️ Mercado Livre não disponível:', error.message);
    }
  }

  async collectFromMarketplace(marketplaceName, options = {}) {
    const { minDiscount = 30, limit = 50, mode = 'auto' } = options;
    const marketplace = this.marketplaces.get(marketplaceName.toLowerCase());
    let products = [];

    if (!marketplace) throw new Error(`Marketplace "${marketplaceName}" não encontrado`);

    console.log(`\n🚀 INICIANDO COLETA: ${marketplace.name.toUpperCase()}`);

    if (mode === 'api' || mode === 'auto') {
      try {
        console.log('🔵 Tentando via API oficial...');
        const connected = await marketplace.api.testConnection();
        if (connected) {
          products = await marketplace.api.searchDeals(minDiscount, limit);
        }
      } catch (err) {
        console.log('⚠️ API bloqueada ou offline, mudando para Scraper...');
      }
    }

    if (products.length === 0 && (mode === 'scraper' || mode === 'auto')) {
      console.log('🟡 Usando Web Scraper (Playwright)...');
      marketplace.scraper.minDiscount = minDiscount;
      marketplace.scraper.limit = limit;
      products = await marketplace.scraper.scrapeCategory();
    }

    // Gera links de afiliado (formato oficial ML)
    if (products.length > 0) {
      console.log(`🔗 Gerando ${products.length} links de afiliado (formato oficial)...`);
      
      const urls = products.map(p => p.link_original);
      const affiliateLinks = await this.mlAffiliateApi.generateAffiliateLinks(urls);

      // Mapeia os links gerados para os produtos
      products.forEach(product => {
        const found = affiliateLinks.find(link => link.source === product.link_original);
        
        if (found && found.success) {
          product.link_afiliado = found.affiliate_link;
        } else {
          console.warn(`⚠️  Falha ao gerar link para: ${product.nome.substring(0, 30)}...`);
          // Mantém link original se falhar
          product.link_afiliado = product.link_original;
        }
      });

      console.log('✅ Links de afiliado aplicados!\n');
    }

    return products;
  }

  async saveProducts(products, marketplaceCode = 'ML') {
    console.log(`\n💾 Salvando/Atualizando no MongoDB...`);
    let inserted = 0, updated = 0, errors = 0, duplicates = 0;

    for (const product of products) {
      try {
        // Normaliza nome para detectar duplicatas
        const normalizedName = this.normalizeProductName(product.nome);
        
        // Busca por link original
        const query = { link_original: product.link_original };
        const existing = await Product.findOne(query);

        if (existing) {
          // Atualiza produto existente
          await Product.updateOne(
            { _id: existing._id }, 
            { 
              $set: { 
                ...product, 
                nome_normalizado: normalizedName,
                updatedAt: new Date(), 
                isActive: true 
              } 
            }
          );
          updated++;
        } else {
          // Cria novo produto
          await Product.create({ 
            ...product, 
            nome_normalizado: normalizedName,
            createdAt: new Date() 
          });
          inserted++;
          console.log(`   ✨ ${product.nome.substring(0, 40)}...`);
        }
      } catch (err) {
        if (err.code === 11000) {
          duplicates++;
          console.log(`   ⏭️  Duplicata: ${product.nome.substring(0, 40)}...`);
        } else {
          errors++;
          console.error(`   ❌ Erro: ${product.nome.substring(0, 30)}...`, err.message);
        }
      }
    }

    console.log(`\n╔═══════════════════════════════════════╗`);
    console.log(`║        📊 RESULTADO FINAL 📊         ║`);
    console.log(`╚═══════════════════════════════════════╝`);
    console.log(`✨ Novos produtos: ${inserted}`);
    console.log(`📝 Atualizados: ${updated}`);
    console.log(`⏭️  Duplicatas ignoradas: ${duplicates}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📦 Total processados: ${products.length}\n`);

    return { inserted, updated, duplicates, errors };
  }

  /**
   * Normaliza nome do produto para detectar duplicatas
   */
  normalizeProductName(name) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 5)
      .join(' ');
  }

  listMarketplaces() {
    console.log('📋 Marketplaces disponíveis:\n');
    for (const [key, mp] of this.marketplaces.entries()) {
      console.log(`   ${mp.enabled ? '✅' : '❌'} ${mp.name} (${mp.code})`);
    }
    console.log('');
  }

  async collectFromAll(options = {}) {
    const results = {};
    
    for (const [key, mp] of this.marketplaces.entries()) {
      if (!mp.enabled) continue;
      
      try {
        const products = await this.collectFromMarketplace(key, options);
        results[key] = {
          success: true,
          products,
          count: products.length
        };
      } catch (error) {
        results[key] = {
          success: false,
          error: error.message,
          count: 0
        };
        console.error(`❌ Erro em ${mp.name}:`, error.message);
      }
    }
    
    return results;
  }
}

module.exports = ScrapingService;