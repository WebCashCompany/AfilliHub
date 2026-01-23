/**
 * ═══════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - VERSÃO FINAL CORRIGIDA
 * ═══════════════════════════════════════════════════════════
 *
 * ✅ Tab 4x + Enter para copiar link
 * ✅ Link direto sem alterações
 * ✅ Imports CORRETOS para estrutura real do projeto
 * ✅ Marketplace code fixado (ML)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { getProductConnection, getProductModel } = require('../../database/mongodb');
const { getCategoria } = require('../../config/categorias-ml');

class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    this.existingProductsMap = new Map();
   
    this.categoriaKey = options.categoria || 'todas';
    this.categoriaInfo = getCategoria(this.categoriaKey);
    this.maxPrice = options.maxPrice || null;
   
    if (!this.categoriaInfo) {
      console.log(`⚠️  Categoria "${this.categoriaKey}" não encontrada, usando "todas"`);
      this.categoriaInfo = getCategoria('todas');
    }
   
    this.sessionPath = path.join(process.cwd(), 'ml-session.json');
  }

  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes do banco...');
   
    try {
      const conn = getProductConnection();
      const Product = getProductModel('ML', conn);
     
      const products = await Product.find({}).select('link_afiliado nome desconto preco_para preco_de isActive marketplace categoria').lean();
     
      console.log(`   📊 Produtos do Mercado Livre encontrados: ${products.length}`);
     
      if (products.length > 0) {
        console.log(`   ├─ Ativos: ${products.filter(p => p.isActive).length}`);
        console.log(`   └─ Inativos: ${products.filter(p => !p.isActive).length}`);
      }
     
      let added = 0;
      products.forEach(p => {
        if (p.link_afiliado) {
          p.desconto = String(p.desconto || '0').replace(/\D/g, '');
          p.preco_para = String(p.preco_para || '0').replace(/\D/g, '');
          this.existingProductsMap.set(p.link_afiliado, p);
          added++;
        }
      });
     
      console.log(`   ✅ ${added} produtos carregados no cache\n`);
    } catch (error) {
      console.error('⚠️  Erro ao carregar produtos do banco:', error.message);
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
      return p.link_afiliado === product.link_afiliado ||
             existingNormalized.split(' ').slice(0, 5).join(' ') ===
             normalizedName.split(' ').slice(0, 5).join(' ');
    });

    if (duplicateInMemory) {
      return { action: 'skip', reason: 'duplicate_in_memory' };
    }

    const existingInDb = this.existingProductsMap.get(product.link_afiliado);
   
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
        oldLink: product.link_afiliado
      };
    }

    return { action: 'skip', reason: 'worse_or_equal_offer' };
  }

  async createBrowserContext() {
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    if (fs.existsSync(this.sessionPath)) {
      console.log('🔐 Usando sessão salva (já autenticado)...\n');
     
      try {
        const context = await browser.newContext({
          storageState: this.sessionPath,
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
       
        return { browser, context };
      } catch (error) {
        console.warn('⚠️  Erro ao carregar sessão salva:', error.message);
      }
    }

    console.log('⚠️  Sessão não encontrada\n');
   
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    return { browser, context };
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * 🎯 PEGA LINK DE AFILIADO - MÉTODO SIMPLIFICADO
   * Tab 4x + Enter = Copia o link EXATO (SEM MODIFICAÇÕES)
   * ═══════════════════════════════════════════════════════════
   */
  async getAffiliateLink(page) {
    try {
      // Aguarda página carregar
      await page.waitForTimeout(1500);

      // Scroll até o topo
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);

      // Procura e clica no botão Compartilhar
      const shareSelectors = [
        'button:has-text("Compartilhar")',
        'a:has-text("Compartilhar")',
        'button[class*="share"]',
        '[aria-label*="Compartilhar"]',
        'div:has-text("Compartilhar")'
      ];

      let clicked = false;
      for (const selector of shareSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              await element.click();
              clicked = true;
              console.log(`   ✅ Botão Compartilhar clicado`);
              await page.waitForTimeout(2000);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (!clicked) {
        console.log(`   ⚠️  Botão Compartilhar não encontrado`);
        return null;
      }

      // ═══════════════════════════════════════════════════════════
      // 🎯 MÉTODO SIMPLIFICADO: Tab 4x + Enter
      // RETORNA O LINK EXATAMENTE COMO ESTÁ NO CLIPBOARD
      // ═══════════════════════════════════════════════════════════

      // Concede permissão de clipboard
      const context = page.context();
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // Tab 4x
      console.log(`   ⌨️  Pressionando Tab 4x...`);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);
      }

      // Enter 1x
      console.log(`   ⌨️  Pressionando Enter...`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Lê do clipboard
      const clipboardText = await page.evaluate(() => {
        return navigator.clipboard.readText();
      });

      // Fecha o modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      if (clipboardText && clipboardText.includes('mercadolivre.com')) {
        console.log(`   ✅ Link copiado (SEM MODIFICAÇÕES): ${clipboardText.substring(0, 80)}...`);
        // ═══════════════════════════════════════════════════════════
        // 🔗 RETORNA O LINK EXATAMENTE COMO ESTÁ
        // NÃO ALTERA, NÃO ADICIONA, NÃO REMOVE NADA
        // ═══════════════════════════════════════════════════════════
        return clipboardText;
      }

      console.log(`   ⚠️  Link não encontrado no clipboard`);
      return null;

    } catch (error) {
      console.log(`   ❌ Erro: ${error.message.substring(0, 80)}`);
     
      try {
        await page.keyboard.press('Escape');
      } catch (e) {}
     
      return null;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * 🚀 SCRAPING COM LINK DIRETO (SEM ALTERAÇÕES)
   * ═══════════════════════════════════════════════════════════
   */
  async scrapeCategory() {
    await this.loadExistingProducts();

    const { browser, context } = await this.createBrowserContext();
    const page = await context.newPage();
   
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 50;
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    let emptyPagesCount = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      if (this.categoriaInfo) {
        console.log(`║  ${this.categoriaInfo.emoji}  CATEGORIA: ${this.categoriaInfo.nome.padEnd(38)} ║`);
        console.log(`║  🔗 URL: ${this.categoriaInfo.url.substring(0, 43).padEnd(43)} ║`);
      }
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+ desconto)            ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const offset = (pageNum - 1) * 48;
       
        let url;
        if (this.categoriaInfo && this.categoriaInfo.url) {
          const baseUrl = this.categoriaInfo.url;
          const separator = baseUrl.includes('?') ? '&' : '?';
         
          if (pageNum === 1) {
            url = baseUrl;
          } else {
            url = `${baseUrl}${separator}_Desde_${offset + 1}&_NoIndex_true`;
          }
        } else {
          url = `https://www.mercadolivre.com.br/ofertas?page=${pageNum}`;
        }
       
        const progressBar = this.getProgressBar(allProducts.length, this.limit);
        console.log(`📄 Pág ${pageNum.toString().padStart(2, '0')}/${maxPages} ${progressBar} [${allProducts.length}/${this.limit}] (${this.duplicatesIgnored} ignorados)`);
       
        if (pageNum === 1) {
          console.log(`   🔗 URL: ${url}\n`);
        }
       
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(800);

          // Scroll para carregar produtos
          await page.evaluate(async () => {
            for (let i = 0; i < 3; i++) {
              window.scrollBy(0, 800);
              await new Promise(r => setTimeout(r, 150));
            }
          });

          await page.waitForTimeout(400);

          // Captura produtos com desconto
          const productLinks = await page.evaluate(({ minDisc, maxPriceLimit }) => {
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
                  const linkEl = item.querySelector('a');
                  const priceElements = item.querySelectorAll('.andes-money-amount__fraction');
                  let currentPrice = '0';
                 
                  if (priceElements.length >= 1) {
                    currentPrice = priceElements[0].innerText.replace(/\./g, '');
                  }

                  if (maxPriceLimit) {
                    const maxPrice = parseInt(maxPriceLimit);
                    const productPrice = parseInt(currentPrice);
                   
                    if (productPrice > maxPrice) {
                      return;
                    }
                  }

                  if (linkEl && linkEl.href) {
                    const cleanLink = linkEl.href.split('?')[0].split('#')[0];
                   
                    if (cleanLink && cleanLink.length > 20 && cleanLink.startsWith('http')) {
                      results.push(cleanLink);
                    }
                  }
                }
              } catch (e) {
                // Silencioso
              }
            });
           
            return results;
          }, {
            minDisc: this.minDiscount,
            maxPriceLimit: this.maxPrice
          });

          console.log(`   📦 ${productLinks.length} produtos com ${this.minDiscount}%+ desconto encontrados\n`);

          // ═══════════════════════════════════════════════════════
          // 🚀 PROCESSA PRODUTOS
          // ═══════════════════════════════════════════════════════
         
          for (const productLink of productLinks) {
            if (allProducts.length >= this.limit) {
              console.log(`   ✅ META ATINGIDA! ${allProducts.length}/${this.limit}\n`);
              break;
            }

            try {
              // Vai para página do produto
              await page.goto(productLink, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
              });
             
              await page.waitForTimeout(1500);

              // ═══════════════════════════════════════════════════════
              // 🎯 PEGA O LINK DE AFILIADO (SEM MODIFICAÇÕES)
              // ═══════════════════════════════════════════════════════
              const affiliateLink = await this.getAffiliateLink(page);

              if (!affiliateLink) {
                console.log(`   ⏭️  Pulando produto (link não encontrado)\n`);
                try {
                  await page.goBack({ timeout: 5000 });
                  await page.waitForTimeout(500);
                } catch (e) {
                  await page.goto(url, { waitUntil: 'domcontentloaded' });
                  await page.waitForTimeout(800);
                }
                continue;
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

              // ═══════════════════════════════════════════════════════
              // 🔗 USA O LINK DIRETO (SEM NENHUMA MODIFICAÇÃO)
              // O link retornado do getAffiliateLink() já é o link final
              // NÃO adiciona parâmetros, NÃO altera nada
              // ═══════════════════════════════════════════════════════
              productData.link_afiliado = affiliateLink;
              productData.link_original = affiliateLink;

              // Processa e adiciona
              const result = await this.processProduct(productData, allProducts);
             
              if (result.action === 'add' || result.action === 'update') {
                if (result.action === 'update') {
                  productData._shouldUpdate = true;
                  productData._oldLink = result.oldLink;
                  this.betterOffersUpdated++;
                }
               
                allProducts.push(productData);
                console.log(`   ✨ [${allProducts.length}/${this.limit}] ${productData.nome.substring(0, 50)}...\n`);
              } else {
                this.duplicatesIgnored++;
              }

              // Volta para listagem
              await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
              await page.waitForTimeout(500);

            } catch (productError) {
              console.error(`   ❌ Erro ao processar:`, productError.message.substring(0, 80));
             
              if (!page.isClosed()) {
                try {
                  await page.goBack({ timeout: 5000 });
                  await page.waitForTimeout(500);
                } catch (e) {
                  try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    await page.waitForTimeout(800);
                  } catch (reloadError) {
                    console.error(`   ❌ Erro ao recarregar listagem, continuando...`);
                  }
                }
              } else {
                console.error(`   ❌ Página foi fechada, encerrando coleta desta página`);
                break;
              }
            }

            await page.waitForTimeout(500);
          }

          if (productLinks.length === 0) {
            emptyPagesCount++;
           
            if (emptyPagesCount >= 3) {
              console.log(`   ⚠️  3 páginas vazias consecutivas, encerrando.\n`);
              break;
            }
          } else {
            emptyPagesCount = 0;
          }

          if (allProducts.length >= this.limit) break;

          pageNum++;
          await page.waitForTimeout(500);

        } catch (pageError) {
          console.error(`   ❌ Erro na página ${pageNum}:`, pageError.message);
          pageNum++;
          await page.waitForTimeout(1000);
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
      console.log(`⏭️  Ignorados: ${this.duplicatesIgnored}`);
      console.log(`📄 Páginas percorridas: ${pageNum - 1}`);
     
      if (this.maxPrice) {
        console.log(`💰 Filtro de preço: Máximo R$ ${this.maxPrice}`);
      }
     
      console.log('╚════════════════════════════════════════════════════╝\n');

      return finalProducts;

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
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

module.exports = MercadoLivreScraper;