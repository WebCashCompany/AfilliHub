const BaseScraper = require('./BaseScraper');

class ShopeeScraper extends BaseScraper {
  constructor(minDiscount) {
    super('Shopee', minDiscount);
    this.baseUrl = 'https://shopee.com.br/ofertas';
  }

  async getProductUrls(categoryUrl, limit) {
    console.log('⚠️  Shopee scraper ainda não implementado');
    return [];
  }

  async scrapeProduct(url) {
    return null;
  }
}

module.exports = ShopeeScraper;