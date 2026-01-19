const Product = require('../../database/models/Product');
const MercadoLivreScraper = require('../scrapers/MercadoLivreScraper');
const MagaluScraper = require('../scrapers/MagaluScraper');

class ScrapingService {
  constructor() {
    this.marketplaces = new Map();
    this.initializeMarketplaces();
  }

  initializeMarketplaces() {
    // ✅ Mercado Livre
    try {
      this.marketplaces.set('mercadolivre', {
        name: 'Mercado Livre',
        code: 'ML',
        scraper: new MercadoLivreScraper(),
        enabled: true
      });
    } catch (error) {
      console.error('⚠️ Mercado Livre não disponível:', error.message);
    }

    // ✅ Magazine Luiza
    try {
      this.marketplaces.set('magalu', {
        name: 'Magazine Luiza',
        code: 'MAGALU',
        scraper: new MagaluScraper(),
        enabled: true
      });
    } catch (error) {
      console.error('⚠️ Magazine Luiza não disponível:', error.message);
    }
  }

  /**
   * Coleta produtos de um marketplace específico com suporte a filtros
   */
  async collectFromMarketplace(marketplaceName, options = {}) {
    // ✅ CORRIGIDO: Mudado de 'category' para 'categoria'
    const { 
      minDiscount = 30, 
      limit = 50, 
      mode = 'auto', 
      categoria = null,  // ✅ NOME CORRETO
      maxPrice = null 
    } = options;

    const marketplace = this.marketplaces.get(marketplaceName.toLowerCase());
    let products = [];

    if (!marketplace) throw new Error(`Marketplace "${marketplaceName}" não encontrado`);

    console.log(`\n🚀 INICIANDO COLETA: ${marketplace.name.toUpperCase()}`);
    if (categoria || maxPrice) {
      console.log(`🎯 FILTROS ATIVOS: ${categoria ? `Categoria: ${categoria}` : ''} ${maxPrice ? `| Preço Máx: R$ ${maxPrice}` : ''}`);
    }

    console.log('🟡 Usando Web Scraper (Playwright)...');
    
    // Configura o scraper com os limites e filtros
    marketplace.scraper.minDiscount = minDiscount;
    marketplace.scraper.limit = limit;
    
    // ✅ CORRIGIDO: Passa 'categoria' ao invés de 'category'
    marketplace.scraper.categoria = categoria;
    marketplace.scraper.maxPrice = maxPrice;
    
    // ✅ Recalcula a categoriaInfo quando a categoria mudar
    if (categoria && marketplace.code === 'ML') {
      const { getCategoria } = require('../../config/categorias-ml');
      marketplace.scraper.categoriaInfo = getCategoria(categoria);
    }
    
    products = await marketplace.scraper.scrapeCategory();

    // Gera links de afiliado
    if (products.length > 0) {
      console.log(`🔗 Gerando ${products.length} links de afiliado...`);
      
      products.forEach(product => {
        // ✅ Links de afiliado específicos por marketplace
        if (marketplace.code === 'ML') {
          const separator = product.link_original.includes('?') ? '&' : '?';
          product.link_afiliado = `${product.link_original}${separator}matt_tool=77997172&utm_source=webcash&utm_medium=affiliate&utm_campaign=deals`;
        } else if (marketplace.code === 'MAGALU') {
          const separator = product.link_original.includes('?') ? '&' : '?';
          product.link_afiliado = `${product.link_original}${separator}utm_source=webcash&utm_medium=affiliate&utm_campaign=deals`;
        } else {
          product.link_afiliado = product.link_original;
        }
      });

      console.log('✅ Links de afiliado aplicados!\n');
    }

    return products;
  }

  async saveProducts(products, marketplaceCode = 'ML') {
    console.log(`\n💾 Salvando/Atualizando no MongoDB...`);
    let inserted = 0, updated = 0, errors = 0, duplicates = 0, betterOffers = 0;

    for (const product of products) {
      try {
        const normalizedName = this.normalizeProductName(product.nome);
        
        if (!product.link_original || product.link_original.length < 20) {
          console.log(`   ⚠️ Produto sem link válido ignorado: ${product.nome.substring(0, 40)}...`);
          continue;
        }
        
        if (product._shouldUpdate) {
          const query = { link_original: product._oldLink || product.link_original };
          const existing = await Product.findOne(query);

          if (existing) {
            const { _shouldUpdate, _oldLink, ...cleanProduct } = product;
            
            await Product.updateOne(
              { _id: existing._id }, 
              { 
                $set: { 
                  ...cleanProduct, 
                  nome_normalizado: normalizedName,
                  updatedAt: new Date(), 
                  isActive: true 
                } 
              }
            );
            betterOffers++;
            console.log(`   🔥 MELHOR OFERTA: ${product.nome.substring(0, 35)}... (${product.desconto})`);
          } else {
            const { _shouldUpdate, _oldLink, ...cleanProduct } = product;
            
            await Product.create({ 
              ...cleanProduct, 
              nome_normalizado: normalizedName,
              createdAt: new Date() 
            });
            inserted++;
            console.log(`   ✨ ${product.nome.substring(0, 40)}...`);
          }
        } else {
          const query = { link_original: product.link_original };
          const existing = await Product.findOne(query);

          if (existing) {
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
            await Product.create({ 
              ...product, 
              nome_normalizado: normalizedName,
              createdAt: new Date() 
            });
            inserted++;
            console.log(`   ✨ ${product.nome.substring(0, 40)}...`);
          }
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
    console.log(`║         📊 RESULTADO FINAL 📊         ║`);
    console.log(`╚═══════════════════════════════════════╝`);
    console.log(`✨ Novos produtos: ${inserted}`);
    console.log(`🔥 Ofertas melhoradas: ${betterOffers}`);
    console.log(`📝 Atualizados: ${updated}`);
    console.log(`⏭️  Duplicatas ignoradas: ${duplicates}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📦 Total processados: ${products.length}`);
    
    const totalSaved = inserted + betterOffers;
    if (totalSaved < products.length) {
      console.log(`\n⚠️  ATENÇÃO: Apenas ${totalSaved} produtos NOVOS foram salvos de ${products.length} coletados`);
      console.log(`   ${duplicates} já existiam no banco com ofertas iguais/melhores`);
    }
    console.log('');

    return { inserted, updated, duplicates, errors, betterOffers, totalSaved };
  }

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