const BaseScraper = require('./BaseScraper');

class AmazonScraper extends BaseScraper {
  constructor(minDiscount) {
    super('Amazon', minDiscount);
    this.baseUrl = 'https://www.amazon.com.br/ofertas';
  }

  async getProductUrls(categoryUrl, limit) {
    console.log('⚠️  Amazon scraper ainda não implementado');
    return [];
  }

  async scrapeProduct(url) {
    return null;
  }
}

module.exports = AmazonScraper;