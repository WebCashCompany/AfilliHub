const { chromium } = require('playwright');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoryUrl, getCategoryName, AMAZON_CATEGORIES } = require('../../config/categorias-amazon');

class AmazonScraper {
  constructor(minDiscount = 15) { // Amazon descontos costumam ser menores, ajustado padrão
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.affiliateId = process.env.AMAZON_AFFILIATE_TAG || 'seutag-20'; // Tag de associado Amazon
    
    this.stats = {
      duplicatesIgnored: 0,
      betterOffersUpdated: 0,
      productsCollected: 0,
      pagesScraped: 0,
      errors: 0,
      filteredByDiscount: 0,
      invalidProducts: 0
    };
    
    this.seenLinks = new Set();
    this.seenProductKeys = new Set();
    this.existingProductsMap = new Map();
    
    this.currentCategory = 'OFERTAS_DIA';
    this.categoryName = 'Ofertas do Dia';
    this.categoryNameForDB = 'Ofertas do Dia';
  }

  setCategory(categoryKey) {
    if (!AMAZON_CATEGORIES[categoryKey]) {
      throw new Error(`Categoria "${categoryKey}" não existe`);
    }
    
    this.currentCategory = categoryKey;
    this.categoryName = AMAZON_CATEGORIES[categoryKey].name;
    this.categoryNameForDB = getCategoryName(categoryKey);
    
    console.log(`📂 Categoria: ${this.categoryName} → "${this.categoryNameForDB}"`);
  }

  // ... (Métodos loadExistingProducts, generateProductKey, isBetterOffer, checkDuplicate mantidos iguais ao MagaluScraper) ...
  // Vou abreviar métodos repetidos para focar na lógica de extração, 
  // mas no arquivo final você deve copiar as funções auxiliares do MagaluScraper.js

  async loadExistingProducts() {
      // COPIAR DO MAGALU SCRAPER (Lógica idêntica de banco)
      // Apenas mude: marketplace: 'MAGALU' para marketplace: 'AMAZON'
      console.log('🔍 Carregando produtos existentes...');
      try {
        const conn = getProductConnection();
        const Product = getProductModel('amazon', conn); // Coleção Amazon
        const products = await Product.find({ isActive: true, marketplace: 'AMAZON' })
          .select('link_original nome desconto preco_para preco_de categoria')
          .lean().limit(500).sort({ createdAt: -1 });
          
        for (const product of products) {
           if (product.link_original) {
             const key = this.generateProductKey(product.nome);
             this.existingProductsMap.set(key, {
               link: product.link_original,
               desconto: parseInt(product.desconto) || 0,
               preco: parseInt(product.preco_para) || 0
             });
           }
        }
      } catch (error) { this.existingProductsMap = new Map(); }
  }

