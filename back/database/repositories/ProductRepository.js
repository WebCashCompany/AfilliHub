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

    let allProducts = [];
    let currentPage = 1;

    try {
      console.log(`🚀 Iniciando busca: Meta de ${this.limit} produtos.`);

      while (allProducts.length < this.limit) {
        // Monta a URL com paginação (o ML usa _Desde_ seguido do múltiplo de 48)
        const offset = (currentPage - 1) * 48;
        const url = `https://www.mercadolivre.com.br/ofertas?page=${currentPage}${offset > 0 ? `&_Desde_${offset + 1}` : ''}`;
        
        console.log(`🌐 Varrendo Página ${currentPage}... (Já temos ${allProducts.length})`);
        
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // Scroll para carregar os itens dessa página específica
        await page.evaluate(async () => {
          await new Promise(resolve => {
            let t = 0;
            let timer = setInterval(() => {
              window.scrollBy(0, 800);
              t += 800;
              if (t >= 4000) { clearInterval(timer); resolve(); }
            }, 200);
          });
        });

        const productsFromPage = await page.evaluate(({ minDisc, maxLimit, currentTotal }) => {
          const items = document.querySelectorAll('.poly-card, .promotion-item__container, .ui-search-result');
          const results = [];
          const needed = maxLimit - currentTotal;

          items.forEach(item => {
            if (results.length >= needed) return;

            const discEl = item.querySelector('.poly-discount-badge, .andes-money-amount__discount, .promotion-item__discount-text');
            const discountVal = discEl ? parseInt(discEl.innerText.replace(/[^\d]/g, '')) : 0;

            if (discountVal >= minDisc) {
              const titleEl = item.querySelector('.poly-component__title, .promotion-item__title, .ui-search-item__title');
              const linkEl = item.querySelector('a');
              const imgEl = item.querySelector('img');
              const precoPara = item.querySelector('.andes-money-amount__fraction')?.innerText || "0";
              const precoDeEl = item.querySelector('.andes-money-amount--previous .andes-money-amount__fraction, s .andes-money-amount__fraction');
              const precoDe = precoDeEl ? precoDeEl.innerText : precoPara;

              if (titleEl && linkEl?.href) {
                results.push({
                  nome: titleEl.innerText.trim(),
                  imagem: imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : '',
                  link_original: linkEl.href,
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
        }, { minDisc: this.minDiscount, maxLimit: this.limit, currentTotal: allProducts.length });

        allProducts.push(...productsFromPage);

        // Se não achou NADA na página ou se já bateu a meta, para de navegar
        if (productsFromPage.length === 0 || allProducts.length >= this.limit) {
          break;
        }

        currentPage++;
        // Segurança para não entrar em loop infinito
        if (currentPage > 10) break; 
      }

      await browser.close();
      console.log(`🔒 Busca finalizada. Total alcançado: ${allProducts.length} produtos.`);

      const affiliateId = process.env.ML_AFFILIATE_ID || '77997172';
      return allProducts.map(p => ({
        ...p,
        link_afiliado: `${p.link_original.split('?')[0]}?matt_tool=${affiliateId}&utm_source=affiliate&utm_medium=webcash`
      }));

    } catch (error) {
      console.error('❌ Erro na paginação do ML:', error.message);
      if (browser) await browser.close();
      return allProducts;
    }
  }
}

module.exports = MercadoLivreScraper;