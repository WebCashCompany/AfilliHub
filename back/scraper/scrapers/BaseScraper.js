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
        headless: false,
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

  async scrapeCategory(url, limit = 50) {
    await this.init();
    
    try {
      console.log(`\n🔍 Iniciando scraping: ${this.marketplace}`);
      console.log(`📍 URL: ${url}`);
      console.log(`🎯 Limite: ${limit} produtos`);
      console.log(`📊 Desconto mínimo: ${this.minDiscount}%\n`);

      const productUrls = await this.getProductUrls(url, limit);
      console.log(`📦 ${productUrls.length} URLs encontradas\n`);

      const products = [];
      let processed = 0;

      for (const productUrl of productUrls) {
        try {
          processed++;
          console.log(`[${processed}/${productUrls.length}] Processando...`);
          
          const product = await this.scrapeProduct(productUrl);
          
          if (product) {
            const discount = this.extractDiscountNumber(product.desconto);
            
            if (discount >= this.minDiscount) {
              products.push(product);
              console.log(`✅ ${product.nome.substring(0, 50)}... (${product.desconto})`);
            } else {
              console.log(`⏭️  Desconto baixo: ${product.desconto}`);
            }
          }
        } catch (error) {
          console.error(`❌ Erro: ${error.message}`);
        }
      }

      console.log(`\n🎉 ${this.marketplace}: ${products.length} produtos coletados\n`);
      return products;
    } finally {
      await this.close();
    }
  }

  async getProductUrls(url, limit) {
    throw new Error('Must implement getProductUrls');
  }

  async scrapeProduct(url) {
    throw new Error('Must implement scrapeProduct');
  }

  generateAffiliateUrl(url) {
    return url;
  }

  extractDiscountNumber(desconto) {
    const match = desconto.match(/(\d+)%/);
    return match ? parseInt(match[1]) : 0;
  }

  formatPrice(price) {
    return `R$ ${price.toFixed(2).replace('.', ',')}`;
  }

  extractPrice(priceText) {
    if (!priceText) return 0;
    const cleaned = priceText.replace(/[^\d,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  }
}

module.exports = BaseScraper;