  generateProductKey(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 2).slice(0, 5).join('_');
  }

  isBetterOffer(newP, existingP) {
    const newD = parseInt(newP.desconto) || 0; const newPr = parseInt(newP.preco_para) || 0;
    return newD > existingP.desconto || (newD === existingP.desconto && newPr < existingP.preco);
  }

  checkDuplicate(product) {
      // COPIAR DO MAGALU SCRAPER
      const productKey = this.generateProductKey(product.nome);
      if (this.seenProductKeys.has(productKey)) return { isDuplicate: true };
      if (this.seenLinks.has(product.link_original)) return { isDuplicate: true };
      const existing = this.existingProductsMap.get(productKey);
      if (existing && !this.isBetterOffer(product, existing)) return { isDuplicate: true };
      if (existing && this.isBetterOffer(product, existing)) return { isDuplicate: false, isBetterOffer: true, oldLink: existing.link };
      return { isDuplicate: false };
  }

  formatPrice(cents) {
    if (!cents) return 'R$ 0,00';
    const reais = Math.floor(cents / 100);
    const centavos = cents % 100;
    return `R$ ${reais.toLocaleString('pt-BR')},${centavos.toString().padStart(2, '0')}`;
  }

  async scrapeCategory() {
    const startTime = Date.now();
    await this.loadExistingProducts();

    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // User Agent atualizado é importante pra Amazon
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo'
    });
    
    const page = await context.newPage();
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 5; // Amazon bloqueia se navegar demais rápido

    try {
      console.log(`╔════════ AMAZON SCRAPER ════════╗`);
      console.log(`║ Categoria: ${this.categoryName} ║`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const url = getCategoryUrl(this.currentCategory, pageNum);
        console.log(`📄 Pág ${pageNum} - Navegando...`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);

        // Scroll para carregar imagens (lazy loading da Amazon)
        await page.evaluate(async () => {
           for (let i = 0; i < 10; i++) {
             window.scrollBy(0, 500);
             await new Promise(r => setTimeout(r, 200));
           }
        });

        // ═══════════════════════════════════════════════════════════
        // LÓGICA DE EXTRAÇÃO AMAZON (BASEADA NO OUTERHTML)
        // ═══════════════════════════════════════════════════════════
        const productsFromPage = await page.evaluate(({ minDisc, affiliateId, categoryNameForDB }) => {
          const results = [];
          
          function extractPriceInCents(text) {
             if (!text) return 0;
             const cleaned = text.replace(/[^\d.,]/g, '');
             let priceStr = cleaned.replace(/\./g, '').replace(',', ''); // Amazon BR: 2.110,00 -> 211000
             return parseInt(priceStr) || 0;
          }
          
          function calculateDiscount(oldP, currP) {
             if (!oldP || !currP || oldP <= currP) return 0;
             return Math.round(((oldP - currP) / oldP) * 100);
          }

          // Seletor principal baseado no HTML fornecido 
          const cards = document.querySelectorAll('div[data-testid="product-card"]');

          cards.forEach(card => {
             try {
                // 1. LINK
                //  a[data-testid="product-card-link"]
                const linkEl = card.querySelector('a[data-testid="product-card-link"]');
                if (!linkEl) return;
                
                // 2. TÍTULO
                //  Tenta pegar o texto completo (a-truncate-full) ou o visível
                const titleFull = card.querySelector('.a-truncate-full');
                const titleVis = card.querySelector('.ProductCard-module__title_awabIOxk6xfKvxKcdKDH');
                let title = titleFull ? titleFull.innerText : (titleVis ? titleVis.innerText : '');
                // Limpeza: "a-offscreen" as vezes deixa lixo, pegar innerText limpo
                title = title.replace('a-offscreen', '').trim();
                if (!title || title.length < 3) return;

                // 3. IMAGEM
                // [cite: 142] img com classe ProductCardImage-module__image...
                const imgEl = card.querySelector('img[class*="ProductCardImage-module__image"]');
                let img = imgEl ? imgEl.src : '';
                // Se tiver srcset, a Amazon costuma colocar alta qualidade lá
                if (imgEl && imgEl.srcset) {
                    const srcSetArr = imgEl.srcset.split(',');
                    const lastSrc = srcSetArr[srcSetArr.length - 1]; // Pega a maior resolução
                    if (lastSrc) img = lastSrc.trim().split(' ')[0];
                }

                // 4. PREÇOS
                //  Preço atual: a-price[data-a-color="base"] .a-offscreen
                const priceNowEl = card.querySelector('.a-price[data-a-color="base"] .a-offscreen');
                //  Preço antigo: a-price[data-a-color="secondary"] .a-offscreen
                const priceOldEl = card.querySelector('.a-price[data-a-color="secondary"] .a-offscreen');
                
                let priceNowCents = priceNowEl ? extractPriceInCents(priceNowEl.innerText) : 0;
                let priceOldCents = priceOldEl ? extractPriceInCents(priceOldEl.innerText) : 0;

                // Fallback: Se não tem preço "De", mas tem badge de desconto
                // [cite: 144] div[data-component="dui-badge"]
                let discountVal = 0;
                const badgeEl = card.querySelector('div[data-component="dui-badge"] span');
                if (badgeEl && badgeEl.innerText.includes('off')) {
                    const match = badgeEl.innerText.match(/(\d+)%/);
                    if (match) discountVal = parseInt(match[1]);
                }

                // Recalcular preço original se necessário
                if (priceOldCents === 0 && priceNowCents > 0 && discountVal > 0) {
                    priceOldCents = Math.round(priceNowCents / (1 - (discountVal/100)));
                }
                
                // Validar desconto calculado vs badge
                if (priceOldCents > 0 && priceNowCents > 0) {
                    const calcDisc = calculateDiscount(priceOldCents, priceNowCents);
                    discountVal = Math.max(discountVal, calcDisc);
                }

                if (discountVal < minDisc) return;

                // 5. TRATAMENTO DE LINK (Afiliado)
                let finalLink = linkEl.href;
                // Remover parametros de rastreamento da Amazon (?ref=...)
                if (finalLink.includes('/dp/')) {
                    const asinMatch = finalLink.match(/\/dp\/([A-Z0-9]{10})/);
                    if (asinMatch) {
                        finalLink = `https://www.amazon.com.br/dp/${asinMatch[1]}`;
                    }
                }
                // Adicionar Tag
                finalLink += finalLink.includes('?') ? `&tag=${affiliateId}` : `?tag=${affiliateId}`;

                results.push({
                   nome: title,
                   imagem: img,
                   link_original: finalLink,
                   preco_de: priceOldCents.toString(),
                   preco_para: priceNowCents.toString(),
                   desconto: discountVal.toString(),
                   categoria: categoryNameForDB,
                   marketplace: 'AMAZON',
                   isActive: true
                });

             } catch (e) { /* ignore item error */ }
          });

          return results;
        }, { minDisc: this.minDiscount, affiliateId: this.affiliateId, categoryNameForDB: this.categoryNameForDB });

        console.log(`   ✅ Extraídos na pág: ${productsFromPage.length}`);
        
        // --- Processamento e Deduplicação (Mesmo do Magalu) ---
        let newCount = 0;
        for (const p of productsFromPage) {
            if (allProducts.length >= this.limit) break;
            const check = this.checkDuplicate(p);
            if (check.isDuplicate) { this.stats.duplicatesIgnored++; continue; }
            
            this.seenLinks.add(p.link_original);
            this.seenProductKeys.add(this.generateProductKey(p.nome));
            
            const finalP = {
                ...p,
                preco: this.formatPrice(parseInt(p.preco_para)),
                preco_anterior: this.formatPrice(parseInt(p.preco_de)),
                desconto: `${p.desconto}%`
            };
            if (check.isBetterOffer) {
                finalP._shouldUpdate = true;
                finalP._oldLink = check.oldLink;
                this.stats.betterOffersUpdated++;
            }
            allProducts.push(finalP);
            newCount++;
            console.log(`   🛒 ${finalP.nome.substring(0,40)}... (-${finalP.desconto})`);
        }
        
        if (newCount === 0) break; // Se não achou nada novo, para
        pageNum++;
        
      } // Fim While

      await browser.close();
      return allProducts;

    } catch (error) {
       console.error('Erro crítico Amazon:', error);
       await browser.close();
       return allProducts;
    }
  }
}

module.exports = AmazonScraper;