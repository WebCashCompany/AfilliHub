/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAGALU SCRAPER - VERSÃO CORRIGIDA (BASEADA NO ML SCRAPER)
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * @version 2.0.0 - PRODUCTION READY
 * @fixes Correção na extração de preços e descontos
 * 
 * CORREÇÕES IMPLEMENTADAS:
 * ✅ Extração correta do preço DE (anterior) direto do HTML
 * ✅ Extração correta do preço PARA (atual) 
 * ✅ Cálculo correto do desconto real
 * ✅ Validação de dados antes de salvar
 * ✅ Sistema de cache e duplicatas igual ao ML
 */

const { chromium } = require('playwright');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoryUrl, getCategoryName, MAGALU_CATEGORIES } = require('../../config/categorias-magalu');

class MagaluScraper {
  constructor(minDiscount = 30) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.affiliateId = process.env.MAGALU_AFFILIATE_ID || 'magazinepromoforia';
    
    // Estatísticas
    this.stats = {
      duplicatesIgnored: 0,
      betterOffersUpdated: 0,
      productsCollected: 0,
      pagesScraped: 0,
      errors: 0,
      filteredByDiscount: 0,
      invalidProducts: 0
    };
    
    // Cache de produtos
    this.seenLinks = new Set();
    this.seenProductKeys = new Set();
    this.existingProductsMap = new Map();
    
