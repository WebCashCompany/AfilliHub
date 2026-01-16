const { chromium } = require('playwright');

class MercadoLivreScraper {
  constructor(minDiscount = 30) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
  }

  /**
   * Normaliza o nome do produto para evitar duplicatas
   */
  normalizeProductName(name) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verifica se o produto já existe na lista (evita duplicatas em memória)
   */
  isDuplicate(product, existingProducts) {
    const normalizedName = this.normalizeProductName(product.nome);
    
    return existingProducts.some(p => {
      const existingNormalized = this.normalizeProductName(p.nome);
      // Considera duplicata se:
      // 1. Link original é o mesmo, OU
      // 2. Nome normalizado é muito similar (primeiras 5 palavras)
      return p.link_original === product.link_original ||
             existingNormalized.split(' ').slice(0, 5).join(' ') === 
             normalizedName.split(' ').slice(0, 5).join(' ');
    });
  }

  async scrapeCategory() {
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 15; 

    try {
      console.log(`🎯 Meta: ${this.limit} produtos únicos com ${this.minDiscount}%+ de desconto\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const offset = (pageNum - 1) * 48;
        const url = `https://www.mercadolivre.com.br/ofertas?page=${pageNum}${offset > 0 ? `&_Desde_${offset + 1}` : ''}`;
        
        console.log(`📄 Página ${pageNum}/${maxPages} | Únicos coletados: ${allProducts.length}/${this.limit}`);
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          
          await page.waitForTimeout(2000);

          // Scroll progressivo para carregar lazy-load
          await page.evaluate(async () => {
            for (let i = 0; i < 5; i++) {
              window.scrollBy(0, 800);
              await new Promise(r => setTimeout(r, 400));
            }
            window.scrollTo(0, 0);
          });

          await page.waitForTimeout(1500);

          const productsFromPage = await page.evaluate(({ minDisc }) => {
            const items = document.querySelectorAll('.poly-card, .promotion-item__container, .ui-search-result, [class*="promotion-item"]');
            const results = [];

            items.forEach(item => {
              try {
                const discEl = item.querySelector(
                  '.poly-discount-badge, .andes-money-amount__discount, .promotion-item__discount-text, [class*="discount"]'
                );
                const discountText = discEl ? discEl.innerText : '';
                const discountVal = parseInt(discountText.replace(/[^\d]/g, '')) || 0;

                if (discountVal >= minDisc) {
                  const titleEl = item.querySelector(
                    '.poly-component__title, .promotion-item__title, .ui-search-item__title, h2, [class*="title"]'
                  );
                  const linkEl = item.querySelector('a');
                  const imgEl = item.querySelector('img');
                  const priceEl = item.querySelector('.andes-money-amount__fraction');
                  const price = priceEl ? priceEl.innerText : '0';
                  const oldPriceEl = item.querySelector('.andes-money-amount--previous .andes-money-amount__fraction, s .andes-money-amount__fraction');
                  const oldPrice = oldPriceEl ? oldPriceEl.innerText : price;

                  if (titleEl && linkEl && linkEl.href) {
                    results.push({
                      nome: titleEl.innerText.trim(),
                      imagem: imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '',
                      link_original: linkEl.href.split('?')[0],
                      preco: `R$ ${price}`,
                      preco_anterior: `R$ ${oldPrice}`,
                      preco_de: oldPrice.replace(/\D/g, ''),
                      preco_para: price.replace(/\D/g, ''),
                      desconto: `${discountVal}%`,
                      marketplace: 'ML',
                      isActive: true
                    });
                  }
                }
              } catch (e) {}
            });
            
            return results;
          }, { minDisc: this.minDiscount });

          console.log(`   └─ Encontrados na página: ${productsFromPage.length}`);

          for (const product of productsFromPage) {
            if (!this.isDuplicate(product, allProducts)) {
              allProducts.push(product);
              if (allProducts.length >= this.limit) break;
            }
          }

          console.log(`   └─ Adicionados únicos: ${allProducts.length}\n`);

          if (productsFromPage.length === 0) break;
          if (allProducts.length >= this.limit) break;

          pageNum++;
          await page.waitForTimeout(1500 + Math.random() * 1000);

        } catch (pageError) {
          console.error(`❌ Erro na página ${pageNum}:`, pageError.message);
          pageNum++;
        }
      }

      await browser.close();
      const finalProducts = allProducts.slice(0, this.limit);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🏁 Scraping finalizado!`);
      console.log(`📊 Produtos únicos coletados: ${finalProducts.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return finalProducts;

    } catch (error) {
      console.error('❌ Erro crítico no scraper:', error.message);
      await browser.close();
      return allProducts.slice(0, this.limit);
    }
  }
}

module.exports = MercadoLivreScraper;