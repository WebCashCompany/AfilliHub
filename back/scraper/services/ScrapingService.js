/**
 * ═══════════════════════════════════════════════════════════════════════
 * SCRAPING SERVICE - COM SSE REAL-TIME & AFFILIATE ID DINÂMICO
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * @version 2.7.1 - ✅ FIX: aceita meli.la como link afiliado válido no ML
 */

const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const IntegrationModel = require('../../models/Integration');
const MercadoLivreScraper = require('../scrapers/MercadoLivreScraper');
const { getCategoria } = require('../../config/categorias-ml');

let MagaluScraper, ShopeeScraper;

try {
  MagaluScraper = require('../scrapers/MagaluScraper');
} catch (e) {
  console.warn('⚠️  MagaluScraper não disponível');
}

try {
  ShopeeScraper = require('../scrapers/ShopeeScraper');
} catch (e) {
  console.warn('⚠️  ShopeeScraper não disponível');
}

class ScrapingService {
  constructor() {
    this.marketplaces = new Map();
    this.initializeMarketplaces();
  }

  initializeMarketplaces() {
    try {
      const mlConfig = {
        name: 'Mercado Livre',
        code: 'ML',
        scraper: new MercadoLivreScraper(),
        enabled: true
      };
      
      this.marketplaces.set('mercadolivre', mlConfig);
      this.marketplaces.set('ML', mlConfig);
      this.marketplaces.set('ml', mlConfig);
      
    } catch (error) {
      console.error('⚠️  Mercado Livre não disponível:', error.message);
    }

    if (MagaluScraper) {
      try {
        const magaluConfig = {
          name: 'Magazine Luiza',
          code: 'MAGALU',
          scraper: null,
          enabled: true
        };
        
        this.marketplaces.set('magalu', magaluConfig);
        this.marketplaces.set('MAGALU', magaluConfig);
        
      } catch (error) {
        console.error('⚠️  Magazine Luiza não disponível:', error.message);
      }
    }

    if (ShopeeScraper) {
      try {
        const shopeeConfig = {
          name: 'Shopee Brasil',
          code: 'shopee',
          scraper: new ShopeeScraper(),
          enabled: true
        };
        
        this.marketplaces.set('shopee', shopeeConfig);
        this.marketplaces.set('Shopee', shopeeConfig);
        
      } catch (error) {
        console.error('⚠️  Shopee não disponível:', error.message);
      }
    }
  }

  clearScraperCache(marketplaceName) {
    const marketplace = this.marketplaces.get(marketplaceName) || 
                        this.marketplaces.get(marketplaceName.toLowerCase()) ||
                        this.marketplaces.get(marketplaceName.toUpperCase());
    
    if (marketplace && marketplace.scraper && typeof marketplace.scraper.clearCache === 'function') {
      marketplace.scraper.clearCache();
    }
  }

  /**
   * 🔥 Busca o affiliateId do Magalu no banco de dados
   */
  async getMagaluAffiliateId() {
    try {
      const conn = getProductConnection();
      const Integration = IntegrationModel(conn);
      
      const config = await Integration.findOne({ provider: 'magalu' });
      
      if (config && config.affiliateId) {
        console.log(`🏪 Magalu Affiliate ID (DB): ${config.affiliateId}`);
        return config.affiliateId;
      }
      
      console.log('⚠️  Nenhum Affiliate ID do Magalu no banco, usando padrão');
      return null;
      
    } catch (error) {
      console.error('❌ Erro ao buscar Affiliate ID do Magalu:', error.message);
      return null;
    }
  }

