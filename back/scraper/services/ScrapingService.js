/**
 * ═══════════════════════════════════════════════════════════════════════
 * SCRAPING SERVICE - VERSÃO ULTIMATE (NÍVEL 3)
 * ═══════════════════════════════════════════════════════════════════════
 * @version 3.0.0
 * @fixes
 *   - ✅ maxPrice: agora é passado corretamente para o construtor do scraper
 *   - ✅ Sincronização: garante que os filtros de preço e desconto sejam aplicados na fonte
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

  async getMagaluAffiliateId() {
    try {
      const conn = getProductConnection();
      const Integration = IntegrationModel(conn);
      const config = await Integration.findOne({ provider: 'magalu' });
      if (config && config.affiliateId) {
        return config.affiliateId;
      }
      return null;
    } catch (error) {
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
      throw new Error(`Marketplace "${marketplaceName}" não encontrado.`);
    }

    console.log(`\n🚀 INICIANDO COLETA: ${marketplace.name.toUpperCase()}`);

    let scraper;

    if (marketplace.code === 'MAGALU') {
      const affiliateId = await this.getMagaluAffiliateId();

      // ✅ FIX NÍVEL 3: maxPrice passado diretamente no construtor/opções
      const scraperOptions = {
        categoryKey,
        affiliateId,
        searchTerm,
        onProductCollected,
        limit,
        maxPrice // ← Agora o scraper sabe o preço máximo desde o início
      };

      scraper = new MagaluScraper(minDiscount, scraperOptions);

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
      } else if (categoria) {
        const categoriaInfo = getCategoria(categoria);
        if (categoriaInfo) {
          scraper.categoriaKey = categoria;
          scraper.categoriaInfo = categoriaInfo;
          scraper.searchTerm = null;
        }
      }
    }

    const products = await scraper.scrapeCategory();
    return products;
  }

  isValidUrl(url) {
    if (!url || typeof url !== 'string' || url.length < 10) return false;
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
              { $set: { ...cleanProduct, nome_normalizado: normalizedName, ultima_verificacao: new Date(), updatedAt: new Date(), isActive: true } }
            );
            stats.betterOffers++;
            continue;
          }
        }

        const query = { 
          $or: [
            { link_original: product.link_original },
            { link_afiliado: product.link_afiliado },
            { nome_normalizado: normalizedName }
          ]
        };

        const existing = await Product.findOne(query);

        if (existing) {
          stats.duplicates++;
          continue;
        }

        const newProduct = new Product({
          ...product,
          nome_normalizado: normalizedName,
          ultima_verificacao: new Date(),
          isActive: true
        });

        await newProduct.save();
        stats.inserted++;

      } catch (error) {
        stats.errors++;
      }
    }

    stats.totalSaved = stats.inserted + stats.betterOffers;
    return stats;
  }

  normalizeProductName(name) {
    if (!name) return '';
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }
}

module.exports = ScrapingService;