    // Categoria atual
    this.currentCategory = 'OFERTAS_DIA';
    this.categoryName = 'Ofertas do Dia';
    this.categoryNameForDB = 'Ofertas do Dia';
  }

  /**
   * Define a categoria que será coletada
   */
  setCategory(categoryKey) {
    if (!MAGALU_CATEGORIES[categoryKey]) {
      throw new Error(`Categoria "${categoryKey}" não existe`);
    }
    
    this.currentCategory = categoryKey;
    this.categoryName = MAGALU_CATEGORIES[categoryKey].name;
    this.categoryNameForDB = getCategoryName(categoryKey);
    
    console.log(`📂 Categoria: ${this.categoryName} → "${this.categoryNameForDB}"`);
  }

  /**
   * Carrega produtos existentes do banco (igual ao ML)
   */
  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes...');
    
    try {
      const conn = getProductConnection();
      const Product = getProductModel('magalu', conn);
      
      const products = await Product.find({ 
        isActive: true,
        marketplace: 'MAGALU'
      })
      .select('link_original nome desconto preco_para preco_de categoria')
      .lean()
      .limit(500)
      .sort({ createdAt: -1 });
      
      console.log(`   📊 ${products.length} produtos no banco\n`);
      
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
      
    } catch (error) {
      console.log('   ⚠️  Continuando sem cache do banco\n');
      this.existingProductsMap = new Map();
    }
  }

  /**
   * Gera chave única do produto (igual ao ML)
   */
  generateProductKey(name) {
    return name
      .toLowerCase()
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

  /**
   * Verifica se é oferta melhor (igual ao ML)
   */
  isBetterOffer(newProduct, existingProduct) {
    const newDiscount = parseInt(newProduct.desconto) || 0;
    const newPrice = parseInt(newProduct.preco_para) || 0;
    
    return newDiscount > existingProduct.desconto || 
           (newDiscount === existingProduct.desconto && newPrice < existingProduct.preco);
  }

  /**
   * Verifica duplicatas (igual ao ML)
   */
  checkDuplicate(product, collectedProducts) {
    const productKey = this.generateProductKey(product.nome);
    
    if (this.seenProductKeys.has(productKey)) {
      return { isDuplicate: true, reason: 'duplicate_in_memory' };
    }
    
    if (this.seenLinks.has(product.link_original)) {
      return { isDuplicate: true, reason: 'duplicate_link' };
    }
    
    const existing = this.existingProductsMap.get(productKey);
    if (existing && !this.isBetterOffer(product, existing)) {
      return { isDuplicate: true, reason: 'worse_offer' };
    }
    
    if (existing && this.isBetterOffer(product, existing)) {
      return { isDuplicate: false, isBetterOffer: true, oldLink: existing.link };
    }
    
    return { isDuplicate: false };
  }

  /**
   * Formata preço em centavos para exibição
   */
  formatPrice(cents) {
    if (!cents || cents === 0) return 'R$ 0,00';
    const reais = Math.floor(cents / 100);
    const centavos = cents % 100;
    return `R$ ${reais.toLocaleString('pt-BR')},${centavos.toString().padStart(2, '0')}`;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * SCRAPING PRINCIPAL - VERSÃO CORRIGIDA
   * ═══════════════════════════════════════════════════════════════════
   */
  async scrapeCategory() {
    const startTime = Date.now();
    
    await this.loadExistingProducts();

    const browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo'
    });
    
    const page = await context.newPage();
    
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 50;
    let emptyPagesCount = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  📂 ${this.categoryName.padEnd(48)} ║`);
      console.log(`║  💾 Salva como: "${this.categoryNameForDB}"${' '.repeat(48 - 16 - this.categoryNameForDB.length)} ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(19)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const url = getCategoryUrl(this.currentCategory, this.affiliateId, pageNum);
        
        console.log(`📄 Pág ${pageNum.toString().padStart(2, '0')}/${maxPages} [${allProducts.length}/${this.limit}]`);
        
        try {
          await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
          });
          
          await page.waitForTimeout(3000);

          // Scroll para carregar produtos
          await page.evaluate(async () => {
            const scrollDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            for (let i = 0; i < 8; i++) {
              window.scrollBy(0, 400);
              await scrollDelay(400);
            }
            window.scrollTo(0, 0);
          });
          
          await page.waitForTimeout(2000);

          // ═══════════════════════════════════════════════════════════
          // EXTRAÇÃO CORRIGIDA DE PRODUTOS
          // ═══════════════════════════════════════════════════════════
          const productsFromPage = await page.evaluate(({ minDisc, affiliateId, categoryNameForDB }) => {
            const results = [];
            
            /**
             * 🔧 FUNÇÃO CORRIGIDA - Extrai preço em centavos
             * Agora funciona igual ao ML Scraper
             */
            function extractPriceInCents(text) {
              if (!text) return 0;
              
              // Remove tudo exceto números, vírgula e ponto
              const cleaned = text.replace(/[^\d.,]/g, '');
              
              // Casos: "199,90" ou "1.199,90" ou "199.90"
              let priceStr = cleaned;
              
              if (priceStr.includes(',')) {
                // Formato BR: 1.199,90 → 119990
                priceStr = priceStr.replace(/\./g, '').replace(',', '');
              } else if (priceStr.includes('.')) {
                // Se tem ponto, pode ser: 199.90 ou 1.199
                const parts = priceStr.split('.');
                if (parts.length === 2 && parts[1].length === 2) {
                  // 199.90 → 19990
                  priceStr = priceStr.replace('.', '');
                } else {
                  // 1.199 → 119900
                  priceStr = priceStr.replace(/\./g, '') + '00';
                }
              } else {
                // Sem separador: assumir que precisa adicionar centavos
                if (priceStr.length <= 3) {
                  priceStr = priceStr + '00';
                }
              }
              
              return parseInt(priceStr) || 0;
            }
            
            /**
             * 🔧 CÁLCULO CORRETO DO DESCONTO
             * Baseado nos preços reais (DE e PARA)
             */
            function calculateDiscount(oldPriceCents, currentPriceCents) {
              if (!oldPriceCents || !currentPriceCents || oldPriceCents <= currentPriceCents) {
                return 0;
              }
              const discount = Math.round(((oldPriceCents - currentPriceCents) / oldPriceCents) * 100);
              return Math.max(0, Math.min(99, discount));
            }
            
            // Seleciona cards de produtos
            let items = document.querySelectorAll('[data-testid*="product-card"], [data-testid="product-card-container"]');
            
            if (items.length === 0) {
              items = document.querySelectorAll('a[href*="/produto/"]');
            }

            items.forEach((item) => {
              try {
                let card = item;
                if (item.tagName === 'A') {
                  card = item.closest('li') || item.closest('div[class*="card"]') || item.parentElement || item;
                }
                
                // 🔗 LINK DO PRODUTO
                let linkEl = card.querySelector('a[href*="/produto/"]') || (item.tagName === 'A' ? item : null);
                if (!linkEl || !linkEl.href) return;
                
                // 📝 NOME DO PRODUTO
                let titleEl = card.querySelector('[data-testid*="title"]') || 
                             card.querySelector('h2, h3') ||
                             card.querySelector('[class*="title"]');
                
                let productTitle = titleEl ? titleEl.innerText.trim() : '';
                if (!productTitle && linkEl.title) productTitle = linkEl.title;
                if (!productTitle || productTitle.length < 3) return;
                
                // 🖼️ IMAGEM
                let imgEl = card.querySelector('img');
                let imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';
                
                // ═══════════════════════════════════════════════════════
                // 💰 EXTRAÇÃO CORRETA DE PREÇOS
                // ═══════════════════════════════════════════════════════
                
                const cardText = card.innerText || '';
                
                // Busca TODOS os preços no card
                const allPriceElements = card.querySelectorAll(
                  '[data-testid*="price"], [class*="price"], [class*="Price"]'
                );
                
                let currentPriceCents = 0;
                let oldPriceCents = 0;
                
                // 🔍 MÉTODO 1: Buscar por data-testid específicos
                const currentPriceEl = card.querySelector('[data-testid="price-value"]');
                const oldPriceEl = card.querySelector('[data-testid="price-original"]') || 
                                  card.querySelector('[class*="price-original"]') ||
                                  card.querySelector('[class*="old-price"]');
                
                if (currentPriceEl) {
                  currentPriceCents = extractPriceInCents(currentPriceEl.innerText);
                }
                
                if (oldPriceEl) {
                  oldPriceCents = extractPriceInCents(oldPriceEl.innerText);
                }
                
                // 🔍 MÉTODO 2: Se não encontrou, buscar por regex no texto
                if (currentPriceCents === 0 || oldPriceCents === 0) {
                  const priceMatches = cardText.match(/R\$\s*[\d.,]+/g);
                  
                  if (priceMatches && priceMatches.length >= 2) {
                    const prices = priceMatches
                      .map(p => extractPriceInCents(p))
                      .filter(p => p > 0)
                      .sort((a, b) => b - a); // Ordena do maior para o menor
                    
                    if (prices.length >= 2) {
                      oldPriceCents = prices[0];      // Maior = preço DE
                      currentPriceCents = prices[1];  // Menor = preço PARA
                    } else if (prices.length === 1) {
                      currentPriceCents = prices[0];
                    }
                  } else if (priceMatches && priceMatches.length === 1) {
                    currentPriceCents = extractPriceInCents(priceMatches[0]);
                  }
                }
                
                // ═══════════════════════════════════════════════════════
                // 🏷️ CÁLCULO CORRETO DO DESCONTO
                // ═══════════════════════════════════════════════════════
                
                let discountVal = 0;
                
                // Tenta pegar desconto direto do HTML
                const discountMatches = cardText.match(/(\d+)%/g);
                if (discountMatches) {
                  const allDiscounts = discountMatches.map(m => parseInt(m));
                  discountVal = Math.max(...allDiscounts);
                }
                
                // Se não achou o desconto no HTML, calcula baseado nos preços
                if (discountVal === 0 && oldPriceCents > 0 && currentPriceCents > 0) {
                  discountVal = calculateDiscount(oldPriceCents, currentPriceCents);
                }
                
                // Se só tem preço atual e desconto, calcula o preço DE
                if (oldPriceCents === 0 && currentPriceCents > 0 && discountVal > 0) {
                  oldPriceCents = Math.round(currentPriceCents / (1 - discountVal / 100));
                }
                
                // ═══════════════════════════════════════════════════════
                // ✅ VALIDAÇÕES FINAIS
                // ═══════════════════════════════════════════════════════
                
                // Garante que preço DE é maior que preço PARA
                if (oldPriceCents > 0 && currentPriceCents > 0 && oldPriceCents < currentPriceCents) {
                  [oldPriceCents, currentPriceCents] = [currentPriceCents, oldPriceCents];
                }
                
                // Valida dados mínimos
                if (!currentPriceCents || currentPriceCents === 0) return;
                if (discountVal < minDisc) return;
                
                // Se não tem preço DE, usa o preço atual como base
                if (oldPriceCents === 0) {
                  oldPriceCents = currentPriceCents;
                }
                
                // Adiciona ID de afiliado no link
                let fullUrl = linkEl.href;
                if (!fullUrl.includes(affiliateId)) {
                  try {
                    const url = new URL(fullUrl);
                    url.pathname = `/${affiliateId}${url.pathname}`;
                    fullUrl = url.toString();
                  } catch (e) {}
                }
                
                const cleanLink = fullUrl.split('?')[0].split('#')[0];
                if (!cleanLink || cleanLink.length < 30) return;
                
                // 🎉 PRODUTO VÁLIDO - ADICIONA À LISTA
                results.push({
                  nome: productTitle,
                  imagem: imageUrl,
                  link_original: cleanLink,
                  preco_de: oldPriceCents.toString(),
                  preco_para: currentPriceCents.toString(),
                  desconto: discountVal.toString(), // SEM O % aqui
                  categoria: categoryNameForDB,
                  marketplace: 'MAGALU',
                  isActive: true
                });
                
              } catch (e) {
                // Erro silencioso no parse do card
              }
            });
            
            return results;
          }, { 
            minDisc: this.minDiscount, 
            affiliateId: this.affiliateId,
            categoryNameForDB: this.categoryNameForDB
          });

          console.log(`   ✅ Extraídos: ${productsFromPage.length} produtos\n`);

          // ═══════════════════════════════════════════════════════════
          // PROCESSA PRODUTOS (Sistema igual ao ML)
          // ═══════════════════════════════════════════════════════════
          
          let newProductsCount = 0;
          
          for (const product of productsFromPage) {
            if (allProducts.length >= this.limit) break;
            
            const dupCheck = this.checkDuplicate(product, allProducts);
            
            if (dupCheck.isDuplicate) {
              this.stats.duplicatesIgnored++;
              continue;
            }
            
            // Marca como visto
            this.seenLinks.add(product.link_original);
            const productKey = this.generateProductKey(product.nome);
            this.seenProductKeys.add(productKey);
            
            // Formata produto final
            const finalProduct = {
              ...product,
              preco: this.formatPrice(parseInt(product.preco_para)),
              preco_anterior: this.formatPrice(parseInt(product.preco_de)),
              desconto: `${product.desconto}%` // Adiciona % na exibição
            };
            
            if (dupCheck.isBetterOffer) {
              finalProduct._shouldUpdate = true;
              finalProduct._oldLink = dupCheck.oldLink;
              this.stats.betterOffersUpdated++;
            }
            
            allProducts.push(finalProduct);
            this.stats.productsCollected++;
            newProductsCount++;
            
            console.log(`   ✅ [${allProducts.length}/${this.limit}] ${finalProduct.nome.substring(0, 50)}...`);
          }

          if (newProductsCount === 0) {
            emptyPagesCount++;
            if (emptyPagesCount >= 2) {
              console.log(`   ⚠️  Sem novos produtos, encerrando\n`);
              break;
            }
          } else {
            emptyPagesCount = 0;
          }

          this.stats.pagesScraped = pageNum;
          pageNum++;
          
          await page.waitForTimeout(2500 + Math.random() * 2000);

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}:`, pageError.message);
          this.stats.errors++;
          pageNum++;
        }
      }

      await browser.close();

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║              🏁 FINALIZADO 🏁                      ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`📂 Subcategoria: ${this.categoryName}`);
      console.log(`💾 Salvo como: ${this.categoryNameForDB}`);
      console.log(`✨ Coletados: ${allProducts.length}/${this.limit}`);
      console.log(`   └─ Novos: ${allProducts.filter(p => !p._shouldUpdate).length}`);
      console.log(`   └─ Melhorados: ${this.stats.betterOffersUpdated}`);
      console.log(`⏭️  Ignorados: ${this.stats.duplicatesIgnored}`);
      console.log(`📄 Páginas: ${this.stats.pagesScraped}`);
      console.log(`⏱️  Tempo: ${duration}s\n`);

      return allProducts.slice(0, this.limit);

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      console.error(error.stack);
      await browser.close();
      return allProducts.slice(0, this.limit);
    }
  }
}

module.exports = MagaluScraper;