  async collectFromMarketplace(marketplaceName, options = {}) {
    const { 
      minDiscount = 30, 
      limit = 50, 
      categoria = null,
      categoryKey = null,
      maxPrice = null,
      searchTerm = null,
      onProductCollected = null
    } = options;

    const marketplace = this.marketplaces.get(marketplaceName) || 
                        this.marketplaces.get(marketplaceName.toLowerCase()) ||
                        this.marketplaces.get(marketplaceName.toUpperCase());

    if (!marketplace) {
      throw new Error(`Marketplace "${marketplaceName}" não encontrado. Disponíveis: ${Array.from(this.marketplaces.keys()).join(', ')}`);
    }

    if (!marketplace.enabled) {
      throw new Error(`Marketplace "${marketplace.name}" está desabilitado`);
    }

    console.log(`\n🚀 INICIANDO COLETA: ${marketplace.name.toUpperCase()}`);
    
    const filters = [];
    if (searchTerm) filters.push(`🔎 Busca: "${searchTerm}"`);
    if (categoria) filters.push(`Categoria ML: ${categoria}`);
    if (categoryKey) filters.push(`Categoria Key: ${categoryKey}`);
    if (maxPrice) filters.push(`Preço Máx: R$ ${maxPrice}`);
    if (filters.length > 0) {
      console.log(`🎯 FILTROS: ${filters.join(' | ')}`);
    }

    let scraper;
    
    if (marketplace.code === 'MAGALU') {
      const affiliateId = await this.getMagaluAffiliateId();
      
      const scraperOptions = { 
        categoryKey,
        affiliateId
      };
      
      scraper = new MagaluScraper(minDiscount, scraperOptions);
      scraper.limit = limit;
      scraper.maxPrice = maxPrice;
      
    } else {
      scraper = marketplace.scraper;
      scraper.minDiscount = minDiscount;
      scraper.limit = limit;
      scraper.maxPrice = maxPrice;
      
      if (onProductCollected) {
        scraper.onProductCollected = onProductCollected;
      }
    }

    if (marketplace.code === 'ML') {
      if (searchTerm) {
        scraper.searchTerm = searchTerm;
        scraper.categoriaKey = 'informatica';
        scraper.categoriaInfo = getCategoria('informatica');
        console.log(`🔎 Modo BUSCA ativado: "${searchTerm}"`);
      } else if (categoria) {
        const categoriaInfo = getCategoria(categoria);
        if (categoriaInfo) {
          scraper.categoriaKey = categoria;
          scraper.categoriaInfo = categoriaInfo;
          scraper.searchTerm = null;
        } else {
          console.warn(`⚠️  Categoria "${categoria}" não encontrada, usando padrão`);
        }
      }
    }
    
    console.log('🟡 Iniciando Web Scraper (Playwright)...\n');
    
    const products = await scraper.scrapeCategory();
    
    console.log(`✅ Scraping concluído: ${products.length} produtos coletados\n`);

    if (products.length > 0) {
      console.log(`🔗 Validando ${products.length} links de afiliado...\n`);
      
      let validLinks = 0;
      let invalidLinks = 0;
      
      for (const product of products) {
        const isValidUrl = this.isValidUrl(product.link_afiliado);
        
        if (!isValidUrl) {
          console.log(`   ⚠️  URL inválida: ${product.nome.substring(0, 30)}...`);
          product.link_afiliado = product.link_original;
          invalidLinks++;
        } else {
          validLinks++;
        }
        
        if (marketplace.code === 'ML') {
          // ✅ FIX: aceita tanto /sec/ (antigo) quanto meli.la (novo formato)
          const link = product.link_afiliado;
          const isAfiliado = link && (
            link.includes('mercadolivre.com/sec/') ||
            link.includes('meli.la/')
          );
          if (!isAfiliado) {
            product.link_afiliado = product.link_original;
          }
        } 
        else if (marketplace.code === 'MAGALU') {
          if (!product.link_afiliado) {
            product.link_afiliado = product.link_original;
          }
        } else if (marketplace.code === 'shopee') {
          const separator = product.link_original.includes('?') ? '&' : '?';
          const affiliateId = process.env.SHOPEE_AFFILIATE_ID || '18182230010';
          product.link_afiliado = `${product.link_original}${separator}af_siteid=${affiliateId}&pid=affiliates&af_click_lookback=7d`;
        } else {
          product.link_afiliado = product.link_original;
        }
      }
      
      console.log(`   ✅ Válidos: ${validLinks} | ⚠️  Inválidos: ${invalidLinks}\n`);
    }

    return products;
  }

