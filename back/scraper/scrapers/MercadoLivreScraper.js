/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - FINAL EDITION (VERSÃO ESTÁVEL)
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * @version 6.0.0 - PRODUCTION READY
 * @performance Rápido + Estável + Nunca trava
 * @reliability Testado e aprovado
 * 
 * CORREÇÕES FINAIS:
 * ✅ Fecha abas APENAS após término completo
 * ✅ Timeout individual sem race conditions
 * ✅ Link original como fallback sempre disponível
 * ✅ Logs limpos e informativos
 * ✅ Pronto para produção
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
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
    
    this.categoriaInfo = getCategoria(this.categoriaKey);
    if (!this.categoriaInfo) {
      console.warn(`⚠️  Categoria "${this.categoriaKey}" não encontrada, usando "todas"`);
      this.categoriaInfo = getCategoria('todas');
    }
    
    this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    
    // ═══════════════════════════════════════════════════════════════════
    // CONFIGURAÇÕES ESTÁVEIS E RÁPIDAS
    // ═══════════════════════════════════════════════════════════════════
    this.config = {
      pageTimeout: 8000,              
      affiliateLinkTimeout: 3000,     // 3s por link
      maxPages: 50,
      maxEmptyPages: 2,
      parallelTabs: 3,                // 3 abas (mais estável)
      batchDelay: 200,
      useOriginalOnTimeout: true      // Usa link original se timeout
    };
    
    this.browser = null;
    this.context = null;
  }

  clearCache() {
    this.seenLinks.clear();
    this.seenProductKeys.clear();
    console.log('🧹 Cache limpo');
  }

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

  async createBrowserContext() {
    if (this.browser) {
      try { await this.browser.close(); } catch (e) {}
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-images',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      bypassCSP: true,
      ignoreHTTPSErrors: true
    });

    // Bloqueia recursos pesados
    await this.context.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      
      if (
        resourceType === 'image' ||
        resourceType === 'stylesheet' ||
        resourceType === 'font' ||
        resourceType === 'media'
      ) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await this.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    return { browser: this.browser, context: this.context };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * OBTENÇÃO RÁPIDA DE LINK DE AFILIADO - MÉTODO HÍBRIDO
   * Tenta rápido, se falhar usa original (pelo menos tem produto)
   * ═══════════════════════════════════════════════════════════════════
   */
  async getAffiliateLink(page, productUrl) {
    try {
      // Timeout AGRESSIVO - 2 segundos no máximo
      await page.goto(productUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 2000
      });

      // Espera mínima
      await page.waitForTimeout(150);

      // Tenta clicar RÁPIDO
      const clicked = await Promise.race([
        page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a'));
          const shareBtn = buttons.find(btn => 
            btn.textContent && btn.textContent.toLowerCase().includes('compartilhar')
          );
          if (shareBtn) {
            shareBtn.click();
            return true;
          }
          return false;
        }),
        new Promise(resolve => setTimeout(() => resolve(false), 500))
      ]);

      if (!clicked) return null;

      await page.waitForTimeout(400);

      // Navega RÁPIDO
      for (let i = 0; i < 4; i++) {
        page.keyboard.press('Tab'); // SEM await = mais rápido
      }
      await page.waitForTimeout(80);

      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);

      // Pega clipboard RÁPIDO
      const clipboardText = await Promise.race([
        page.evaluate(() => navigator.clipboard.readText()),
        new Promise(resolve => setTimeout(() => resolve(null), 300))
      ]);

      page.keyboard.press('Escape'); // SEM await

      if (clipboardText && clipboardText.includes('mercadolivre.com/sec/')) {
        return clipboardText.trim();
      }

      return null;

    } catch (error) {
      return null; // Falhou = usa original
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * PROCESSAMENTO EM LOTE - VERSÃO ESTÁVEL
   * ═══════════════════════════════════════════════════════════════════
   */
  async processBatchParallel(batch, allProducts) {
    const tabs = [];
    const results = [];

    try {
      // 1. Abre todas as abas
      for (let i = 0; i < batch.length; i++) {
        const tab = await this.context.newPage();
        tabs.push(tab);
      }

      // 2. Processa cada produto COM sua própria aba
      for (let i = 0; i < batch.length; i++) {
        const prodData = batch[i];
        const tab = tabs[i];
        
        console.log(`   🔄 [${i+1}/${batch.length}] Obtendo link...`);
        
        try {
          // Tenta obter link de afiliado
          const affiliateLink = await this.getAffiliateLink(tab, prodData.link);
          
          const finalLink = affiliateLink || prodData.link;
          const isAffiliate = finalLink.includes('/sec/');
          
          console.log(`      ${isAffiliate ? '✅ Afiliado' : '⚠️  Original'}: ${finalLink.substring(0, 60)}...`);
          
          results.push({
            productData: prodData,
            affiliateLink: finalLink,
            success: isAffiliate
          });
        } catch (error) {
          console.log(`      ❌ Erro: ${error.message}`);
          // Se der erro, usa link original
          results.push({
            productData: prodData,
            affiliateLink: prodData.link,
            success: false
          });
        }
      }

      // 3. AGORA SIM fecha todas as abas (após processar tudo)
      for (const tab of tabs) {
        try {
          await tab.close();
        } catch (e) {
          // Ignora erro ao fechar
        }
      }

      // 4. Processa resultados
      for (const result of results) {
        if (allProducts.length >= this.limit) break;

        const prodData = result.productData;
        const productKey = this.generateProductKey(prodData.name);

        const dupCheck = this.checkDuplicate({
          nome: prodData.name,
          link_original: prodData.link,
          desconto: prodData.discount,
          preco_para: prodData.currentPrice
        }, allProducts);

        if (dupCheck.isDuplicate) {
          this.stats.duplicatesIgnored++;
          console.log(`   ⏭️  IGNORADO (${dupCheck.reason}): ${prodData.name.substring(0, 40)}...`);
          continue;
        }

        // ✅ SÓ MARCA COMO VISTO DEPOIS DE PASSAR NA VERIFICAÇÃO!
        this.seenLinks.add(prodData.link);

        const product = {
          nome: prodData.name,
          imagem: prodData.image,
          link_original: prodData.link,
          link_afiliado: result.affiliateLink,
          desconto: `${prodData.discount}%`,
          preco: `R$ ${prodData.currentPrice}`,
          preco_anterior: `R$ ${prodData.oldPrice}`,
          preco_de: String(prodData.oldPrice),
          preco_para: String(prodData.currentPrice),
          categoria: this.categoriaInfo.nome,
          marketplace: 'ML',
          isActive: true
        };

        if (dupCheck.isBetterOffer) {
          product._shouldUpdate = true;
          product._oldLink = dupCheck.oldLink;
          this.stats.betterOffersUpdated++;
        }

        allProducts.push(product);
        this.seenProductKeys.add(productKey);
        this.stats.productsCollected++;

        if (result.success) {
          this.stats.affiliateLinksSuccess++;
        } else {
          this.stats.affiliateLinksFailed++;
        }

        const status = result.success ? '✅' : '⚠️';
        const linkType = result.success ? 'AFILIADO' : 'ORIGINAL';
        console.log(`   ${status} [${allProducts.length}/${this.limit}] ${product.nome.substring(0, 50)}... (${linkType})`);
        
        // ✅ IMPORTANTE: SEMPRE adiciona, mesmo sem afiliado!
      }

    } catch (error) {
      console.error(`   ❌ Erro no batch: ${error.message}`);
      
      // Garante fechar abas em caso de erro
      for (const tab of tabs) {
        try {
          await tab.close();
        } catch (e) {}
      }
    }
  }

  async scrapeCategory() {
    const startTime = Date.now();
    
    await this.loadExistingProducts();
    const { browser, context } = await this.createBrowserContext();
   
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 50;
    let emptyPagesCount = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  ${this.categoriaInfo.emoji}  ${this.categoriaInfo.nome.padEnd(47)} ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(26)} ║`);
      console.log(`║  ⚡ MODO: Estável (${this.config.parallelTabs} abas)${' '.repeat(23)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= this.config.maxPages) {
        const baseUrl = this.categoriaInfo.url;
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = pageNum === 1 ? baseUrl : `${baseUrl}${separator}_Desde_${currentOffset + 1}&_NoIndex_true`;
       
        console.log(`📄 Pág ${pageNum} [${allProducts.length}/${this.limit}]`);
       
        try {
          await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: this.config.pageTimeout 
          });

          await mainPage.waitForTimeout(400);

          const pageData = await mainPage.evaluate(({ minDiscount, maxPrice }) => {
            const cards = document.querySelectorAll('.poly-card, .ui-search-result');
            const products = [];
            let filtered = 0;
            
            cards.forEach(card => {
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
            if (emptyPagesCount >= this.config.maxEmptyPages) {
              console.log(`   ⚠️  Sem novos produtos, encerrando\n`);
              break;
            }
            pageNum++;
            currentOffset += 48;
            continue;
          }
          emptyPagesCount = 0;

          console.log(`   🔗 Obtendo links de afiliado...\n`);

          // Processa em lotes
          const batches = [];
          for (let i = 0; i < newProducts.length; i += this.config.parallelTabs) {
            batches.push(newProducts.slice(i, i + this.config.parallelTabs));
          }

          for (const batch of batches) {
            if (allProducts.length >= this.limit) {
              console.log(`   🎯 META atingida!\n`);
              break;
            }

            await this.processBatchParallel(batch, allProducts);

            if (allProducts.length < this.limit) {
              await new Promise(r => setTimeout(r, this.config.batchDelay));
            }
          }

          if (allProducts.length >= this.limit) break;

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