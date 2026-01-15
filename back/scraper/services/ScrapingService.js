const MercadoLivreScraper = require('../scrapers/MercadoLivreScraper');
const AmazonScraper = require('../scrapers/AmazonScraper');
const MagaluScraper = require('../scrapers/MagaluScraper');
const ShopeeScraper = require('../scrapers/ShopeeScraper');
const ProductRepository = require('../../database/repositories/ProductRepository');

class ScrapingService {
  constructor() {
    this.isRunning = false;
    this.currentStatus = {
      running: false,
      progress: 0,
      currentMarketplace: null,
      marketplaces: [],
      productsFound: 0,
      startedAt: null
    };
  }

  async scrapeMarketplaces(marketplaces, minDiscount = 30) {
    if (this.isRunning) {
      throw new Error('Scraping já está em execução');
    }

    this.isRunning = true;
    this.currentStatus = {
      running: true,
      progress: 0,
      currentMarketplace: null,
      marketplaces,
      productsFound: 0,
      startedAt: new Date()
    };

    console.log('\n🚀 ===================================');
    console.log('   INICIANDO SCRAPING MULTI-MARKETPLACE');
    console.log('🚀 ===================================\n');
    console.log(`📋 Marketplaces: ${marketplaces.join(', ')}`);
    console.log(`🎯 Desconto mínimo: ${minDiscount}%\n`);

    try {
      const allProducts = [];
      const total = marketplaces.length;

      for (let i = 0; i < total; i++) {
        const marketplace = marketplaces[i];
        this.currentStatus.currentMarketplace = marketplace;
        this.currentStatus.progress = Math.round((i / total) * 100);

        console.log(`\n[${i + 1}/${total}] 🏪 ${marketplace}`);
        console.log('─'.repeat(50));

        const scraper = this.getScraper(marketplace, minDiscount);
        const products = await scraper.scrapeCategory(scraper.baseUrl, 50);

        if (products.length > 0) {
          console.log(`💾 Salvando ${products.length} produtos no MongoDB...`);
          await ProductRepository.bulkUpsert(products);
        }

        allProducts.push(...products);
        this.currentStatus.productsFound = allProducts.length;
      }

      this.currentStatus.progress = 100;

      console.log('\n✅ ===================================');
      console.log('   SCRAPING CONCLUÍDO COM SUCESSO!');
      console.log('✅ ===================================\n');
      console.log(`📊 Total de produtos: ${allProducts.length}`);
      console.log(`⏱️  Tempo: ${Math.round((new Date() - this.currentStatus.startedAt) / 1000)}s\n`);

      return {
        success: true,
        productsFound: allProducts.length,
        marketplaces,
        duration: new Date() - this.currentStatus.startedAt
      };
    } catch (error) {
      console.error('\n❌ ERRO NO SCRAPING:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentStatus.running = false;
      this.currentStatus.currentMarketplace = null;
    }
  }

  getScraper(marketplace, minDiscount) {
    switch (marketplace) {
      case 'ML':
        return new MercadoLivreScraper(minDiscount);
      case 'Amazon':
        return new AmazonScraper(minDiscount);
      case 'Magalu':
        return new MagaluScraper(minDiscount);
      case 'Shopee':
        return new ShopeeScraper(minDiscount);
      default:
        throw new Error(`Marketplace desconhecido: ${marketplace}`);
    }
  }

  getStatus() {
    return {
      ...this.currentStatus,
      uptime: this.currentStatus.startedAt 
        ? Math.round((new Date() - this.currentStatus.startedAt) / 1000)
        : 0
    };
  }
}

module.exports = new ScrapingService();