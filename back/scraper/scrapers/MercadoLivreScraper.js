/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - VERSÃO LIMPA 🚀
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * REGRAS SIMPLES:
 * 1. Pega TODOS os produtos da página
 * 2. Filtra por desconto e preço
 * 3. Pega a primeira imagem que achar
 * 4. Tenta conseguir link de afiliado
 * 5. Salva no banco
 * 
 * SEM FRESCURA!
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const path = require('path');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoria } = require('../../config/categorias-ml');
const MLSessionManager = require('../../services/ml-session-manager');

class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.maxPrice = options.maxPrice ? parseInt(options.maxPrice) : null;
    this.categoriaKey = options.categoria || 'todas';
    
    this.stats = {
      duplicatesIgnored: 0,
      productsCollected: 0,
      pagesScraped: 0,
      filteredByDiscount: 0,
      filteredByPrice: 0,
      affiliateLinksSuccess: 0,
      affiliateLinksFailed: 0,
      couponsApplied: 0
    };
    
    this.seenLinks = new Set();
    this.seenProductKeys = new Set();
    this.categoriaInfo = getCategoria(this.categoriaKey);
    
    if (!this.categoriaInfo) {
      this.categoriaInfo = getCategoria('todas');
    }
    
    try {
      this.sessionManager = new MLSessionManager();
      const activeSessionPath = this.sessionManager.getActiveSessionPath();
      this.sessionPath = activeSessionPath || path.join(process.cwd(), 'ml-session.json');
      console.log(activeSessionPath ? '✅ Usando sessão ativa do gerenciador' : '⚠️  Usando sessão padrão');
    } catch (error) {
      this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    }
    
    this.browser = null;
    this.context = null;
    this.isFirstProduct = true;
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes...');
    
    try {
      const conn = getProductConnection();
      const Product = getProductModel('ML', conn);
      
      const query = this.categoriaInfo.nome !== 'Todas' 
        ? { categoria: this.categoriaInfo.nome, isActive: true }
        : { isActive: true };
      
      const products = await Product.find(query)
        .select('link_afiliado nome desconto preco_para')
        .lean()
        .limit(500)
        .sort({ createdAt: -1 });
      
      console.log(`   📊 ${products.length} produtos no banco\n`);
      
      this.existingProductsMap = new Map();
      for (const product of products) {
        if (product.link_afiliado) {
          const key = this.generateProductKey(product.nome);
          this.existingProductsMap.set(key, {
            link: product.link_afiliado,
            desconto: parseInt(product.desconto) || 0,
            preco: parseInt(product.preco_para) || 0
          });
        }
      }
      
    } catch (error) {
      this.existingProductsMap = new Map();
    }
  }

  generateProductKey(name) {
    return name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(word => word.length > 2)
      .slice(0, 5)
      .join('_');
  }

  checkDuplicate(product) {
    const productKey = this.generateProductKey(product.nome);
    
    if (this.seenProductKeys.has(productKey)) {
      return { isDuplicate: true, reason: 'duplicate_in_memory' };
    }
    
    if (this.seenLinks.has(product.link_original)) {
      return { isDuplicate: true, reason: 'duplicate_link' };
    }
    
    const existing = this.existingProductsMap.get(productKey);
    if (existing) {
      const newDiscount = parseInt(product.desconto) || 0;
      const newPrice = parseInt(product.preco_para) || 0;
      
      const isBetter = newDiscount > existing.desconto || 
                      (newDiscount === existing.desconto && newPrice < existing.preco);
      
      if (!isBetter) {
        return { isDuplicate: true, reason: 'worse_offer' };
      }
    }
    
    return { isDuplicate: false };
  }

  async createBrowserContext() {
    if (this.browser) {
      try { await this.browser.close(); } catch (e) {}
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    let contextOptions = {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const fs = require('fs');
    
    if (fs.existsSync(this.sessionPath)) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(this.sessionPath, 'utf-8'));
        if (sessionData.cookies) {
          contextOptions.storageState = sessionData;
          console.log('   ✅ Sessão carregada (cookies restaurados)\n');
        }
      } catch (error) {
        console.log('   ⚠️  Erro ao carregar sessão\n');
      }
    }

    this.context = await this.browser.newContext(contextOptions);
    await this.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    return { browser: this.browser, context: this.context };
  }

  async getAffiliateLink(productUrl) {
    const page = await this.context.newPage();
    
    try {
      await page.goto(productUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 12000
      });

      await page.waitForTimeout(600);

      const hasShareButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        return buttons.some(btn => btn.textContent?.toLowerCase().includes('compartilhar'));
      });

      if (!hasShareButton) {
        await page.close();
        return productUrl;
      }

      try { await page.evaluate(() => navigator.clipboard.writeText('')); } catch (e) {}
      await page.waitForTimeout(100);

      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const shareBtn = buttons.find(btn => btn.textContent?.toLowerCase().includes('compartilhar'));
        if (shareBtn) {
          shareBtn.click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        await page.close();
        return productUrl;
      }

      await page.waitForTimeout(1000);

      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(80);
      }
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1200);

      let copiedLink = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          copiedLink = await page.evaluate(() => navigator.clipboard.readText());
          if (copiedLink && copiedLink.trim() !== '') break;
          if (attempt < 3) await page.waitForTimeout(400);
        } catch (e) {}
      }

      await page.keyboard.press('Escape');
      await page.close();

      if (copiedLink && copiedLink.trim() !== '') {
        const cleanLink = copiedLink.trim();
        if (cleanLink.includes('/sec/') || cleanLink.includes('mercadolivre.com')) {
          return cleanLink;
        }
      }

      return productUrl;

    } catch (error) {
      try { await page.close(); } catch (e) {}
      return productUrl;
    }
  }

  async processProducts(products, allProducts) {
    for (const prodData of products) {
      if (allProducts.length >= this.limit) break;

      let finalPrice = prodData.currentPrice;
      let couponApplied = false;
      let couponText = '';
      let realDiscount = prodData.discount;

      if (prodData.coupon && prodData.currentPrice >= prodData.coupon.minValue) {
        if (prodData.coupon.type === 'percent') {
          finalPrice = prodData.currentPrice - Math.round(prodData.currentPrice * (prodData.coupon.discount / 100));
        } else if (prodData.coupon.type === 'value') {
          finalPrice = prodData.currentPrice - prodData.coupon.discount;
        }
        
        couponApplied = true;
        couponText = prodData.coupon.text;
        realDiscount = Math.round(((prodData.oldPrice - finalPrice) / prodData.oldPrice) * 100);
        this.stats.couponsApplied++;
      }

      if (this.maxPrice && finalPrice > this.maxPrice) {
        this.stats.filteredByPrice++;
        continue;
      }

      if (this.seenLinks.has(prodData.link)) {
        this.stats.duplicatesIgnored++;
        continue;
      }

      this.seenLinks.add(prodData.link);

      console.log(`   🔄 [${allProducts.length + 1}/${this.limit}] ${prodData.name.substring(0, 40)}...`);
      
      const affiliateLink = await this.getAffiliateLink(prodData.link);
      const finalLink = affiliateLink || prodData.link;
      const isAffiliate = finalLink.includes('/sec/');

      if (isAffiliate) {
        console.log(`      ✅ Afiliado`);
        this.stats.affiliateLinksSuccess++;
      } else {
        console.log(`      ⚠️  Original`);
        this.stats.affiliateLinksFailed++;
      }

      const product = {
        nome: prodData.name,
        imagem: prodData.image,
        link_original: prodData.link,
        link_afiliado: finalLink,
        desconto: `${realDiscount}%`,
        preco: `R$ ${finalPrice}`,
        preco_anterior: `R$ ${prodData.oldPrice}`,
        preco_de: String(prodData.oldPrice),
        preco_para: String(finalPrice),
        categoria: this.categoriaInfo.nome,
        marketplace: 'ML',
        isActive: true
      };

      if (couponApplied) {
        product.cupom_aplicado = true;
        product.cupom_texto = couponText;
        product.preco_sem_cupom = String(prodData.currentPrice);
        product.desconto_cupom = String(prodData.currentPrice - finalPrice);
      }

      this.stats.productsCollected++;
      allProducts.push(product);

      if (allProducts.length >= this.limit) break;

      await new Promise(r => setTimeout(r, 150));
    }
  }

  async scrapeCategory() {
    const startTime = Date.now();
    
    await this.loadExistingProducts();
    const { browser, context } = await this.createBrowserContext();
   
    let allProducts = [];
    let pageNum = 1;
    let currentOffset = 0;
    let lastPageLinks = [];
    let samePageCount = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  ${this.categoriaInfo.emoji}  ${this.categoriaInfo.nome.padEnd(47)} ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(26)} ║`);
      if (this.maxPrice) {
        console.log(`║  💰 PREÇO MÁXIMO: R$ ${this.maxPrice}${' '.repeat(29 - String(this.maxPrice).length)} ║`);
      }
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= 50) {
        const baseUrl = this.categoriaInfo.url;
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = pageNum === 1 ? baseUrl : `${baseUrl}${separator}_Desde_${currentOffset + 1}&_NoIndex_true`;
       
        console.log(`📄 Página ${pageNum} [${allProducts.length}/${this.limit}]`);
       
        try {
          const mainPage = await context.newPage();
          
          await mainPage.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: pageNum === 1 ? 20000 : 15000
          });

          await mainPage.waitForTimeout(pageNum === 1 ? 2000 : 1200);

          // Scroll para carregar lazy loading
          await mainPage.evaluate(async () => {
            await new Promise((resolve) => {
              let totalHeight = 0;
              const distance = 300;
              const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= document.body.scrollHeight) {
                  clearInterval(timer);
                  window.scrollTo(0, 0);
                  resolve();
                }
              }, 100);
            });
          });

          await mainPage.waitForTimeout(1500);

          const pageData = await mainPage.evaluate(({ minDiscount, maxPrice }) => {
            // PEGA TODOS OS CARDS DA PÁGINA
            const cards = document.querySelectorAll('.poly-card, .ui-search-result');
            
            const products = [];
            const allPageLinks = [];
            let filteredByDiscount = 0;
            let filteredByPrice = 0;
            
            cards.forEach(card => {
              try {
                // PEGA QUALQUER LINK
                const linkElement = card.querySelector('a[href*="mercadolivre.com"]') || 
                                   card.querySelector('a[href*="/p/"]') ||
                                   card.querySelector('a[href*="/MLB"]') ||
                                   card.querySelector('a');
                
                if (!linkElement || !linkElement.href) return;
                
                const link = linkElement.href.split('?')[0];
                allPageLinks.push(link);
                
                // NOME
                const name = card.querySelector('h2, .poly-component__title, [class*="title"]')?.innerText || 'Sem nome';
                
                // IMAGEM: Prioriza src real e ignora placeholders
                let image = null;
                const imgs = card.querySelectorAll('img');
                
                for (const img of imgs) {
                  const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || '';
                  
                  // Ignora placeholders e imagens inválidas
                  if (!src || 
                      src.startsWith('data:') || 
                      src.includes('default.webp') ||
                      src.includes('placeholder') ||
                      src.length < 30) {
                    continue;
                  }
                  
                  // Formata URL
                  let finalSrc = src.startsWith('//') ? 'https:' + src : src;
                  
                  // Converte WEBP → JPG
                  finalSrc = finalSrc.replace(/\.webp/gi, '.jpg');
                  
                  image = finalSrc;
                  break;
                }
                
                // Fallback: tenta data-lazy ou qualquer atributo com URL de imagem
                if (!image) {
                  for (const img of imgs) {
                    const attrs = ['data-src', 'data-lazy', 'data-original', 'srcset'];
                    for (const attr of attrs) {
                      const val = img.getAttribute(attr);
                      if (val && val.includes('mlstatic.com') && !val.includes('default')) {
                        const urlMatch = val.match(/(https?:)?\/\/[^\s,]+\.(?:jpg|jpeg|png)/i);
                        if (urlMatch) {
                          image = urlMatch[0].startsWith('//') ? 'https:' + urlMatch[0] : urlMatch[0];
                          break;
                        }
                      }
                    }
                    if (image) break;
                  }
                }
                
                // Se ainda não achou, usa placeholder
                if (!image) {
                  image = 'https://http2.mlstatic.com/D_NQ_NP_2X_default.webp';
                }
                
                // DESCONTO
                const discountEl = card.querySelector('.poly-price__disc_label, .andes-money-amount__discount');
                const discount = parseInt((discountEl?.innerText || '0').replace(/\D/g, '')) || 0;
                
                if (discount < minDiscount) {
                  filteredByDiscount++;
                  return;
                }
                
                // PREÇOS
                let currentPrice = 0, oldPrice = 0;
                const priceContainer = card.querySelector('.poly-component__price');
                
                if (priceContainer) {
                  const previousPrice = priceContainer.querySelector('.andes-money-amount--previous .andes-money-amount__fraction');
                  const currentContainer = priceContainer.querySelector('.poly-price__current');
                  
                  if (previousPrice && currentContainer) {
                    const currentFraction = currentContainer.querySelector('.andes-money-amount__fraction');
                    if (currentFraction) {
                      oldPrice = parseInt(previousPrice.innerText.replace(/\./g, '')) || 0;
                      currentPrice = parseInt(currentFraction.innerText.replace(/\./g, '')) || 0;
                    }
                  }
                  
                  if (currentPrice === 0) {
                    const allFractions = Array.from(priceContainer.querySelectorAll('.andes-money-amount__fraction'));
                    
                    if (allFractions.length >= 2) {
                      const previousFractions = allFractions.filter(f => 
                        f.closest('.andes-money-amount')?.classList.contains('andes-money-amount--previous')
                      );
                      const currentFractions = allFractions.filter(f => 
                        !f.closest('.andes-money-amount')?.classList.contains('andes-money-amount--previous')
                      );
                      
                      if (previousFractions.length > 0 && currentFractions.length > 0) {
                        oldPrice = parseInt(previousFractions[0].innerText.replace(/\./g, '')) || 0;
                        currentPrice = parseInt(currentFractions[0].innerText.replace(/\./g, '')) || 0;
                      } else if (allFractions.length >= 2) {
                        const p1 = parseInt(allFractions[0].innerText.replace(/\./g, '')) || 0;
                        const p2 = parseInt(allFractions[1].innerText.replace(/\./g, '')) || 0;
                        currentPrice = Math.min(p1, p2);
                        oldPrice = Math.max(p1, p2);
                      }
                    } else if (allFractions.length === 1 && discount > 0) {
                      currentPrice = parseInt(allFractions[0].innerText.replace(/\./g, '')) || 0;
                      oldPrice = Math.round(currentPrice / (1 - discount / 100));
                    }
                  }
                }
                
                if (currentPrice > 0 && oldPrice > 0 && currentPrice >= oldPrice) {
                  [oldPrice, currentPrice] = [currentPrice, oldPrice];
                }
                
                if ((currentPrice === 0 || oldPrice === 0 || currentPrice >= oldPrice) && discount > 0) {
                  if (currentPrice > 0) {
                    oldPrice = Math.round(currentPrice / (1 - discount / 100));
                  } else if (oldPrice > 0) {
                    currentPrice = Math.round(oldPrice * (1 - discount / 100));
                  }
                }
                
                if (currentPrice === 0 || oldPrice === 0 || currentPrice >= oldPrice) {
                  filteredByPrice++;
                  return;
                }
                
                // CUPOM
                let couponInfo = null;
                const couponEl = card.querySelector('[class*="coupon"], [class*="cupom"]');
                if (couponEl) {
                  const couponText = couponEl.innerText || '';
                  const percentMatch = couponText.match(/(\d+)%\s*OFF/i);
                  const valueMatch = couponText.match(/R\$\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i);
                  
                  if (percentMatch || valueMatch) {
                    let minValue = 0;
                    const minValueMatch = couponText.match(/m[ií]nim[ao]\s*R?\$?\s*(\d+(?:\.\d{3})*(?:,\d{2})?)/i);
                    if (minValueMatch) {
                      minValue = parseInt(minValueMatch[1].replace(/\./g, '').replace(',', '.'));
                    }
                    
                    couponInfo = {
                      type: percentMatch ? 'percent' : 'value',
                      discount: percentMatch 
                        ? parseInt(percentMatch[1]) 
                        : parseInt(valueMatch[1].replace(/\./g, '').replace(',', '.')),
                      minValue: minValue,
                      text: couponText.trim()
                    };
                  }
                }
                
                let finalPrice = currentPrice;
                if (couponInfo && currentPrice >= couponInfo.minValue) {
                  if (couponInfo.type === 'percent') {
                    finalPrice = currentPrice - Math.round(currentPrice * (couponInfo.discount / 100));
                  } else if (couponInfo.type === 'value') {
                    finalPrice = currentPrice - couponInfo.discount;
                  }
                }
                
                if (maxPrice && finalPrice > maxPrice) {
                  filteredByPrice++;
                  return;
                }
                
                products.push({ 
                  link, 
                  name, 
                  image, 
                  discount, 
                  currentPrice, 
                  oldPrice,
                  coupon: couponInfo 
                });
              } catch (e) {
                // Ignora erros
              }
            });
            
            return { products, filteredByDiscount, filteredByPrice, allPageLinks };
          }, { minDiscount: this.minDiscount, maxPrice: this.maxPrice });

          await mainPage.close();

          console.log(`   📊 ${pageData.products.length} produtos encontrados`);
          console.log(`   🔍 ${pageData.filteredByDiscount} desc | ${pageData.filteredByPrice} preço\n`);

          // Detecta loop
          const currentPageLinks = (pageData.allPageLinks || []).sort();
          const lastLinks = lastPageLinks.sort();
          
          if (currentPageLinks.length > 0 && lastLinks.length > 0 &&
              JSON.stringify(currentPageLinks) === JSON.stringify(lastLinks)) {
            samePageCount++;
            console.log(`   ⚠️  Página repetida (${samePageCount}/3)\n`);
            if (samePageCount >= 3) {
              console.log(`   🛑 LOOP DETECTADO! Parando...\n`);
              break;
            }
          } else {
            samePageCount = 0;
            lastPageLinks = currentPageLinks;
          }

          const newProducts = pageData.products.filter(p => !this.seenLinks.has(p.link));
          this.stats.filteredByDiscount += pageData.filteredByDiscount;
          this.stats.filteredByPrice += pageData.filteredByPrice;

          if (newProducts.length === 0) {
            this.stats.pagesScraped = pageNum;
            pageNum++;
            currentOffset += 48;
            continue;
          }

          console.log(`   🔗 Obtendo links (serial)...\n`);

          await this.processProducts(newProducts, allProducts);

          if (allProducts.length >= this.limit) break;

          this.stats.pagesScraped = pageNum;
          pageNum++;
          currentOffset += 48;
          
        } catch (pageError) {
          console.error(`   ❌ Erro na página: ${pageError.message}`);
          this.stats.pagesScraped = pageNum;
          pageNum++;
          currentOffset += 48;
        }
      }

      await browser.close();
      this.browser = null;
      this.context = null;

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n╔════════════════════════════════════════════════════╗`);
      console.log(`║              🏁 FINALIZADO 🏁                      ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`✨ Coletados: ${allProducts.length}/${this.limit}`);
      console.log(`🔗 Afiliado: ${this.stats.affiliateLinksSuccess} | Original: ${this.stats.affiliateLinksFailed}`);
      console.log(`🎟️  Cupons aplicados: ${this.stats.couponsApplied}`);
      console.log(`⏭️  Duplicados: ${this.stats.duplicatesIgnored}`);
      console.log(`🚫 Filtrados: ${this.stats.filteredByDiscount} desc | ${this.stats.filteredByPrice} preço`);
      console.log(`📄 Páginas: ${this.stats.pagesScraped}`);
      console.log(`⏱️  Tempo: ${duration}s\n`);

      return allProducts.slice(0, this.limit);

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      try { if (this.browser) await this.browser.close(); } catch (e) {}
      return allProducts.slice(0, this.limit);
    }
  }
}

module.exports = MercadoLivreScraper;