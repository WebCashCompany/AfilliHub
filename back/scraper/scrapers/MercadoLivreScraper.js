const { chromium } = require('playwright');

class MercadoLivreScraper {
  constructor(minDiscount = 30) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
  }

  async scrapeCategory() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
      console.log(`🌐 Abrindo Mercado Livre (Meta: ${this.limit} produtos)...`);
      
      // Abre a página oficial de ofertas
      await page.goto('https://www.mercadolivre.com.br/ofertas', {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      // SCROLL AGRESSIVO: O ML esconde os produtos se não rolar
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          let distance = 400;
          let timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= 3000) { // Rola 3000px para garantir carregamento inicial
              clearInterval(timer);
              resolve();
            }
          }, 150);
        });
      });

      // CAPTURA REAL COM SELETORES ATUALIZADOS
      const products = await page.evaluate(({ minDisc, maxLimit }) => {
        // Seletores atualizados que englobam os diferentes layouts do ML
        const items = document.querySelectorAll('.poly-card, .promotion-item__container, .ui-search-result');
        const results = [];

        items.forEach(item => {
          if (results.length >= maxLimit) return;

          // Busca o desconto em vários lugares possíveis
          const discEl = item.querySelector('.poly-discount-badge, .andes-money-amount__discount, .promotion-item__discount-text');
          const discountVal = discEl ? parseInt(discEl.innerText.replace(/[^\d]/g, '')) : 0;

          if (discountVal >= minDisc) {
            // Seletores de Título, Link e Imagem
            const titleEl = item.querySelector('.poly-component__title, .promotion-item__title, .ui-search-item__title');
            const linkEl = item.querySelector('a.poly-component__title, a.promotion-item__link-container, a');
            const imgEl = item.querySelector('img');

            const precoPara = item.querySelector('.andes-money-amount__fraction')?.innerText || "0";
            const precoDeEl = item.querySelector('.andes-money-amount--previous .andes-money-amount__fraction, s .andes-money-amount__fraction');
            const precoDe = precoDeEl ? precoDeEl.innerText : precoPara;

            if (titleEl && linkEl && linkEl.href) {
              results.push({
                nome: titleEl.innerText.trim(),
                imagem: imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : '',
                link_original: linkEl.href,
                link_afiliado: linkEl.href,
                preco: `R$ ${precoPara}`,
                preco_anterior: `R$ ${precoDe}`,
                preco_de: precoDe,
                preco_para: precoPara,
                desconto: `${discountVal}%`,
                marketplace: 'ML',
                isActive: true
              });
            }
          }
        });
        return results;
      }, { minDisc: this.minDiscount, maxLimit: this.limit });

      await browser.close();
      console.log(`🔒 Browser fechado. Encontrados: ${products.length} produtos.`);

      // Adiciona o seu ID de Afiliado (77997172) nos links encontrados
      const affiliateId = process.env.ML_AFFILIATE_ID || '77997172';
      return products.map(p => ({
        ...p,
        link_afiliado: `${p.link_original.split('?')[0]}?matt_tool=${affiliateId}&utm_source=affiliate&utm_medium=webcash`
      }));

    } catch (error) {
      console.error('❌ Erro no Scraper ML:', error.message);
      if (browser) await browser.close();
      return [];
    }
  }
}

module.exports = MercadoLivreScraper;