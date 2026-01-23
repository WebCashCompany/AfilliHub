/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - ENTERPRISE EDITION
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Sistema profissional de coleta de ofertas do Mercado Livre
 * Otimizado para alto volume e máxima precisão
 * COM STEALTH MODE - Anti-detecção avançada
 * FILTROS CORRIGIDOS - Desconto e Preço Máximo
 * 
 * @version 2.2.0 - CORREÇÃO: Filtros de desconto e preço máximo
 * @author Dashboard Promoforia
 * @license Proprietary
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const { getProductConnection, getProductModel } = require('../../database/mongodb');
const { getCategoria } = require('../../config/categorias-ml');

class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    // Configurações
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.maxPrice = options.maxPrice || null;
    this.categoriaKey = options.categoria || 'todas';
    
    // Estatísticas
    this.stats = {
      duplicatesIgnored: 0,
      betterOffersUpdated: 0,
      productsCollected: 0,
      pagesScraped: 0,
      errors: 0,
      filteredByDiscount: 0,
      filteredByPrice: 0
    };
    
    // Cache de produtos existentes
    this.existingProductsMap = new Map();
    
    // Configuração de categoria
    this.categoriaInfo = getCategoria(this.categoriaKey);
    if (!this.categoriaInfo) {
      console.warn(`⚠️  Categoria "${this.categoriaKey}" não encontrada, usando "todas"`);
      this.categoriaInfo = getCategoria('todas');
    }
    
    // Sessão do navegador
    this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    
    // Timeouts e configurações (OTIMIZADO PARA VELOCIDADE)
    this.config = {
      pageTimeout: 10000,          // 15s → 10s
      productTimeout: 8000,        // 10s → 8s
      scrollDelay: 80,             // 100ms → 80ms
      scrollIterations: 1,         // 2 → 1 (mais rápido)
      productPageDelay: 500,       // 800ms → 500ms
      backDelay: 200,              // 300ms → 200ms
      maxRetries: 2,
      maxPages: 50,
      maxEmptyPages: 2
    };
    
    // Cache de links processados (evita duplicatas)
    this.processedLinks = new Set();
  }

  /**
   * Limpa o cache de links processados
   * Útil quando iniciar nova categoria ou nova sessão
   */
  clearCache() {
    this.processedLinks.clear();
    console.log('🗑️  Cache de links processados limpo');
  }

  /**
   * Carrega produtos existentes do banco de dados para evitar duplicatas
   */
  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes do banco de dados...');
    
    try {
      const conn = getProductConnection();
      const Product = getProductModel('ML', conn);
      
      const products = await Product.find({})
        .select('link_afiliado nome desconto preco_para preco_de isActive marketplace categoria')
        .lean();
      
      console.log(`   📊 ${products.length} produtos encontrados no banco`);
      
      if (products.length > 0) {
        console.log(`   ├─ Ativos: ${products.filter(p => p.isActive).length}`);
        console.log(`   └─ Inativos: ${products.filter(p => !p.isActive).length}`);
      }
      
      let cached = 0;
      for (const product of products) {
        if (product.link_afiliado) {
          // Normaliza dados para comparação
          product.desconto = String(product.desconto || '0').replace(/\D/g, '');
          product.preco_para = String(product.preco_para || '0').replace(/\D/g, '');
          this.existingProductsMap.set(product.link_afiliado, product);
          cached++;
        }
      }
      
      console.log(`   ✅ ${cached} produtos carregados no cache\n`);
      
    } catch (error) {
      console.error('⚠️  Erro ao carregar produtos:', error.message);
    }
  }

  /**
   * Normaliza nome do produto para comparação de duplicatas
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
   * Compara se uma oferta é melhor que outra
   */
  isBetterOffer(newProduct, existingProduct) {
    const newDiscount = parseInt(newProduct.desconto) || 0;
    const existingDiscount = parseInt(existingProduct.desconto) || 0;
    
    const newPrice = parseInt(newProduct.preco_para) || 0;
    const existingPrice = parseInt(existingProduct.preco_para) || 0;

    // Prioriza maior desconto, depois menor preço
    if (newDiscount > existingDiscount) return true;
    if (newDiscount === existingDiscount && newPrice < existingPrice) return true;
    
    return false;
  }

  /**
   * Processa produto e decide se deve adicionar, atualizar ou ignorar
   */
  async processProduct(product, collectedProducts) {
    const normalizedName = this.normalizeProductName(product.nome);
    
    // Verifica duplicatas em memória (na sessão atual)
    const duplicateInMemory = collectedProducts.some(p => {
      const existingNormalized = this.normalizeProductName(p.nome);
      const nameMatch = existingNormalized.split(' ').slice(0, 5).join(' ') ===
                       normalizedName.split(' ').slice(0, 5).join(' ');
      return p.link_afiliado === product.link_afiliado || nameMatch;
    });

    if (duplicateInMemory) {
      this.stats.duplicatesIgnored++;
      return { action: 'skip', reason: 'duplicate_in_memory' };
    }

    // Verifica se existe no banco de dados
    const existingInDb = this.existingProductsMap.get(product.link_afiliado);
    
    if (!existingInDb) {
      // Verifica por nome similar
      for (const [link, existingProd] of this.existingProductsMap.entries()) {
        const existingNormalized = this.normalizeProductName(existingProd.nome);
        const nameMatch = existingNormalized.split(' ').slice(0, 5).join(' ') ===
                         normalizedName.split(' ').slice(0, 5).join(' ');
        
        if (nameMatch) {
          if (this.isBetterOffer(product, existingProd)) {
            this.stats.betterOffersUpdated++;
            return { action: 'update', reason: 'better_offer', oldLink: link };
          } else {
            this.stats.duplicatesIgnored++;
            return { action: 'skip', reason: 'worse_offer' };
          }
        }
      }
      
      // Produto novo
      return { action: 'add', reason: 'new_product' };
    }

    // Verifica se é uma oferta melhor do mesmo produto
    if (this.isBetterOffer(product, existingInDb)) {
      this.stats.betterOffersUpdated++;
      return { action: 'update', reason: 'better_offer', oldLink: product.link_afiliado };
    }

    this.stats.duplicatesIgnored++;
    return { action: 'skip', reason: 'worse_or_equal_offer' };
  }

  /**
   * Cria contexto do navegador com sessão persistente + STEALTH MODE
   */
  async createBrowserContext() {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    // Tenta usar sessão salva
    if (fs.existsSync(this.sessionPath)) {
      console.log('🔐 Usando sessão salva (autenticação preservada)\n');
      
      try {
        const context = await browser.newContext({
          storageState: this.sessionPath,
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        return { browser, context };
      } catch (error) {
        console.warn('⚠️  Erro ao carregar sessão:', error.message);
      }
    }

    console.log('⚠️  Criando nova sessão\n');
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    return { browser, context };
  }

  /**
   * Obtém link de afiliado usando Tab 4x + Enter
   */
  async getAffiliateLink(page) {
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await page.waitForTimeout(500);

        // Clica no botão Compartilhar
        const shareSelectors = [
          'button:has-text("Compartilhar")',
          'a:has-text("Compartilhar")'
        ];

        let clicked = false;
        for (const selector of shareSelectors) {
          try {
            await page.click(selector, { timeout: 5000 });
            clicked = true;
            await page.waitForTimeout(2000);
            break;
          } catch (e) {
            continue;
          }
        }

        if (!clicked) {
          if (attempt < maxAttempts) {
            console.log(`   ⚠️  Botão não encontrado, tentativa ${attempt}/${maxAttempts}`);
            await page.waitForTimeout(1000);
            continue;
          }
          return null;
        }

        // Concede permissão de clipboard
        const context = page.context();
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        // Tab 4x para chegar no campo do link
        for (let i = 0; i < 4; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(200);
        }

        // Enter para copiar
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);

        // Lê do clipboard
        const clipboardText = await page.evaluate(async () => {
          return await navigator.clipboard.readText();
        });

        // Fecha modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Valida link
        if (clipboardText && clipboardText.includes('mercadolivre.com/sec/')) {
          console.log(`   ✅ ${clipboardText}`);
          return clipboardText;
        }

        if (attempt < maxAttempts) {
          console.log(`   ⚠️  Link inválido, tentativa ${attempt}/${maxAttempts}`);
          await page.waitForTimeout(1000);
          continue;
        }

        console.log(`   ❌ Falhou após ${maxAttempts} tentativas`);
        return null;

      } catch (error) {
        if (attempt < maxAttempts) {
          console.log(`   ⚠️  Erro, retry ${attempt}/${maxAttempts}`);
          try { await page.keyboard.press('Escape'); } catch (e) {}
          await page.waitForTimeout(1000);
          continue;
        }
        
        console.log(`   ❌ Erro: ${error.message.substring(0, 40)}`);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Executa o scraping da categoria configurada
   */
  async scrapeCategory() {
    await this.loadExistingProducts();

    const { browser, context } = await this.createBrowserContext();
    const page = await context.newPage();
   
    let allProducts = [];
    let pageNum = 1;
    let emptyPagesCount = 0;

    try {
      // Cabeçalho
      console.log(`╔════════════════════════════════════════════════════╗`);
      if (this.categoriaInfo) {
        console.log(`║  ${this.categoriaInfo.emoji}  CATEGORIA: ${this.categoriaInfo.nome.padEnd(38)} ║`);
        console.log(`║  🔗 URL: ${this.categoriaInfo.url.substring(0, 43).padEnd(43)} ║`);
      }
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+ desconto)            ║`);
      if (this.maxPrice) {
        console.log(`║  💰 PREÇO MÁXIMO: R$ ${this.maxPrice.padEnd(33)} ║`);
      }
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      // Loop de páginas
      while (allProducts.length < this.limit && pageNum <= this.config.maxPages) {
        const offset = (pageNum - 1) * 48;
       
        // Monta URL com paginação
        let url;
        if (this.categoriaInfo && this.categoriaInfo.url) {
          const baseUrl = this.categoriaInfo.url;
          const separator = baseUrl.includes('?') ? '&' : '?';
          url = pageNum === 1 ? baseUrl : `${baseUrl}${separator}_Desde_${offset + 1}&_NoIndex_true`;
        } else {
          url = `https://www.mercadolivre.com.br/ofertas?page=${pageNum}`;
        }
       
        const progressBar = this.getProgressBar(allProducts.length, this.limit);
        console.log(`📄 Página ${pageNum.toString().padStart(2, '0')}/${this.config.maxPages} ${progressBar} [${allProducts.length}/${this.limit}] (${this.stats.duplicatesIgnored} ignorados)`);
       
        if (pageNum === 1) {
          console.log(`   🔗 ${url}\n`);
        }
       
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: this.config.pageTimeout });
          await page.waitForTimeout(2000);

          // Scroll para carregar produtos lazy-loaded
          await page.evaluate(async ({ iterations, delay }) => {
            for (let i = 0; i < iterations; i++) {
              window.scrollBy(0, 800);
              await new Promise(r => setTimeout(r, delay));
            }
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 500));
          }, { iterations: this.config.scrollIterations, delay: this.config.scrollDelay });

          await page.waitForTimeout(1000);

          // ═══════════════════════════════════════════════════════════
          // EXTRAÇÃO COM FILTROS APLICADOS
          // ═══════════════════════════════════════════════════════════
          const productData = await page.evaluate(({ minDiscount, maxPrice }) => {
            const cards = document.querySelectorAll('.poly-card, .ui-search-result, [class*="card"]');
            const products = [];
            let filteredByDiscount = 0;
            let filteredByPrice = 0;
            
            cards.forEach(card => {
              try {
                // Link do produto
                const linkElement = card.querySelector('a[href*="/MLB"]');
                if (!linkElement) return;
                
                const link = linkElement.href.split('?')[0].split('#')[0];
                if (!link.match(/MLB\d+/)) return;
                
                // Desconto - múltiplos seletores
                const discountSelectors = [
                  '.poly-price__disc_label',
                  '.poly-price__disc--pill',
                  '.ui-search-price__discount',
                  '[class*="discount"]',
                  '[class*="disc"]'
                ];
                
                let discountElement = null;
                for (const selector of discountSelectors) {
                  discountElement = card.querySelector(selector);
                  if (discountElement) break;
                }
                
                const discountText = discountElement?.innerText || '0';
                const discount = parseInt(discountText.replace(/\D/g, '')) || 0;
                
                // 🔥 FILTRO 1: Desconto mínimo
                if (discount < minDiscount) {
                  filteredByDiscount++;
                  return;
                }
                
                // Preço atual - múltiplos seletores
                const priceSelectors = [
                  '.poly-price__current .andes-money-amount__fraction',
                  '.andes-money-amount__fraction',
                  '.ui-search-price__second-line .andes-money-amount__fraction',
                  '[class*="price"] [class*="fraction"]'
                ];
                
                let priceElement = null;
                for (const selector of priceSelectors) {
                  const elements = card.querySelectorAll(selector);
                  if (elements.length > 0) {
                    priceElement = elements[0]; // Primeiro é sempre o preço atual
                    break;
                  }
                }
                
                const priceText = priceElement?.innerText || '0';
                // Remove pontos de milhar mas mantém o número
                const price = parseInt(priceText.replace(/\./g, '').replace(/,.*$/, '')) || 0;
                
                // 🔥 FILTRO 2: Preço máximo
                if (maxPrice && price > parseInt(maxPrice)) {
                  filteredByPrice++;
                  return;
                }
                
                products.push({
                  link: link,
                  discount: discount,
                  price: price
                });
              } catch (e) {
                // Ignora erros em cards individuais
              }
            });
            
            return {
              products: products,
              filteredByDiscount: filteredByDiscount,
              filteredByPrice: filteredByPrice,
              totalCards: cards.length
            };
          }, { minDiscount: this.minDiscount, maxPrice: this.maxPrice });

          const productLinks = productData.products.map(p => p.link);
          
          // 🔥 FILTRO CRÍTICO: Remove links já processados (evita loop infinito)
          const newProductLinks = productLinks.filter(link => !this.processedLinks.has(link));
          
          // Atualiza estatísticas
          this.stats.filteredByDiscount += productData.filteredByDiscount;
          this.stats.filteredByPrice += productData.filteredByPrice;

          console.log(`   📦 ${newProductLinks.length} produtos NOVOS passaram nos filtros`);
          console.log(`   ├─ Total de cards na página: ${productData.totalCards}`);
          console.log(`   ├─ Filtrados por desconto (<${this.minDiscount}%): ${productData.filteredByDiscount}`);
          if (this.maxPrice) {
            console.log(`   ├─ Filtrados por preço (>R$ ${this.maxPrice}): ${productData.filteredByPrice}`);
          }
          console.log(`   ├─ Já processados (duplicatas): ${productLinks.length - newProductLinks.length}`);
          console.log(`   └─ Novos aprovados: ${newProductLinks.length}`);
          
          // 🔍 DEBUG: Mostra alguns produtos para verificar preços
          if (productData.products.length > 0 && pageNum === 1) {
            console.log(`\n   🔍 DEBUG - Primeiros 3 produtos encontrados:`);
            for (let i = 0; i < Math.min(3, productData.products.length); i++) {
              const p = productData.products[i];
              console.log(`      ${i+1}. Desconto: ${p.discount}% | Preço: R$ ${p.price}`);
            }
          }
          console.log('');
          
          if (newProductLinks.length > 0) {
            const firstNew = productData.products.find(p => !this.processedLinks.has(p.link));
            if (firstNew) {
              console.log(`   🔗 Primeiro produto NOVO aprovado:`);
              console.log(`      Link: ${firstNew.link}`);
              console.log(`      Desconto: ${firstNew.discount}% | Preço: R$ ${firstNew.price}\n`);
            }
          }

          // Se não encontrou produtos NOVOS, incrementa contador de páginas vazias
          if (newProductLinks.length === 0) {
            emptyPagesCount++;
            if (emptyPagesCount >= this.config.maxEmptyPages) {
              console.log(`   ⚠️  ${this.config.maxEmptyPages} páginas sem produtos novos, encerrando busca\n`);
              break;
            }
            pageNum++;
            continue;
          } else {
            emptyPagesCount = 0;
          }

          // Processa cada produto NOVO
          for (const productLink of newProductLinks) {
            if (allProducts.length >= this.limit) {
              console.log(`   ✅ META ATINGIDA! ${allProducts.length}/${this.limit}\n`);
              break;
            }

            // Marca link como processado
            this.processedLinks.add(productLink);

            // Verifica se já processou (segurança extra)
            const alreadyProcessed = allProducts.some(p => p.link_original === productLink);
            if (alreadyProcessed) {
              continue;
            }

            let retries = 0;
            let success = false;

            while (retries < this.config.maxRetries && !success) {
              try {
                // Navega para página do produto
                await page.goto(productLink, {
                  waitUntil: 'domcontentloaded',
                  timeout: this.config.productTimeout
                });
                
                await page.waitForTimeout(this.config.productPageDelay);

                // Obtém link de afiliado
                const affiliateLink = await this.getAffiliateLink(page);

                if (!affiliateLink) {
                  console.log(`   ⏭️  Link de afiliado não obtido, pulando\n`);
                  break;
                }

                // Extrai dados do produto
                const productDataDetails = await page.evaluate(({ categoriaNome }) => {
                  const nome = document.querySelector('h1.ui-pdp-title')?.innerText ||
                              document.querySelector('.ui-pdp-title')?.innerText ||
                              'Produto sem título';

                  const imagem = document.querySelector('img.ui-pdp-image')?.src ||
                                document.querySelector('figure img')?.src ||
                                '';

                  // Badge de desconto
                  const descontoElement = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__discount') ||
                                         document.querySelector('.andes-money-amount__discount');
                  const descontoBadge = descontoElement?.innerText.replace(/[^\d]/g, '') || '0';
                  
                  // Preços
                  const allPriceElements = Array.from(document.querySelectorAll('.andes-money-amount__fraction'));
                  
                  let precoAtual = allPriceElements[0]?.innerText || '0';
                  let precoAntigo = precoAtual;
                  
                  if (allPriceElements.length > 1) {
                    precoAntigo = allPriceElements[1]?.innerText || precoAtual;
                  } else if (descontoBadge && parseInt(descontoBadge) > 0) {
                    const precoAtualNum = parseInt(precoAtual.replace(/\./g, ''));
                    const desconto = parseInt(descontoBadge);
                    const precoAntigoCalculado = Math.round(precoAtualNum / (1 - desconto / 100));
                    precoAntigo = String(precoAntigoCalculado);
                  }
                  
                  let precoAtualNum = parseInt(precoAtual.replace(/\./g, ''));
                  let precoAntigoNum = parseInt(precoAntigo.replace(/\./g, ''));
                  
                  // Garante preco_de >= preco_para
                  if (precoAntigoNum < precoAtualNum) {
                    const temp = precoAntigoNum;
                    precoAntigoNum = precoAtualNum;
                    precoAtualNum = temp;
                    
                    const tempStr = precoAntigo;
                    precoAntigo = precoAtual;
                    precoAtual = tempStr;
                  }
                  
                  // Calcula desconto
                  let descontoCalc = parseInt(descontoBadge) || 0;
                  
                  if (descontoCalc === 0 && precoAntigoNum > precoAtualNum && precoAntigoNum > 0) {
                    descontoCalc = Math.round(((precoAntigoNum - precoAtualNum) / precoAntigoNum) * 100);
                  }

                  return {
                    nome: nome.trim(),
                    imagem: imagem,
                    preco: `R$ ${precoAtual}`,
                    preco_anterior: `R$ ${precoAntigo}`,
                    preco_de: String(precoAntigoNum),
                    preco_para: String(precoAtualNum),
                    desconto: `${descontoCalc}%`,
                    categoria: categoriaNome,
                    marketplace: 'ML',
                    isActive: true
                  };
                }, { categoriaNome: this.categoriaInfo ? this.categoriaInfo.nome : 'Todas as Ofertas' });

                productDataDetails.link_afiliado = affiliateLink;
                productDataDetails.link_original = productLink;

                // Processa produto
                const result = await this.processProduct(productDataDetails, allProducts);
               
                if (result.action === 'add' || result.action === 'update') {
                  if (result.action === 'update') {
                    productDataDetails._shouldUpdate = true;
                    productDataDetails._oldLink = result.oldLink;
                  }
                 
                  allProducts.push(productDataDetails);
                  this.stats.productsCollected++;
                  console.log(`   ✨ [${allProducts.length}/${this.limit}] ${productDataDetails.nome.substring(0, 50)}...\n`);
                }

                // Volta para listagem (MAIS RÁPIDO)
                await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
                await page.waitForTimeout(this.config.backDelay);

                success = true;

              } catch (productError) {
                retries++;
                this.stats.errors++;
                console.error(`   ❌ Erro (tentativa ${retries}/${this.config.maxRetries}): ${productError.message.substring(0, 60)}`);
               
                if (retries < this.config.maxRetries) {
                  console.log(`   🔄 Tentando novamente...\n`);
                  await page.waitForTimeout(1500);
                } else {
                  console.log(`   ⏭️  Pulando após ${this.config.maxRetries} tentativas\n`);
                }

                // Tenta voltar para listagem
                if (!page.isClosed()) {
                  try {
                    await page.goBack({ timeout: 5000 });
                    await page.waitForTimeout(300);
                  } catch (e) {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    await page.waitForTimeout(500);
                  }
                }
              }
            }

            await page.waitForTimeout(150); // 200ms → 150ms
          }

          if (allProducts.length >= this.limit) break;

          this.stats.pagesScraped = pageNum;
          pageNum++;
          await page.waitForTimeout(300); // 500ms → 300ms

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}: ${pageError.message}`);
          this.stats.errors++;
          pageNum++;
          await page.waitForTimeout(800); // 1000ms → 800ms
        }
      }

      await browser.close();

      const finalProducts = allProducts.slice(0, this.limit);
     
      // Relatório final
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║           🏁 SCRAPING FINALIZADO 🏁              ║`);
      console.log(`╚════════════════════════════════════════════════════╝`);
      console.log(`✨ Produtos coletados: ${finalProducts.length}/${this.limit}`);
      console.log(`   ├─ Novos: ${finalProducts.filter(p => !p._shouldUpdate).length}`);
      console.log(`   └─ Ofertas melhoradas: ${this.stats.betterOffersUpdated}`);
      console.log(`⏭️  Ignorados (duplicatas): ${this.stats.duplicatesIgnored}`);
      console.log(`🔥 Filtrados por desconto: ${this.stats.filteredByDiscount}`);
      if (this.maxPrice) {
        console.log(`💰 Filtrados por preço: ${this.stats.filteredByPrice}`);
      }
      console.log(`📄 Páginas processadas: ${this.stats.pagesScraped}`);
      console.log(`❌ Erros tratados: ${this.stats.errors}`);
      console.log('╚════════════════════════════════════════════════════╝\n');

      return finalProducts;

    } catch (error) {
      console.error('❌ Erro crítico no scraping:', error.message);
      console.error(error.stack);
      
      try {
        await browser.close();
      } catch (e) {}
      
      return allProducts.slice(0, this.limit);
    }
  }

  /**
   * Gera barra de progresso visual
   */
  getProgressBar(current, total) {
    const percentage = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
   
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`;
  }
}

module.exports = MercadoLivreScraper;