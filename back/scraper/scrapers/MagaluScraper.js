const { chromium } = require('playwright');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');

class MagaluScraper {
  constructor(minDiscount = 30) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    this.existingProductsMap = new Map();
    this.affiliateId = process.env.MAGALU_AFFILIATE_ID || 'magazinepromoforia';
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes do banco...');
    
    try {
      const conn = getProductConnection();
      const Product = getProductModel('magalu', conn);
      
      const products = await Product.find({ 
        isActive: true 
      }).select('link_original nome desconto preco_para preco_de isActive marketplace').lean();
      
      console.log(`   📊 Produtos do Magalu encontrados: ${products.length}`);
      
      if (products.length > 0) {
        console.log(`   📊 Exemplo do primeiro produto:`, {
          nome: products[0].nome?.substring(0, 30),
          marketplace: products[0].marketplace,
          link_original: products[0].link_original ? products[0].link_original.substring(0, 50) + '...' : '❌ VAZIO',
          isActive: products[0].isActive
        });
      }
      
      console.log(`   ├─ Ativos: ${products.filter(p => p.isActive).length}`);
      console.log(`   └─ Inativos: ${products.filter(p => !p.isActive).length}`);
      
      let added = 0;
      products.forEach(p => {
        if (p.link_original) {
          p.desconto = String(p.desconto || '0').replace(/\D/g, '');
          p.preco_para = String(p.preco_para || '0').replace(/\D/g, '');
          this.existingProductsMap.set(p.link_original, p);
          added++;
        }
      });
      
      console.log(`   ✅ ${added} produtos carregados no cache\n`);
    } catch (error) {
      console.error('⚠️  Erro ao carregar produtos do banco:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  normalizeProductName(name) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  isBetterOffer(newProduct, existingProduct) {
    const newDiscount = parseInt(newProduct.desconto) || 0;
    const existingDiscount = parseInt(existingProduct.desconto) || 0;
    
    const newPrice = parseInt(newProduct.preco_para) || 0;
    const existingPrice = parseInt(existingProduct.preco_para) || 0;

    if (newDiscount > existingDiscount) return true;
    if (newDiscount === existingDiscount && newPrice < existingPrice) return true;
    
    return false;
  }

  async processProduct(product, collectedProducts) {
    const normalizedName = this.normalizeProductName(product.nome);
    
    const duplicateInMemory = collectedProducts.some(p => {
      const existingNormalized = this.normalizeProductName(p.nome);
      return p.link_original === product.link_original ||
             existingNormalized.split(' ').slice(0, 5).join(' ') === 
             normalizedName.split(' ').slice(0, 5).join(' ');
    });

    if (duplicateInMemory) {
      return { action: 'skip', reason: 'duplicate_in_memory' };
    }

    const existingInDb = this.existingProductsMap.get(product.link_original);
    
    if (!existingInDb) {
      for (const [link, existingProd] of this.existingProductsMap.entries()) {
        const existingNormalized = this.normalizeProductName(existingProd.nome);
        if (existingNormalized.split(' ').slice(0, 5).join(' ') === 
            normalizedName.split(' ').slice(0, 5).join(' ')) {
          
          if (this.isBetterOffer(product, existingProd)) {
            return { 
              action: 'update', 
              reason: 'better_offer',
              oldLink: link 
            };
          } else {
            return { action: 'skip', reason: 'worse_offer' };
          }
        }
      }
      
      return { action: 'add', reason: 'new_product' };
    }

    if (this.isBetterOffer(product, existingInDb)) {
      return { 
        action: 'update', 
        reason: 'better_offer',
        oldLink: product.link_original 
      };
    }

    return { action: 'skip', reason: 'worse_or_equal_offer' };
  }

  async scrapeCategory() {
    await this.loadExistingProducts();

    // ═══════════════════════════════════════════════════════════
    // 🔥 CONFIGURAÇÃO ANTI-DETECÇÃO PARA HEADLESS MODE
    // ═══════════════════════════════════════════════════════════
    const browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // Remove "navigator.webdriver"
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      // Headers extras para parecer mais humano
      extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });
    
    const page = await context.newPage();
    
