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
    
    let allProducts = [];
    let pageNum = 1;

    try {
      while (allProducts.length < this.limit && pageNum <= 5) {
        const page = await context.newPage();
        // O ML muda de página pelo parâmetro _Desde_ (48 produtos por página)
        const offset = (pageNum - 1) * 48;
        const url = `https://www.mercadolivre.com.br/ofertas?page=${pageNum}${offset > 0 ? `&_Desde_${offset + 1}` : ''}`;
        
        console.log(`🌐 Varrendo Página ${pageNum}... (Total atual: ${allProducts.length})`);
        
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // Scroll para carregar os itens dessa página
        await page.evaluate(async () => {
          await new Promise(resolve => {
            let t = 0;
            const timer = setInterval(() => {
              window.scrollBy(0, 800);
              t += 800;
              if (t >= 4000) { clearInterval(timer); resolve(); }
            }, 150);
          });
        });

        const productsFromPage = await page.evaluate(({ minDisc, maxLimit, currentCount }) => {
          const items = document.querySelectorAll('.poly-card, .promotion-item__container, .ui-search-result');
          const results = [];
          const needed = maxLimit - currentCount;

          items.forEach(item => {
            if (results.length >= needed) return;

            const discEl = item.querySelector('.poly-discount-badge, .andes-money-amount__discount, .promotion-item__discount-text');
            const discountVal = discEl ? parseInt(discEl.innerText.replace(/[^\d]/g, '')) : 0;

            if (discountVal >= minDisc) {
              const titleEl = item.querySelector('.poly-component__title, .promotion-item__title, .ui-search-item__title');
              const linkEl = item.querySelector('a');
              const imgEl = item.querySelector('img');
              const price = item.querySelector('.andes-money-amount__fraction')?.innerText || "0";

              if (titleEl && linkEl?.href) {
                results.push({
                  nome: titleEl.innerText.trim(),
                  imagem: imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : '',
                  link_original: linkEl.href,
                  preco: `R$ ${price}`,
                  desconto: `${discountVal}%`,
                  marketplace: 'ML',
                  isActive: true
                });
              }
            }
          });
          return results;
        }, { minDisc: this.minDiscount, maxLimit: this.limit, currentCount: allProducts.length });

        allProducts.push(...productsFromPage);
        await page.close();

        if (productsFromPage.length === 0) break; // Se a página não tem ofertas, para.
        pageNum++;
      }

      await browser.close();
      console.log(`🔒 Finalizado. Total: ${allProducts.length} produtos.`);

      const affiliateId = process.env.ML_AFFILIATE_ID || '77997172';
      return allProducts.map(p => ({
        ...p,
        link_afiliado: `${p.link_original.split('?')[0]}?matt_tool=${affiliateId}&utm_source=affiliate&utm_medium=webcash`
      }));

    } catch (error) {
      console.error('❌ Erro:', error.message);
      if (browser) await browser.close();
      return allProducts;
    }
  }
}

module.exports = MercadoLivreScraper;