const BaseScraper = require('./BaseScraper');

class MagaluScraper extends BaseScraper {
  constructor(minDiscount) {
    super('Magalu', minDiscount);
    this.baseUrl = 'https://www.magazineluiza.com.br/ofertas';
  }

  async getProductUrls(categoryUrl, limit) {
    console.log('⚠️  Magalu scraper ainda não implementado');
    return [];
  }

  async scrapeProduct(url) {
    return null;
  }
}

module.exports = MagaluScraper;