    // Remove "navigator.webdriver" flag
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });
    
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 50;
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  🎯 META: ${this.limit} produtos NOVOS (${this.minDiscount}%+ desconto) ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const url = `https://www.magazinevoce.com.br/${this.affiliateId}/selecao/ofertasdodia/?page=${pageNum}`;
        
        const progressBar = this.getProgressBar(allProducts.length, this.limit);
        console.log(`📄 Pág ${pageNum.toString().padStart(2, '0')}/${maxPages} ${progressBar} [${allProducts.length}/${this.limit}] (${this.duplicatesIgnored} ignorados | ${this.betterOffersUpdated} melhorados)`);
        
        try {
          // Navega com waitUntil mais flexível
          await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
          });
          
          // Aguarda mais tempo para o conteúdo carregar
          await page.waitForTimeout(4000);

          // Scroll MUITO mais devagar e natural (simula humano)
          await page.evaluate(async () => {
            const scrollDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            
            for (let i = 0; i < 10; i++) {
              const scrollAmount = 400 + Math.random() * 200; // Scroll variável
              window.scrollBy(0, scrollAmount);
              await scrollDelay(500 + Math.random() * 300); // Delay variável
            }
            
            window.scrollTo(0, 0);
            await scrollDelay(1000);
          });
          
          // Aguarda mais um pouco após scroll
          await page.waitForTimeout(2000);

          // Tenta esperar por elementos de produto aparecerem
          try {
            await page.waitForSelector('a[href*="/produto/"], [data-testid*="product"]', { 
              timeout: 10000 
            });
          } catch (e) {
            console.log(`   ⚠️  Timeout aguardando produtos, mas continuando...`);
          }

          const productsFromPage = await page.evaluate(({ minDisc, affiliateId }) => {
            const results = [];
            
            // Tenta múltiplos seletores
            let items = [];
            
            items = document.querySelectorAll('[data-testid*="product-card"], [data-testid="product-card-container"]');
            
            if (items.length === 0) {
              items = document.querySelectorAll('a[href*="/produto/"]');
            }
            
            if (items.length === 0) {
              items = document.querySelectorAll('.sc-dGHKFe, [class*="ProductCard"], [class*="product-card"]');
            }
            
            // Fallback: pega TODOS os links e filtra os de produto
            if (items.length === 0) {
              const allLinks = document.querySelectorAll('a[href]');
              items = Array.from(allLinks).filter(link => 
                link.href && link.href.includes('magazinevoce') && link.href.includes('/produto/')
              );
            }

            console.log(`🔍 Encontrados ${items.length} itens na página`);

            items.forEach((item, index) => {
              try {
                let card = item;
                if (item.tagName === 'A') {
                  card = item.closest('li') || item.closest('div[class*="card"]') || item.parentElement || item;
                }
                
                const cardText = card.innerText || item.innerText || '';
                
                let linkEl = card.querySelector('a[href*="/produto/"]') || (item.tagName === 'A' ? item : null);
                if (!linkEl) {
                  linkEl = card.querySelector('a[href]');
                }
                
                if (!linkEl || !linkEl.href || !linkEl.href.includes('magazinevoce')) {
                  return;
                }
                
                // Título
                let titleEl = card.querySelector('[data-testid*="title"]') || 
                             card.querySelector('h2') || 
                             card.querySelector('h3') ||
                             card.querySelector('[class*="title"]') ||
                             card.querySelector('[class*="Title"]');
                
                let productTitle = titleEl ? titleEl.innerText.trim() : '';
                
                if (!productTitle && linkEl.title) {
                  productTitle = linkEl.title;
                }
                
                if (!productTitle && linkEl.getAttribute('aria-label')) {
                  productTitle = linkEl.getAttribute('aria-label');
                }
                
                // Preço atual
                let currentPriceEl = card.querySelector('[data-testid="price-value"]') ||
                                    card.querySelector('[class*="price-value"]') ||
                                    card.querySelector('[class*="PriceValue"]');
                
                let currentPrice = '0';
                if (currentPriceEl) {
                  currentPrice = currentPriceEl.innerText.replace(/[^\d]/g, '');
                } else {
                  const priceMatch = cardText.match(/R\$\s*(\d+[.,]\d+)/);
                  if (priceMatch) {
                    currentPrice = priceMatch[1].replace(/[^\d]/g, '');
                  }
                }
                
                // Desconto
                const discountMatches = cardText.match(/(\d+)%/g);
                let discountVal = 0;
                
                if (discountMatches) {
                  const allDiscounts = discountMatches.map(m => parseInt(m));
                  discountVal = Math.max(...allDiscounts);
                }
                
                // Imagem
                let imgEl = card.querySelector('img');
                let imageUrl = '';
                if (imgEl) {
                  imageUrl = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src') || '';
                }
                
                // Validações
                if (!productTitle || productTitle.length < 3) {
                  return;
                }
                
                if (discountVal < minDisc) {
                  return;
                }
                
                if (!currentPrice || currentPrice === '0') {
                  return;
                }
                
                // Calcula preço antigo
                let oldPrice = '0';
                if (currentPrice && discountVal > 0) {
                  const currentVal = parseInt(currentPrice);
                  oldPrice = Math.round(currentVal / (1 - discountVal / 100)).toString();
                }
                
                // URL
                let fullUrl = linkEl.href;
                
                if (!fullUrl.includes(affiliateId)) {
                  const url = new URL(fullUrl);
                  const pathParts = url.pathname.split('/').filter(p => p);
                  
                  if (pathParts.length > 0 && pathParts[0] !== affiliateId) {
                    url.pathname = `/${affiliateId}${url.pathname}`;
                    fullUrl = url.toString();
                  }
                }
                
                const cleanLink = fullUrl.split('?')[0].split('#')[0];
                
                if (!cleanLink || cleanLink.length < 30 || !cleanLink.startsWith('http')) {
                  return;
                }
                
                results.push({
                  nome: productTitle,
                  imagem: imageUrl,
                  link_original: cleanLink,
                  preco: `R$ ${currentPrice}`,
                  preco_anterior: `R$ ${oldPrice}`,
                  preco_de: oldPrice,
                  preco_para: currentPrice,
                  desconto: `${discountVal}%`,
                  marketplace: 'MAGALU',
                  isActive: true
                });
                
              } catch (e) {
                // Silencioso
              }
            });
            
            return results;
          }, { minDisc: this.minDiscount, affiliateId: this.affiliateId });

          console.log(`   ✅ Extraídos: ${productsFromPage.length} produtos da página ${pageNum}`);

          for (const product of productsFromPage) {
            if (!product.link_original || product.link_original.length < 20) {
              continue;
            }

            const result = await this.processProduct(product, allProducts);
            
            if (result.action === 'add' || result.action === 'update') {
              if (result.action === 'update') {
                product._shouldUpdate = true;
                product._oldLink = result.oldLink;
                this.betterOffersUpdated++;
              }
              
              allProducts.push(product);
              
              if (allProducts.length >= this.limit) {
                console.log(`   ✅ Limite atingido! ${allProducts.length}/${this.limit}\n`);
                break;
              }
            } else {
              this.duplicatesIgnored++;
            }
          }

          if (productsFromPage.length === 0) {
            console.log(`   ⚠️  Página vazia, encerrando.\n`);
            break;
          }

          if (allProducts.length >= this.limit) break;

          pageNum++;
          
          // Delay variável entre páginas (mais humano)
          await page.waitForTimeout(2500 + Math.random() * 2000);

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}:`, pageError.message);
          pageNum++;
        }
      }

      await browser.close();

      const finalProducts = allProducts.slice(0, this.limit);
      
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║           🏁 SCRAPING FINALIZADO 🏁              ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`✨ Produtos coletados: ${finalProducts.length}/${this.limit}`);
      console.log(`   └─ Novos: ${finalProducts.filter(p => !p._shouldUpdate).length}`);
      console.log(`   └─ Ofertas melhoradas: ${this.betterOffersUpdated}`);
      console.log(`⏭️  Ignorados (pior/igual oferta): ${this.duplicatesIgnored}`);
      console.log(`📄 Páginas percorridas: ${pageNum - 1}`);
      console.log(`💾 Produtos no banco antes: ${this.existingProductsMap.size}`);
      
      if (finalProducts.length < this.limit) {
        console.log(`\n⚠️  ATENÇÃO: Só ${finalProducts.length} produtos válidos.`);
        console.log(`   • Reduza MIN_DISCOUNT para mais resultados`);
        console.log(`   • Ou limpe produtos antigos do banco`);
      }
      
      console.log('╚════════════════════════════════════════════════════╝\n');

      return finalProducts;

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      console.error(error.stack);
      await browser.close();
      return allProducts.slice(0, this.limit);
    }
  }

  getProgressBar(current, total) {
    const percentage = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`;
  }
}

module.exports = MagaluScraper;