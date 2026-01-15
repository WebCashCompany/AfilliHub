const playwright = require('playwright');

class BaseScraper {
  constructor(marketplace, minDiscount = 30) {
    this.marketplace = marketplace;
    this.minDiscount = minDiscount;
    this.browser = null;
    this.baseUrl = '';
  }

  async init() {
    if (!this.browser) {
      this.browser = await playwright.chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled'
        ]
      });
      console.log(`🌐 Browser iniciado para ${this.marketplace}`);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log(`🔒 Browser fechado para ${this.marketplace}`);
    }
  }

  // Método unificado para processar as listas
  async scrapeCategory(url, limit = 50) {
    await this.init();
    
    try {
      const productUrls = await this.getProductUrls(url, limit);
      const products = [];
      
      for (const productUrl of productUrls) {
        const product = await this.scrapeProduct(productUrl);
        if (product) {
          const discount = this.extractDiscountNumber(product.desconto);
          if (discount >= this.minDiscount) {
            products.push(product);
          }
        }
        if (products.length >= limit) break;
      }
      return products;
    } finally {
      await this.close();
    }
  }

  extractDiscountNumber(desconto) {
    if (!desconto) return 0;
    const match = desconto.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  extractPrice(priceText) {
    if (!priceText || priceText === 'Não disponível') return 0;
    // Remove tudo que não é número ou vírgula, depois troca vírgula por ponto
    const cleaned = priceText.replace(/[^\d,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  }
}

module.exports = BaseScraper;