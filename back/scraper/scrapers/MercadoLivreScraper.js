/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - VERSÃO SIMPLIFICADA
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * @version 7.0.3 - CORRIGIDO: Acesso ao clipboard após página carregar
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const path = require('path');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoria } = require('../../config/categorias-ml');

class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.maxPrice = options.maxPrice || null;
    this.categoriaKey = options.categoria || 'todas';
    
    this.stats = {
      duplicatesIgnored: 0,
      betterOffersUpdated: 0,
      productsCollected: 0,
      pagesScraped: 0,
      errors: 0,
      filteredByDiscount: 0,
      filteredByPrice: 0,
      affiliateLinksSuccess: 0,
      affiliateLinksFailed: 0,
      timeouts: 0
    };
    
    this.seenLinks = new Set();
    this.seenProductKeys = new Set();
    
    this.categoriaInfo = getCategoria(this.categoriaKey);
    if (!this.categoriaInfo) {
      console.warn(`⚠️  Categoria "${this.categoriaKey}" não encontrada, usando "todas"`);
      this.categoriaInfo = getCategoria('todas');
    }
    
    this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    
    this.config = {
      pageTimeout: 10000,
      maxPages: 50,
      maxEmptyPages: 2,
      parallelTabs: 1
    };
    
    this.browser = null;
    this.context = null;
    this.isFirstProduct = true;
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
      console.log('   ⚠️  Continuando sem cache do banco\n');
      this.existingProductsMap = new Map();
    }
  }

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

  isBetterOffer(newProduct, existingProduct) {
    const newDiscount = parseInt(newProduct.desconto) || 0;
    const newPrice = parseInt(newProduct.preco_para) || 0;
    
    return newDiscount > existingProduct.desconto || 
           (newDiscount === existingProduct.desconto && newPrice < existingProduct.preco);
  }

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
        console.log('   ⚠️  Erro ao carregar sessão, usando nova\n');
      }
    } else {
      console.log('   ⚠️  Arquivo ml-session.json não encontrado\n');
      console.log('   💡 Execute o scraper manualmente uma vez para fazer login\n');
    }

    this.context = await this.browser.newContext(contextOptions);
    await this.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    return { browser: this.browser, context: this.context };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * MÉTODO CORRIGIDO - CLIPBOARD APÓS PÁGINA CARREGAR
   * ═══════════════════════════════════════════════════════════════════
   */
  async getAffiliateLink(productUrl) {
    const page = await this.context.newPage();
    
    try {
      // CARREGA O PRODUTO PRIMEIRO
      await page.goto(productUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: this.config.pageTimeout
      });

      // AGUARDA MAIS NO PRIMEIRO PRODUTO
      if (this.isFirstProduct) {
        await page.waitForTimeout(2500);
        this.isFirstProduct = false;
      } else {
        await page.waitForTimeout(1500);
      }

      // ═══════════════════════════════════════════════════════════
      // AGORA SIM LIMPA O CLIPBOARD (APÓS PÁGINA CARREGAR)
      // ═══════════════════════════════════════════════════════════
      try {
        await page.evaluate(() => navigator.clipboard.writeText(''));
        await page.waitForTimeout(300);
      } catch (e) {
        // Se clipboard não disponível, continua mesmo assim
      }

      // CLICA NO BOTÃO COMPARTILHAR
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const shareBtn = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          return text.includes('compartilhar');
        });

        if (shareBtn) {
          shareBtn.click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        console.log(`      ⚠️  Botão compartilhar não encontrado`);
        await page.close();
        return null;
      }

      // AGUARDA O MODAL ABRIR
      await page.waitForTimeout(2000);

      // LIMPA CLIPBOARD NOVAMENTE ANTES DE COPIAR
      try {
        await page.evaluate(() => navigator.clipboard.writeText(''));
        await page.waitForTimeout(200);
      } catch (e) {
        // Ignora erro
      }

      // 4 TABS
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(150);
      }

      // ENTER PARA COPIAR
      await page.keyboard.press('Enter');
      
      // AGUARDA A CÓPIA ACONTECER
      await page.waitForTimeout(1500);

      // PEGA O LINK COPIADO
      let copiedLink = '';
      try {
        copiedLink = await page.evaluate(() => navigator.clipboard.readText());
      } catch (e) {
        console.log(`      ❌ Erro ao ler clipboard: ${e.message}`);
      }

      // FECHA O MODAL
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      // FECHA A ABA
      await page.close();

      // ═══════════════════════════════════════════════════════════
      // VALIDAÇÃO DO LINK
      // ═══════════════════════════════════════════════════════════
      if (!copiedLink || copiedLink.trim() === '') {
        console.log(`      ⚠️  Clipboard vazio`);
        return null;
      }

      const cleanLink = copiedLink.trim();

      // Link de afiliado (ideal)
      if (cleanLink.includes('/sec/') || cleanLink.includes('mercadolivre.com/sec/')) {
        console.log(`      ✅ Afiliado`);
        return cleanLink;
      }

      // Link normal do ML (ainda é válido!)
      if (cleanLink.includes('mercadolivre.com.br') || cleanLink.includes('mercadolibre.com')) {
        console.log(`      ✅ Link ML válido`);
        return cleanLink;
      }

      // Não é link do ML
      console.log(`      ⚠️  Link inválido: ${cleanLink.substring(0, 50)}...`);
      return null;

    } catch (error) {
      console.log(`      ❌ Erro: ${error.message}`);
      try {
        await page.close();
      } catch (e) {}
      return null;
    }
  }

  async processProducts(products, allProducts) {
    for (const prodData of products) {
      if (allProducts.length >= this.limit) break;

      console.log(`   🔄 [${allProducts.length + 1}/${this.limit}] ${prodData.name.substring(0, 40)}...`);

      const productKey = this.generateProductKey(prodData.name);

      const dupCheck = this.checkDuplicate({
        nome: prodData.name,
        link_original: prodData.link,
        desconto: prodData.discount,
        preco_para: prodData.currentPrice
      }, allProducts);

      if (dupCheck.isDuplicate) {
        this.stats.duplicatesIgnored++;
        console.log(`      ⏭️  IGNORADO (${dupCheck.reason})`);
        continue;
      }

      this.seenLinks.add(prodData.link);

      // PEGA O LINK DE AFILIADO
      const affiliateLink = await this.getAffiliateLink(prodData.link);
      const finalLink = affiliateLink || prodData.link;
      const isAffiliate = finalLink.includes('/sec/');

      const product = {
        nome: prodData.name,
        imagem: prodData.image,
        link_original: prodData.link,
        link_afiliado: finalLink,
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

      if (isAffiliate) {
        this.stats.affiliateLinksSuccess++;
      } else {
        this.stats.affiliateLinksFailed++;
      }

      // DELAY ENTRE PRODUTOS
      await new Promise(r => setTimeout(r, 500));
    }
  }

  async scrapeCategory() {
    const startTime = Date.now();
    
    await this.loadExistingProducts();
    const { browser, context } = await this.createBrowserContext();
   
    let allProducts = [];
    let pageNum = 1;
    let emptyPagesCount = 0;
    let currentOffset = 0;

    try {
      console.log(`╔════════════════════════════════════════════════════╗`);
      console.log(`║  ${this.categoriaInfo.emoji}  ${this.categoriaInfo.nome.padEnd(47)} ║`);
      console.log(`║  🎯 META: ${this.limit} produtos (${this.minDiscount}%+)${' '.repeat(26)} ║`);
      console.log(`║  🔧 MODO: Simplificado (1 aba)${' '.repeat(20)} ║`);
      console.log(`╚════════════════════════════════════════════════════╝\n`);

      while (allProducts.length < this.limit && pageNum <= this.config.maxPages) {
        const baseUrl = this.categoriaInfo.url;
        const separator = baseUrl.includes('?') ? '&' : '?';
        const url = pageNum === 1 ? baseUrl : `${baseUrl}${separator}_Desde_${currentOffset + 1}&_NoIndex_true`;
       
        console.log(`📄 Página ${pageNum} [${allProducts.length}/${this.limit}]`);
       
        try {
          const mainPage = await context.newPage();
          
          await mainPage.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: this.config.pageTimeout 
          });

          await mainPage.waitForTimeout(800);

          const pageData = await mainPage.evaluate(({ minDiscount, maxPrice }) => {
            const cards = document.querySelectorAll('.poly-card, .ui-search-result');
            const products = [];
            let filtered = 0;
            
            cards.forEach(card => {
              try {
                const link = card.querySelector('a[href*="/MLB"]')?.href.split('?')[0];
                if (!link || !link.match(/MLB\d+/)) return;
                
                const name = card.querySelector('h2, .poly-component__title')?.innerText || 'Sem nome';
                const image = card.querySelector('img')?.src || '';
                
                const discountText = card.querySelector('.poly-price__disc_label, .ui-search-price__discount')?.innerText || '0';
                const discount = parseInt(discountText.replace(/\D/g, '')) || 0;
                
                if (discount < minDiscount) {
                  filtered++;
                  return;
                }
                
                const prices = Array.from(card.querySelectorAll('.andes-money-amount__fraction'));
                let currentPrice = 0, oldPrice = 0;
                
                if (prices.length >= 2) {
                  currentPrice = parseInt(prices[0]?.innerText.replace(/\./g, '')) || 0;
                  oldPrice = parseInt(prices[1]?.innerText.replace(/\./g, '')) || 0;
                } else if (prices.length === 1) {
                  currentPrice = parseInt(prices[0]?.innerText.replace(/\./g, '')) || 0;
                  oldPrice = discount > 0 ? Math.round(currentPrice / (1 - discount / 100)) : currentPrice;
                }
                
                if (oldPrice < currentPrice) [oldPrice, currentPrice] = [currentPrice, oldPrice];
                if (maxPrice && currentPrice > parseInt(maxPrice)) {
                  filtered++;
                  return;
                }
                
                products.push({ link, name, image, discount, currentPrice, oldPrice });
              } catch (e) {}
            });
            
            return { products, filtered };
          }, { minDiscount: this.minDiscount, maxPrice: this.maxPrice });

          await mainPage.close();

          const newProducts = pageData.products.filter(p => !this.seenLinks.has(p.link));
          this.stats.filteredByDiscount += pageData.filtered;

          console.log(`   ✅ ${newProducts.length} novos | ${pageData.filtered} filtrados\n`);
          
          if (newProducts.length === 0) {
            emptyPagesCount++;
            if (emptyPagesCount >= this.config.maxEmptyPages) {
              console.log(`   ⚠️  Sem novos produtos\n`);
              break;
            }
            pageNum++;
            currentOffset += 48;
            continue;
          }
          emptyPagesCount = 0;

          console.log(`   🔗 Obtendo links...\n`);

          await this.processProducts(newProducts, allProducts);

          if (allProducts.length >= this.limit) break;

          this.stats.pagesScraped = pageNum;
          pageNum++;
          currentOffset += 48;

        } catch (pageError) {
          console.error(`   ❌ Erro: ${pageError.message}`);
          this.stats.errors++;
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
      console.log(`⏭️  Ignorados: ${this.stats.duplicatesIgnored}`);
      console.log(`📄 Páginas: ${this.stats.pagesScraped}`);
      console.log(`⏱️  Tempo: ${duration}s\n`);

      return allProducts.slice(0, this.limit);

    } catch (error) {
      console.error('❌ Erro crítico:', error.message);
      
      try {
        if (this.browser) await this.browser.close();
      } catch (e) {}
      
      return allProducts.slice(0, this.limit);
    }
  }
}

module.exports = MercadoLivreScraper;