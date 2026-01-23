/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - ENTERPRISE EDITION
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Sistema profissional de coleta de ofertas do Mercado Livre
 * Otimizado para alto volume e máxima precisão
 * 
 * @version 2.0.0
 * @author Dashboard Promoforia
 * @license Proprietary
 */

const { chromium } = require('playwright');
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
      errors: 0
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
      pageTimeout: 15000,          // 30s → 15s
      productTimeout: 10000,       // 20s → 10s
      scrollDelay: 100,            // 150ms → 100ms
      scrollIterations: 2,         // 3 → 2
      productPageDelay: 800,       // Delay ao entrar na página do produto
      backDelay: 300,              // Delay ao voltar
      maxRetries: 2,               // 3 → 2
      maxPages: 50,
      maxEmptyPages: 2             // 3 → 2
    };
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
   * Cria contexto do navegador com sessão persistente
   */
  async createBrowserContext() {
    const browser = await chromium.launch({
      headless: false, // PRECISA SER FALSE para modal funcionar
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
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
   * Este método FUNCIONA - pega o link correto do modal
   */
  async getAffiliateLink(page) {
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
          await page.click(selector, { timeout: 3000 });
          clicked = true;
          await page.waitForTimeout(1500);
          break;
        } catch (e) {
          continue;
        }
      }

      if (!clicked) {
        console.log(`   ⚠️  Botão Compartilhar não encontrado`);
        return null;
      }

      // Concede permissão de clipboard
      const context = page.context();
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // Tab 4x para chegar no campo do link
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(150);
      }

      // Enter para copiar
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);

      // Lê do clipboard
      const clipboardText = await page.evaluate(async () => {
        return await navigator.clipboard.readText();
      });

      // Fecha modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      if (clipboardText && clipboardText.includes('mercadolivre.com/sec/')) {
        console.log(`   ✅ ${clipboardText}`);
        return clipboardText;
      }

      console.log(`   ❌ Link inválido: ${clipboardText}`);
      return null;

    } catch (error) {
      console.log(`   ❌ Erro: ${error.message.substring(0, 50)}`);
      try { await page.keyboard.press('Escape'); } catch (e) {}
      return null;
    }
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
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.config.pageTimeout });
          await page.waitForTimeout(800);

          // Scroll para carregar produtos lazy-loaded
          await page.evaluate(async ({ iterations, delay }) => {
            for (let i = 0; i < iterations; i++) {
              window.scrollBy(0, 800);
              await new Promise(r => setTimeout(r, delay));
            }
          }, { iterations: this.config.scrollIterations, delay: this.config.scrollDelay });

          await page.waitForTimeout(400);

          // Extrai links de produtos com desconto
          const productLinks = await page.evaluate(({ minDisc, maxPriceLimit }) => {
            const items = document.querySelectorAll('.poly-card, .promotion-item__container, .ui-search-result, [class*="promotion-item"]');
            const results = [];

            items.forEach(item => {
              try {
                // Verifica desconto
                const discEl = item.querySelector('.poly-discount-badge, .andes-money-amount__discount, .promotion-item__discount-text, [class*="discount"]');
                const discountText = discEl ? discEl.innerText : '';
                const discountVal = parseInt(discountText.replace(/[^\d]/g, '')) || 0;

                if (discountVal >= minDisc) {
                  // Verifica preço se houver filtro
                  if (maxPriceLimit) {
                    const priceElements = item.querySelectorAll('.andes-money-amount__fraction');
                    if (priceElements.length >= 1) {
                      const currentPrice = priceElements[0].innerText.replace(/\./g, '');
                      const productPrice = parseInt(currentPrice);
                      
                      if (productPrice > parseInt(maxPriceLimit)) {
                        return;
                      }
                    }
                  }

                  // Extrai link
                  const linkEl = item.querySelector('a');
                  if (linkEl && linkEl.href) {
                    const cleanLink = linkEl.href.split('?')[0].split('#')[0];
                    
                    if (cleanLink && cleanLink.length > 20 && cleanLink.startsWith('http')) {
                      results.push(cleanLink);
                    }
                  }
                }
              } catch (e) {
                // Ignora erros individuais
              }
            });
           
            return results;
          }, { minDisc: this.minDiscount, maxPriceLimit: this.maxPrice });

          console.log(`   📦 ${productLinks.length} produtos encontrados\n`);

          // Se não encontrou produtos, incrementa contador de páginas vazias
          if (productLinks.length === 0) {
            emptyPagesCount++;
            if (emptyPagesCount >= this.config.maxEmptyPages) {
              console.log(`   ⚠️  ${this.config.maxEmptyPages} páginas vazias consecutivas, encerrando busca\n`);
              break;
            }
            pageNum++;
            continue;
          } else {
            emptyPagesCount = 0;
          }

          // Processa cada produto
          for (const productLink of productLinks) {
            if (allProducts.length >= this.limit) {
              console.log(`   ✅ META ATINGIDA! ${allProducts.length}/${this.limit}\n`);
              break;
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

                // Obtém link de afiliado (RÁPIDO - extração direta)
                const affiliateLink = await this.getAffiliateLink(page);

                if (!affiliateLink) {
                  console.log(`   ⏭️  Link não obtido, pulando\n`);
                  break;
                }

                // Extrai dados do produto
                const productData = await page.evaluate((categoriaNome) => {
                  const nome = document.querySelector('h1.ui-pdp-title')?.innerText ||
                              document.querySelector('.ui-pdp-title')?.innerText ||
                              'Produto sem título';

                  const imagem = document.querySelector('img.ui-pdp-image')?.src ||
                                document.querySelector('figure img')?.src ||
                                '';

                  const precoAtual = document.querySelector('.andes-money-amount__fraction')?.innerText || '0';
                  const precoAntigo = document.querySelectorAll('.andes-money-amount__fraction')[1]?.innerText || precoAtual;

                  const precoAtualNum = parseInt(precoAtual.replace(/\D/g, ''));
                  const precoAntigoNum = parseInt(precoAntigo.replace(/\D/g, ''));
                  const descontoCalc = precoAntigoNum > 0 ?
                    Math.round(((precoAntigoNum - precoAtualNum) / precoAntigoNum) * 100) : 0;

                  return {
                    nome: nome.trim(),
                    imagem: imagem,
                    preco: `R$ ${precoAtual}`,
                    preco_anterior: `R$ ${precoAntigo}`,
                    preco_de: precoAntigo.replace(/\D/g, ''),
                    preco_para: precoAtual.replace(/\D/g, ''),
                    desconto: `${descontoCalc}%`,
                    categoria: categoriaNome,
                    marketplace: 'ML',
                    isActive: true
                  };
                }, this.categoriaInfo ? this.categoriaInfo.nome : 'Todas as Ofertas');

                // Define links (sem modificação)
                productData.link_afiliado = affiliateLink;
                productData.link_original = affiliateLink;

                // Processa produto
                const result = await this.processProduct(productData, allProducts);
               
                if (result.action === 'add' || result.action === 'update') {
                  if (result.action === 'update') {
                    productData._shouldUpdate = true;
                    productData._oldLink = result.oldLink;
                  }
                 
                  allProducts.push(productData);
                  this.stats.productsCollected++;
                  console.log(`   ✨ [${allProducts.length}/${this.limit}] ${productData.nome.substring(0, 50)}...\n`);
                }

                // Volta para listagem (RÁPIDO)
                await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
                await page.waitForTimeout(this.config.backDelay);

                success = true;

              } catch (productError) {
                retries++;
                this.stats.errors++;
                console.error(`   ❌ Erro (tentativa ${retries}/${this.config.maxRetries}): ${productError.message.substring(0, 60)}`);
               
                if (retries < this.config.maxRetries) {
                  console.log(`   🔄 Tentando novamente...\n`);
                  await page.waitForTimeout(2000);
                } else {
                  console.log(`   ⏭️  Pulando após ${this.config.maxRetries} tentativas\n`);
                }

                // Tenta voltar para listagem
                if (!page.isClosed()) {
                  try {
                    await page.goBack({ timeout: 5000 });
                    await page.waitForTimeout(500);
                  } catch (e) {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    await page.waitForTimeout(800);
                  }
                }
              }
            }

            await page.waitForTimeout(200); // 500ms → 200ms
          }

          if (allProducts.length >= this.limit) break;

          this.stats.pagesScraped = pageNum;
          pageNum++;
          await page.waitForTimeout(500);

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}: ${pageError.message}`);
          this.stats.errors++;
          pageNum++;
          await page.waitForTimeout(1000);
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
      console.log(`📄 Páginas processadas: ${this.stats.pagesScraped}`);
      console.log(`❌ Erros tratados: ${this.stats.errors}`);
      
      if (this.maxPrice) {
        console.log(`💰 Filtro de preço: Máximo R$ ${this.maxPrice}`);
      }
     
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