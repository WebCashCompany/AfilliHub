const { chromium } = require('playwright');
const Product = require('../../database/models/Product');

class MercadoLivreScraper {
  constructor(minDiscount = 30) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;
    this.existingProductsMap = new Map();
  }

  /**
   * Carrega produtos existentes do MongoDB
   */
  async loadExistingProducts() {
    console.log('🔍 Carregando produtos existentes do banco...');
    
    try {
      const products = await Product.find({ 
        marketplace: { $in: ['ML', 'ml', 'Mercado Livre', 'mercadolivre', 'MercadoLivre'] }
      }).select('link_original nome desconto preco_para preco_de isActive marketplace').lean();
      
      console.log(`   📊 Produtos do Mercado Livre encontrados: ${products.length}`);
      
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
      
      // Cria Map para busca O(1) por link_original
      let added = 0;
      products.forEach(p => {
        if (p.link_original) {
          // Garante que desconto e preço sejam números
          p.desconto = String(p.desconto || '0').replace(/\D/g, '');
          p.preco_para = String(p.preco_para || '0').replace(/\D/g, '');
          this.existingProductsMap.set(p.link_original, p);
          added++;
        }
      });
      
      console.log(`   ✅ ${added} produtos carregados no cache\n`);
    } catch (error) {
      console.error('⚠️  Erro ao carregar produtos do banco:', error.message);
    }
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
   * ✅ NOVO: Compara se a nova oferta é melhor que a existente
   */
  isBetterOffer(newProduct, existingProduct) {
    const newDiscount = parseInt(newProduct.desconto) || 0;
    const existingDiscount = parseInt(existingProduct.desconto) || 0;
    
    const newPrice = parseInt(newProduct.preco_para) || 0;
    const existingPrice = parseInt(existingProduct.preco_para) || 0;

    // É melhor se: desconto maior OU (desconto igual + preço menor)
    if (newDiscount > existingDiscount) return true;
    if (newDiscount === existingDiscount && newPrice < existingPrice) return true;
    
    return false;
  }

  /**
   * ✅ ATUALIZADO: Verifica duplicatas E ofertas melhores
   */
  async processProduct(product, collectedProducts) {
    const normalizedName = this.normalizeProductName(product.nome);
    
    // 1️⃣ Verifica produtos já coletados NESTA execução
    const duplicateInMemory = collectedProducts.some(p => {
      const existingNormalized = this.normalizeProductName(p.nome);
      return p.link_original === product.link_original ||
             existingNormalized.split(' ').slice(0, 5).join(' ') === 
             normalizedName.split(' ').slice(0, 5).join(' ');
    });

    if (duplicateInMemory) {
      return { action: 'skip', reason: 'duplicate_in_memory' };
    }

    // 2️⃣ Verifica se existe no BANCO
    const existingInDb = this.existingProductsMap.get(product.link_original);
    
    if (!existingInDb) {
      // 2️⃣A - Busca por nome similar (segunda verificação)
      for (const [link, existingProd] of this.existingProductsMap.entries()) {
        const existingNormalized = this.normalizeProductName(existingProd.nome);
        if (existingNormalized.split(' ').slice(0, 5).join(' ') === 
            normalizedName.split(' ').slice(0, 5).join(' ')) {
          
          // Produto similar encontrado, verifica se é melhor oferta
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
      
      // Produto realmente novo!
      return { action: 'add', reason: 'new_product' };
    }

    // 3️⃣ Produto existe, verifica se nova oferta é melhor
    if (this.isBetterOffer(product, existingInDb)) {
      return { 
        action: 'update', 
        reason: 'better_offer',
        oldLink: product.link_original 
      };
    }

    // Oferta pior ou igual, ignora
    return { action: 'skip', reason: 'worse_or_equal_offer' };
  }

  async scrapeCategory() {
    await this.loadExistingProducts();

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
    const maxPages = 50;
    this.duplicatesIgnored = 0;
    this.betterOffersUpdated = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  🎯 META: ${this.limit} produtos NOVOS (${this.minDiscount}%+ desconto) ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const offset = (pageNum - 1) * 48;
        const url = `https://www.mercadolivre.com.br/ofertas?page=${pageNum}${offset > 0 ? `&_Desde_${offset + 1}` : ''}`;
        
        const progressBar = this.getProgressBar(allProducts.length, this.limit);
        console.log(`📄 Pág ${pageNum.toString().padStart(2, '0')}/${maxPages} ${progressBar} [${allProducts.length}/${this.limit}] (${this.duplicatesIgnored} ignorados | ${this.betterOffersUpdated} melhorados)`);
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(2000);

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
                  
                  // ✅ FIX BUG 3: Pega TODOS os preços corretamente
                  const priceElements = item.querySelectorAll('.andes-money-amount__fraction');
                  let currentPrice = '0';
                  let oldPrice = '0';
                  
                  if (priceElements.length >= 2) {
                    // Primeiro é o preço atual, segundo é o antigo (riscado)
                    currentPrice = priceElements[0].innerText.replace(/\./g, '');
                    oldPrice = priceElements[1].innerText.replace(/\./g, '');
                  } else if (priceElements.length === 1) {
                    // Só tem preço atual
                    currentPrice = priceElements[0].innerText.replace(/\./g, '');
                    // Calcula preço antigo baseado no desconto
                    const currentVal = parseInt(currentPrice);
                    oldPrice = Math.round(currentVal / (1 - discountVal / 100)).toString();
                  }

                  // ✅ FIX BUG 1: Valida link ANTES de adicionar
                  if (titleEl && linkEl && linkEl.href) {
                    const cleanLink = linkEl.href.split('?')[0];
                    
                    // Valida se o link é válido
                    if (!cleanLink || cleanLink.length < 20 || !cleanLink.startsWith('http')) {
                      console.log('⚠️ Link inválido detectado:', cleanLink);
                      return;
                    }
                    
                    results.push({
                      nome: titleEl.innerText.trim(),
                      imagem: imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '',
                      link_original: cleanLink,
                      preco: `R$ ${currentPrice}`,
                      preco_anterior: `R$ ${oldPrice}`,
                      preco_de: oldPrice,
                      preco_para: currentPrice,
                      desconto: `${discountVal}%`,
                      marketplace: 'ML',
                      isActive: true
                    });
                  }
                }
              } catch (e) {
                console.error('Erro ao processar item:', e.message);
              }
            });
            
            return results;
          }, { minDisc: this.minDiscount });

          // ✅ Processa cada produto com lógica inteligente
          for (const product of productsFromPage) {
            // ✅ Valida novamente no Node.js
            if (!product.link_original || product.link_original.length < 20) {
              console.log(`   ⚠️ Produto sem link válido ignorado: ${product.nome.substring(0, 30)}...`);
              continue;
            }

            const result = await this.processProduct(product, allProducts);
            
            if (result.action === 'add' || result.action === 'update') {
              // ✅ Marca produto para UPDATE se for oferta melhor
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
          await page.waitForTimeout(1500 + Math.random() * 1000);

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