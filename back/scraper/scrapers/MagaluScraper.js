/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAGALU SCRAPER - VERSÃO ULTIMATE (NÍVEL 3)
 * ═══════════════════════════════════════════════════════════════════════
 * @version 5.0.0
 * @fixes
 *   - ✅ Filtro de Preço Máximo: ignora produtos acima do valor definido
 *   - ✅ Trava de Looping: encerra se 3 páginas seguidas não tiverem produtos válidos
 *   - ✅ Diagnóstico Premium: notifica o cliente sobre filtros muito rigorosos
 *   - ✅ Todas as correções anteriores (links, títulos, categoria DB)
 */

const { chromium } = require('playwright');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoryUrl, getCategoryName, MAGALU_CATEGORIES } = require('../../config/categorias-magalu');

class MagaluScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(options.limit || process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.maxPrice = options.maxPrice || null; // ✅ Filtro de preço máximo

    this.affiliateId = options.affiliateId || process.env.MAGALU_AFFILIATE_ID || 'magazinepromoforia';
    this.searchTerm = options.searchTerm || null;
    this.onProductCollected = options.onProductCollected || null;

    this.stats = {
      duplicatesIgnored: 0,
      betterOffersUpdated: 0,
      productsCollected: 0,
      pagesScraped: 0,
      errors: 0,
      filteredByDiscount: 0,
      filteredByPrice: 0, // ✅ Novo contador
      totalSeenOnPage: 0,
      uselessPagesInARow: 0 // ✅ Contador para trava de looping
    };

    this.seenLinks = new Set();
    this.seenProductKeys = new Set();
    this.existingProductsMap = new Map();

    if (this.searchTerm) {
      this.currentCategory = 'OFERTAS_DIA'; 
      this.categoryName = `Busca: "${this.searchTerm}"`;
      this.categoryNameForDB = 'Ofertas do Dia'; 
    } else if (options.categoryKey && MAGALU_CATEGORIES[options.categoryKey]) {
      this.currentCategory = options.categoryKey;
      this.categoryName = MAGALU_CATEGORIES[options.categoryKey].name;
      this.categoryNameForDB = getCategoryName(options.categoryKey);
    } else {
      this.currentCategory = 'OFERTAS_DIA';
      this.categoryName = 'Ofertas do Dia';
      this.categoryNameForDB = 'Ofertas do Dia';
    }
  }

  sendStatus(message, type = 'info') {
    if (this.onProductCollected) {
      this.onProductCollected({ _isStatusMessage: true, message, type }, this.stats.productsCollected, this.limit);
    }
  }

  getPageUrl(pageNum) {
    if (this.searchTerm) {
      const encoded = encodeURIComponent(this.searchTerm);
      const base = `https://www.magazinevoce.com.br/${this.affiliateId}/busca/${encoded}/`;
      return pageNum > 1 ? `${base}?page=${pageNum}` : base;
    }
    return getCategoryUrl(this.currentCategory, this.affiliateId, pageNum);
  }

  buildAffiliateLink(rawUrl) {
    if (!rawUrl) return null;
    try {
      if (rawUrl.includes('magazinevoce.com.br') && rawUrl.includes(this.affiliateId)) {
        return rawUrl.split('?')[0].split('#')[0];
      }
      const url = new URL(rawUrl);
      url.hostname = 'www.magazinevoce.com.br';
      if (!url.pathname.startsWith(`/${this.affiliateId}/`)) {
        url.pathname = `/${this.affiliateId}${url.pathname}`;
      }
      return url.toString().split('?')[0].split('#')[0];
    } catch (e) {
      return rawUrl;
    }
  }

  async loadExistingProducts() {
    try {
      const conn = getProductConnection();
      const Product = getProductModel('magalu', conn);
      const products = await Product.find({ isActive: true, marketplace: 'MAGALU' })
        .select('link_original nome desconto preco_para preco_de categoria')
        .lean()
        .limit(500)
        .sort({ createdAt: -1 });
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
      this.existingProductsMap = new Map();
    }
  }

  generateProductKey(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(word => word.length > 2).slice(0, 5).join('_');
  }

  isBetterOffer(newProduct, existingProduct) {
    const newDiscount = parseInt(newProduct.desconto) || 0;
    const newPrice = parseInt(newProduct.preco_para) || 0;
    return newDiscount > existingProduct.desconto || (newDiscount === existingProduct.desconto && newPrice < existingProduct.preco);
  }

  checkDuplicate(product) {
    const productKey = this.generateProductKey(product.nome);
    if (this.seenProductKeys.has(productKey)) return { isDuplicate: true, reason: 'duplicate_in_memory' };
    if (this.seenLinks.has(product.link_original)) return { isDuplicate: true, reason: 'duplicate_link' };
    const existing = this.existingProductsMap.get(productKey);
    if (existing && !this.isBetterOffer(product, existing)) return { isDuplicate: true, reason: 'worse_offer' };
    if (existing && this.isBetterOffer(product, existing)) return { isDuplicate: false, isBetterOffer: true, oldLink: existing.link };
    return { isDuplicate: false };
  }

  formatPrice(cents) {
    if (!cents || cents === 0) return 'R$ 0,00';
    const reais = Math.floor(cents / 100);
    const centavos = cents % 100;
    return `R$ ${reais.toLocaleString('pt-BR')},${centavos.toString().padStart(2, '0')}`;
  }

  async scrapeCategory() {
    this.sendStatus(`🚀 Iniciando coleta em Magazine Luiza...`);
    await this.loadExistingProducts();

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'pt-BR'
    });

    const page = await context.newPage();
    let allProducts = [];
    let pageNum = 1;
    const maxPages = 20;

    try {
      while (allProducts.length < this.limit && pageNum <= maxPages) {
        const url = this.getPageUrl(pageNum);
        this.sendStatus(`📄 Analisando página ${pageNum}...`);

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForTimeout(3000);

          await page.evaluate(async () => {
            for (let i = 0; i < 6; i++) {
              window.scrollBy(0, 500);
              await new Promise(r => setTimeout(r, 400));
            }
          });

          const productsFromPage = await page.evaluate(({ affiliateId, categoryNameForDB }) => {
            const results = [];
            const items = document.querySelectorAll('[data-testid="product-card-container"], a[href*="/p/"], a[href*="/produto/"]');
            
            function extractPrice(text) {
              if (!text) return 0;
              const cleaned = text.replace(/[^\d]/g, '');
              return parseInt(cleaned) || 0;
            }

            items.forEach((item) => {
              try {
                let linkEl = item.tagName === 'A' ? item : item.querySelector('a[href*="/p/"], a[href*="/produto/"]');
                if (!linkEl || !linkEl.href) return;

                let title = linkEl.title || item.querySelector('img')?.alt || item.innerText.split('\n')[0];
                let currentPrice = extractPrice(item.querySelector('[data-testid="price-value"]')?.innerText);
                let oldPrice = extractPrice(item.querySelector('[data-testid="price-original"]')?.innerText);
                
                if (!currentPrice) return;
                if (!oldPrice) {
                    const pixMatch = item.innerText.match(/(\d+)%\s+no\s+pix/i);
                    if (pixMatch) oldPrice = Math.round(currentPrice / (1 - parseInt(pixMatch[1])/100));
                }

                const discount = oldPrice > currentPrice ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0;
                let cleanUrl = linkEl.href.split('?')[0].split('#')[0];
                if (cleanUrl.includes(`/${affiliateId}/`)) cleanUrl = cleanUrl.replace(`/${affiliateId}/`, '/');

                results.push({
                  nome: title.trim(),
                  imagem: item.querySelector('img')?.src || '',
                  link_original: cleanUrl,
                  preco_de: oldPrice.toString(),
                  preco_para: currentPrice.toString(),
                  desconto: discount.toString(),
                  categoria: categoryNameForDB,
                  marketplace: 'MAGALU'
                });
              } catch (e) {}
            });
            return results;
          }, { affiliateId: this.affiliateId, categoryNameForDB: this.categoryNameForDB });

          this.stats.totalSeenOnPage += productsFromPage.length;
          let productsAddedThisPage = 0;
          let filteredByPriceThisPage = 0;
          let filteredByDiscountThisPage = 0;

          for (const product of productsFromPage) {
            if (allProducts.length >= this.limit) break;

            // ✅ FILTRO DE PREÇO MÁXIMO
            if (this.maxPrice && (parseInt(product.preco_para) / 100) > this.maxPrice) {
              this.stats.filteredByPrice++;
              filteredByPriceThisPage++;
              continue;
            }

            // ✅ FILTRO DE DESCONTO MÍNIMO
            if (parseInt(product.desconto) < this.minDiscount) {
              this.stats.filteredByDiscount++;
              filteredByDiscountThisPage++;
              continue;
            }

            const dupCheck = this.checkDuplicate(product);
            if (dupCheck.isDuplicate) {
              this.stats.duplicatesIgnored++;
              continue;
            }

            this.seenLinks.add(product.link_original);
            this.seenProductKeys.add(this.generateProductKey(product.nome));

            const finalProduct = {
              ...product,
              link_afiliado: this.buildAffiliateLink(product.link_original),
              preco: this.formatPrice(parseInt(product.preco_para)),
              preco_anterior: this.formatPrice(parseInt(product.preco_de)),
              desconto: `${product.desconto}%`,
              isActive: true
            };

            allProducts.push(finalProduct);
            this.stats.productsCollected++;
            productsAddedThisPage++;
            if (this.onProductCollected) this.onProductCollected(finalProduct, allProducts.length, this.limit);
          }

          // ✅ LÓGICA DE TRAVA DE LOOPING
          if (productsAddedThisPage === 0 && productsFromPage.length > 0) {
            this.stats.uselessPagesInARow++;
            if (filteredByPriceThisPage > 0) this.sendStatus(`⚠️ ${filteredByPriceThisPage} itens ignorados por preço > R$ ${this.maxPrice}`, 'warning');
            if (filteredByDiscountThisPage > 0) this.sendStatus(`⚠️ ${filteredByDiscountThisPage} itens ignorados por desconto < ${this.minDiscount}%`, 'warning');
            
            if (this.stats.uselessPagesInARow >= 3) {
              this.sendStatus(`🛑 Filtro muito rigoroso: Analisamos 3 páginas e nenhum produto atingiu os critérios. Encerrando para poupar recursos.`, 'error');
              break;
            }
          } else {
            this.stats.uselessPagesInARow = 0;
          }

          if (productsFromPage.length === 0) break;

          pageNum++;
          await page.waitForTimeout(2000);
        } catch (e) {
          pageNum++;
        }
      }

      await browser.close();

      if (allProducts.length === 0) {
        this.sendStatus(`❌ Nenhum produto encontrado com os filtros aplicados (Preço Máx: R$ ${this.maxPrice || 'N/A'} | Desconto Mín: ${this.minDiscount}%).`, 'error');
      }

      return allProducts;
    } catch (error) {
      await browser.close();
      return allProducts;
    }
  }
}

module.exports = MagaluScraper;
