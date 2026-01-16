const { chromium } = require('playwright');

class MercadoLivreScraper {
  constructor(minDiscount = 30) {
    this.minDiscount = minDiscount;
  }

  async scrapeCategory() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('🌐 Abrindo Mercado Livre...');
    await page.goto('https://www.mercadolivre.com.br/ofertas', {
      waitUntil: 'domcontentloaded'
    });

    // MOCK enquanto valida pipeline
    const products = [{
      nome: 'Produto Teste ML',
      imagem: 'https://http2.mlstatic.com/D_NQ_NP.jpg',
      link_afiliado: 'https://mercadolivre.com.br/afiliado-teste',
      preco: 'R$ 99,90',
      preco_anterior: 'R$ 199,90',
      preco_de: '199,90',
      preco_para: '99,90',
      desconto: '50%',
      marketplace: 'ML'
    }];

    await browser.close();
    console.log('🔒 Browser fechado');

    return products;
  }
}

module.exports = MercadoLivreScraper;