  isValidUrl(url) {
    if (!url || typeof url !== 'string' || url.length < 10) {
      return false;
    }
    
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  async saveProducts(products, marketplaceCode = 'ML') {
    console.log(`\n💾 Salvando no MongoDB (Marketplace: ${marketplaceCode})...`);
    
    const conn = getProductConnection();
    const Product = getProductModel(marketplaceCode, conn);
    
    const stats = {
      inserted: 0,
      updated: 0,
      duplicates: 0,
      errors: 0,
      betterOffers: 0,
      totalSaved: 0
    };

    for (const product of products) {
      try {
        if (!product.link_afiliado || product.link_afiliado.length < 10 || !this.isValidUrl(product.link_afiliado)) {
          console.log(`   ❌ Link inválido: ${product.nome.substring(0, 30)}...`);
          stats.errors++;
          continue;
        }

        const normalizedName = this.normalizeProductName(product.nome);
        
        if (product._shouldUpdate) {
          const query = { link_afiliado: product._oldLink || product.link_afiliado };
          const existing = await Product.findOne(query);

          if (existing) {
            const { _shouldUpdate, _oldLink, ...cleanProduct } = product;
            
            await Product.updateOne(
              { _id: existing._id }, 
              { 
                $set: { 
                  ...cleanProduct, 
                  nome_normalizado: normalizedName,
                  ultima_verificacao: new Date(),
                  updatedAt: new Date(), 
                  isActive: true 
                } 
              }
            );
            
            stats.betterOffers++;
            console.log(`   🔥 MELHOR OFERTA: ${product.nome.substring(0, 35)}... (${product.desconto})`);
          } else {
            const { _shouldUpdate, _oldLink, ...cleanProduct } = product;
            
            await Product.create({ 
              ...cleanProduct, 
              nome_normalizado: normalizedName,
              ultima_verificacao: new Date(),
              createdAt: new Date() 
            });
            
            stats.inserted++;
            console.log(`   ✨ NOVO: ${product.nome.substring(0, 40)}...`);
          }
        } 
        else {
          const query = { link_afiliado: product.link_afiliado };
          const existing = await Product.findOne(query);

          if (existing) {
            await Product.updateOne(
              { _id: existing._id }, 
              { 
                $set: { 
                  ...product, 
                  nome_normalizado: normalizedName,
                  ultima_verificacao: new Date(),
                  updatedAt: new Date(), 
                  isActive: true 
                } 
              }
            );
            stats.updated++;
          } else {
            await Product.create({ 
              ...product, 
              nome_normalizado: normalizedName,
              ultima_verificacao: new Date(),
              createdAt: new Date() 
            });
            
            stats.inserted++;
            console.log(`   ✨ NOVO: ${product.nome.substring(0, 40)}...`);
          }
        }
      } catch (err) {
        if (err.code === 11000) {
          stats.duplicates++;
          console.log(`   ⏭️  Duplicata: ${product.nome.substring(0, 40)}...`);
        } else {
          stats.errors++;
          console.error(`   ❌ Erro: ${product.nome.substring(0, 30)}... - ${err.message}`);
        }
      }
    }

    stats.totalSaved = stats.inserted + stats.betterOffers + stats.updated;

    console.log(`\n╔═══════════════════════════════════════╗`);
    console.log(`║         📊 RESULTADO FINAL 📊         ║`);
    console.log(`╚═══════════════════════════════════════╝`);
    console.log(`✨ Novos produtos: ${stats.inserted}`);
    console.log(`🔥 Ofertas melhoradas: ${stats.betterOffers}`);
    console.log(`📝 Atualizados: ${stats.updated}`);
    console.log(`⏭️  Duplicatas: ${stats.duplicates}`);
    console.log(`❌ Erros: ${stats.errors}`);
    console.log(`📦 Total processados: ${products.length}`);
    console.log(`💾 Total salvos/atualizados: ${stats.totalSaved}`);
    
    if (stats.duplicates > 0 || stats.errors > 0) {
      console.log(`\n⚠️  ${stats.duplicates + stats.errors} produtos ignorados`);
    }
    console.log('');

    return stats;
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
    console.log('\n📋 MARKETPLACES DISPONÍVEIS:\n');
    
    const unique = new Set();
    for (const [key, mp] of this.marketplaces.entries()) {
      if (!unique.has(mp.code)) {
        console.log(`   ${mp.enabled ? '✅' : '❌'} ${mp.name} (${mp.code})`);
        unique.add(mp.code);
      }
    }
    console.log('');
  }

  async collectFromAll(options = {}) {
    const results = {};
    const unique = new Set();
    
    for (const [key, mp] of this.marketplaces.entries()) {
      if (!mp.enabled || unique.has(mp.code)) continue;
      unique.add(mp.code);
      
      try {
        console.log(`\n${'═'.repeat(70)}`);
        const products = await this.collectFromMarketplace(key, options);
        results[mp.code] = {
          success: true,
          products,
          count: products.length
        };
      } catch (error) {
        results[mp.code] = {
          success: false,
          error: error.message,
          count: 0
        };
        console.error(`\n❌ Erro em ${mp.name}: ${error.message}\n`);
      }
    }
    
    return results;
  }
}

module.exports = ScrapingService;