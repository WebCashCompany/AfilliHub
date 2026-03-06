/**
 * ═══════════════════════════════════════════════════════════════════════
 * SCRAPING SERVICE
 * ═══════════════════════════════════════════════════════════════════════
 */

const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const IntegrationModel = require('../../models/Integration');
const MercadoLivreScraper = require('../scrapers/MercadoLivreScraper');
const { getCategoria } = require('../../config/categorias-ml');

let MagaluScraper, ShopeeScraper;

try { MagaluScraper = require('../scrapers/MagaluScraper'); }
catch (e) { console.warn('⚠️  MagaluScraper não disponível'); }

try { ShopeeScraper = require('../scrapers/ShopeeScraper'); }
catch (e) { console.warn('⚠️  ShopeeScraper não disponível'); }

class ScrapingService {
  constructor() {
    this.marketplaces = new Map();
    this.initializeMarketplaces();
  }

  initializeMarketplaces() {
    try {
      const mlConfig = { name: 'Mercado Livre', code: 'ML', scraper: new MercadoLivreScraper(), enabled: true };
      this.marketplaces.set('mercadolivre', mlConfig);
      this.marketplaces.set('ML', mlConfig);
      this.marketplaces.set('ml', mlConfig);
    } catch (error) {
      console.error('⚠️  Mercado Livre não disponível:', error.message);
    }

    if (MagaluScraper) {
      try {
        const magaluConfig = { name: 'Magazine Luiza', code: 'MAGALU', scraper: null, enabled: true };
        this.marketplaces.set('magalu', magaluConfig);
        this.marketplaces.set('MAGALU', magaluConfig);
      } catch (error) {
        console.error('⚠️  Magazine Luiza não disponível:', error.message);
      }
    }

    if (ShopeeScraper) {
      try {
        const shopeeConfig = { name: 'Shopee Brasil', code: 'shopee', scraper: new ShopeeScraper(), enabled: true };
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
      return config?.affiliateId || null;
    } catch (error) {
      return null;
    }
  }

  async collectFromMarketplace(marketplaceName, options = {}) {
    const {
      minDiscount = 30, limit = 50, categoria = null,
      categoryKey = null, maxPrice = null, searchTerm = null,
      onProductCollected = null
    } = options;

    const marketplace = this.marketplaces.get(marketplaceName)
      || this.marketplaces.get(marketplaceName.toLowerCase())
      || this.marketplaces.get(marketplaceName.toUpperCase());

    if (!marketplace) throw new Error(`Marketplace "${marketplaceName}" não encontrado.`);

    console.log(`\n🚀 INICIANDO COLETA: ${marketplace.name.toUpperCase()}`);

    let scraper;

    if (marketplace.code === 'MAGALU') {
      const affiliateId = await this.getMagaluAffiliateId();
      scraper = new MagaluScraper(minDiscount, { categoryKey, affiliateId, searchTerm, onProductCollected, limit, maxPrice });
    } else {
      scraper = marketplace.scraper;
      scraper.minDiscount = minDiscount;
      scraper.limit = limit;
      scraper.maxPrice = maxPrice;
      if (onProductCollected) scraper.onProductCollected = onProductCollected;
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

    return scraper.scrapeCategory();
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

  /**
   * Salva produtos no MongoDB associados ao userId.
   * 
   * @param {Array}  products        - Produtos coletados pelo scraper
   * @param {string} marketplaceCode - Código do marketplace (ML, shopee, etc.)
   * @param {string} userId          - ID do usuário autenticado (Supabase auth.uid)
   */
  async saveProducts(products, marketplaceCode = 'ML', userId) {
    if (!userId) {
      throw new Error('❌ userId é obrigatório em saveProducts. Nenhum produto será salvo sem identificação de usuário.');
    }

    console.log(`\n💾 Salvando no MongoDB (Marketplace: ${marketplaceCode} | userId: ${userId})...`);

    const conn = getProductConnection();
    const Product = getProductModel(marketplaceCode, conn);

    const stats = { inserted: 0, updated: 0, duplicates: 0, errors: 0, betterOffers: 0, totalSaved: 0 };

    for (const product of products) {
      try {
        if (!product.link_afiliado || product.link_afiliado.length < 10 || !this.isValidUrl(product.link_afiliado)) {
          stats.errors++;
          continue;
        }

        const normalizedName = this.normalizeProductName(product.nome);

        if (product._shouldUpdate) {
          const query = { userId, link_afiliado: product._oldLink || product.link_afiliado };
          const existing = await Product.findOne(query);

          if (existing) {
            const { _shouldUpdate, _oldLink, ...cleanProduct } = product;
            await Product.updateOne(
              { _id: existing._id },
              { $set: { ...cleanProduct, userId, nome_normalizado: normalizedName, ultima_verificacao: new Date(), updatedAt: new Date(), isActive: true } }
            );
            stats.betterOffers++;
            continue;
          }
        }

        // ⚠️ CRÍTICO: todas as queries de duplicata incluem userId
        // Garante que produtos de usuários diferentes com mesmo link não colidem
        const query = {
          userId,
          $or: [
            { link_original:    product.link_original },
            { link_afiliado:    product.link_afiliado },
            { nome_normalizado: normalizedName }
          ]
        };

        const existing = await Product.findOne(query);
        if (existing) {
          stats.duplicates++;
          continue;
        }

        // ⚠️ CRÍTICO: userId injetado em todo produto salvo
        const newProduct = new Product({
          ...product,
          userId,
          nome_normalizado: normalizedName,
          ultima_verificacao: new Date(),
          isActive: true
        });

        await newProduct.save();
        stats.inserted++;

      } catch (error) {
        console.error('❌ Erro ao salvar produto:', error.message);
        stats.errors++;
      }
    }

    stats.totalSaved = stats.inserted + stats.betterOffers;
    console.log(`   📊 Inseridos: ${stats.inserted} | Duplicatas: ${stats.duplicates} | Erros: ${stats.errors}`);
    return stats;
  }

  normalizeProductName(name) {
    if (!name) return '';
    return name.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = ScrapingService;