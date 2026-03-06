/**
 * MERCADO LIVRE SCRAPER
 * @version 3.4.0 - ✅ Paginação precisa + zero perda de itens
 */

const { chromium } = require('playwright');
const path         = require('path');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel }      = require('../../database/models/Products');
const { getCategoria }         = require('../../config/categorias-ml');
const MLSessionManager         = require('../../services/ml-session-manager');
const mlAffiliate              = require('../../services/MLAffiliateService');

class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount        = minDiscount;
    this.limit              = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.maxPrice           = options.maxPrice ? parseInt(options.maxPrice) : null;
    this.categoriaKey       = options.categoria || 'todas';
    this.searchTerm         = options.searchTerm || null;
    this.onProductCollected = options.onProductCollected || null;

    this.stats = {
      duplicatesIgnored:     0,
      productsCollected:     0,
      pagesScraped:          0,
      filteredByDiscount:    0,
      filteredByPrice:       0,
      affiliateLinksSuccess: 0,
      affiliateLinksFailed:  0,
      couponsApplied:        0
    };

    this.seenLinks = new Set();

    if (!this.searchTerm) {
      this.categoriaInfo = getCategoria(this.categoriaKey) || getCategoria('informatica');
    } else {
      this.categoriaInfo = getCategoria('informatica');
    }

    try {
      this.sessionManager     = new MLSessionManager();
      const activeSessionPath = this.sessionManager.getActiveSessionPath();
      this.sessionPath        = activeSessionPath || path.join(process.cwd(), 'ml-session.json');
    } catch (error) {
      this.sessionPath = path.join(process.cwd(), 'ml-session.json');
    }

    this.browser = null;
    this.context = null;
  }

  getSearchUrl() {
    if (this.searchTerm) {
      return `https://lista.mercadolivre.com.br/${encodeURIComponent(this.searchTerm)}`;
    }
    return this.categoriaInfo.url;
  }

  /**
   * ✅ FIX: Paginação usa offset acumulado real (não pageNum * 50 fixo)
   * O ML aceita _Desde_N onde N é o índice do primeiro item da página.
   * Passamos o offset acumulado de itens raspados nas páginas anteriores.
   */
  getPageUrl(baseUrl, pageNum, offset) {
    if (pageNum === 1) return baseUrl;
    return `${baseUrl}_Desde_${offset + 1}_NoIndex_True`;
  }

  isProductUrl(url) {
    return url && (
      url.includes('/MLB') ||
      url.includes('/MLA') ||
      url.includes('produto.mercadolivre')
    );
  }

  async loadExistingLinks() {
    try {
      const conn    = getProductConnection();
      const Product = getProductModel('ML', conn);

      const query = this.searchTerm
        ? { isActive: true, marketplace: 'ML' }
        : this.categoriaInfo && this.categoriaInfo.nome !== 'Todas'
          ? { categoria: this.categoriaInfo.nome, isActive: true, marketplace: 'ML' }
          : { isActive: true, marketplace: 'ML' };

      const products = await Product.find(query)
        .select('link_original')
        .lean()
        .limit(2000);

      for (const product of products) {
        if (product.link_original) this.seenLinks.add(product.link_original);
      }

      console.log(`📋 ${this.seenLinks.size} produtos já existentes no banco (serão ignorados)\n`);
    } catch (error) {
      console.warn('⚠️  Não foi possível carregar produtos existentes:', error.message);
    }
  }

  generateProductKey(name) {
    const cleanName = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b\d+gb\b|\b\d+tb\b|\d{4,}/gi, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleanName.split(' ').filter(w => w.length >= 3).slice(0, 8).join('_');
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
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    let contextOptions = {
      viewport:  { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    };

    const fs = require('fs');
    if (fs.existsSync(this.sessionPath)) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(this.sessionPath, 'utf-8'));
        if (sessionData.cookies) contextOptions.storageState = sessionData;
        console.log('🔐 [Scraper] Sessão ML carregada');
      } catch (error) {}
    }

    this.context = await this.browser.newContext(contextOptions);
    return { browser: this.browser, context: this.context };
  }

  async getAffiliateLink(productUrl) {
    if (mlAffiliate.isAuthenticated()) {
      try {
        const link = await mlAffiliate.generateAffiliateLink(productUrl);
        if (link && link !== productUrl && !link.includes('tracking_id=')) {
          return link;
        }
      } catch (e) {
        console.warn(`⚠️  [Scraper] Erro ao gerar link afiliado: ${e.message}`);
      }
    }
    return null;
  }

  /**
   * ✅ FIX: Retorna também o total REAL de cards encontrados na página
   * para o controle de paginação ser preciso.
   */
  async scrapePage(url) {
    const mainPage = await this.context.newPage();

    try {
      await mainPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await mainPage.waitForTimeout(1000);
      await mainPage.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 500));
      });

      const pageData = await mainPage.evaluate(({ minDiscount }) => {
        const cards    = document.querySelectorAll('.poly-card, .ui-search-result');
        const products = [];

        cards.forEach(card => {
          try {
            const allLinks = Array.from(card.querySelectorAll('a'));
            let link = null;
            for (const el of allLinks) {
              const href = el.href.split('?')[0];
              if (
                href.includes('/MLB') ||
                href.includes('/MLA') ||
                href.includes('produto.mercadolivre')
              ) {
                link = href;
                break;
              }
            }
            if (!link) return;

            const name = card.querySelector('h2, .poly-component__title')?.innerText?.trim() || 'Sem nome';
            const img  = card.querySelector('img')?.src;

            const discountEl = card.querySelector('.andes-money-amount__discount, .poly-price__disc_label');
            const discount   = parseInt(discountEl?.innerText.replace(/\D/g, '') || '0');
            if (discount < minDiscount) return;

            let currentPrice = 0;
            const currentPriceContainer = card.querySelector('.poly-price__current');
            if (currentPriceContainer) {
              const fraction = currentPriceContainer.querySelector('.andes-money-amount__fraction');
              if (fraction) currentPrice = parseInt(fraction.innerText.replace(/\./g, '').replace(/\D/g, ''));
            }
            if (!currentPrice) {
              const fractions = Array.from(card.querySelectorAll('.andes-money-amount__fraction'));
              if (fractions.length >= 1) {
                currentPrice = parseInt(fractions[fractions.length - 1].innerText.replace(/\./g, ''));
              }
            }

            let oldPrice = 0;
            const oldPriceEl = card.querySelector('.andes-money-amount--previous .andes-money-amount__fraction');
            if (oldPriceEl) {
              oldPrice = parseInt(oldPriceEl.innerText.replace(/\./g, '').replace(/\D/g, ''));
            } else if (currentPrice && discount > 0) {
              oldPrice = Math.round(currentPrice / (1 - discount / 100));
            }

            if (currentPrice > 0 && oldPrice > currentPrice) {
              products.push({ link, name, image: img, discount, currentPrice, oldPrice });
            }
          } catch (e) {}
        });

        // ✅ Retorna total real de cards (não só os aprovados no filtro de desconto)
        return { products, total: cards.length };
      }, { minDiscount: this.minDiscount });

      await mainPage.close();
      return pageData;

    } catch (e) {
      try { await mainPage.close(); } catch (_) {}
      console.warn(`⚠️  Erro ao carregar página: ${e.message}`);
      return { products: [], total: 0 };
    }
  }

  /**
   * ✅ FIX: Remove o .slice() prematuro — todos os produtos válidos são processados.
   * O controle de limite é feito DENTRO do loop, após cada produto ser efetivamente adicionado.
   */
  async processProducts(products, allProducts) {
    const BATCH_SIZE = 5;

    // ✅ Sem .slice() aqui: filtra apenas duplicatas e URLs inválidas
    const validProducts = products.filter(p =>
      !this.seenLinks.has(p.link) && this.isProductUrl(p.link)
    );

    if (validProducts.length === 0) return;

    // Marca todos como vistos imediatamente para evitar duplicatas entre batches
    validProducts.forEach(p => this.seenLinks.add(p.link));

    for (let i = 0; i < validProducts.length; i += BATCH_SIZE) {
      // ✅ Checa o limite ANTES de cada batch, não antes de montar validProducts
      if (allProducts.length >= this.limit) break;

      // ✅ Garante que o batch não ultrapasse o limite restante
      const remaining = this.limit - allProducts.length;
      const batch     = validProducts.slice(i, i + Math.min(BATCH_SIZE, remaining));

      const results = await Promise.all(batch.map(async (prodData) => {
        // Checagem individual caso outro batch paralelo tenha preenchido o limite
        if (allProducts.length >= this.limit) return null;

        let finalPrice    = prodData.currentPrice;
        let couponApplied = false;
        let couponText    = '';
        let realDiscount  = prodData.discount;

        if (prodData.coupon && prodData.currentPrice >= prodData.coupon.minValue) {
          if (prodData.coupon.type === 'percent') {
            finalPrice = prodData.currentPrice - Math.round(prodData.currentPrice * (prodData.coupon.discount / 100));
          } else if (prodData.coupon.type === 'value') {
            finalPrice = prodData.currentPrice - prodData.coupon.discount;
          }
          couponApplied = true;
          couponText    = prodData.coupon.text;
          realDiscount  = Math.round(((prodData.oldPrice - finalPrice) / prodData.oldPrice) * 100);
          this.stats.couponsApplied++;
        }

        if (this.maxPrice && finalPrice > this.maxPrice) {
          this.stats.filteredByPrice++;
          return null;
        }

        const affiliateLink = await this.getAffiliateLink(prodData.link);

        if (affiliateLink) {
          this.stats.affiliateLinksSuccess++;
          console.log(`✅ [Scraper] Link meli.la: ${affiliateLink}`);
        } else {
          this.stats.affiliateLinksFailed++;
          console.warn(`⚠️  [Scraper] Link comum retornado para: ${prodData.name.substring(0, 50)}`);
        }

        let categoriaFinal = this.searchTerm ? 'Informática' : this.categoriaInfo.nome;
        if (categoriaFinal === 'esportes') categoriaFinal = 'Esportes e Fitness';

        const product = {
          nome:           prodData.name,
          imagem:         prodData.image,
          link_original:  prodData.link,
          link_afiliado:  affiliateLink || prodData.link,
          desconto:       `${realDiscount}%`,
          preco:          `R$ ${finalPrice}`,
          preco_anterior: `R$ ${prodData.oldPrice}`,
          preco_de:       String(prodData.oldPrice),
          preco_para:     String(finalPrice),
          marketplace:    'ML',
          categoria:      categoriaFinal,
          isActive:       true,
          createdAt:      new Date()
        };

        if (this.onProductCollected) {
          this.onProductCollected(product);
        }

        return product;
      }));

      results.filter(p => p !== null).forEach(p => allProducts.push(p));
    }
  }

  async scrapeCategory() {
    await this.loadExistingLinks();
    await this.createBrowserContext();

    const allProducts = [];
    const baseUrl     = this.getSearchUrl();
    let pageNum       = 1;
    // ✅ FIX: offset acumulado real — soma os cards de cada página anterior
    let totalCardsSeen = 0;
    // ✅ FIX: controle de páginas sem novos resultados para parar com segurança
    let emptyPages    = 0;
    const MAX_EMPTY   = 2;

    console.log(`🚀 Iniciando scraping de: ${baseUrl}`);

    while (allProducts.length < this.limit && pageNum <= 10) {
      const url = this.getPageUrl(baseUrl, pageNum, totalCardsSeen);

      console.log(`📄 Raspando página ${pageNum} (offset ${totalCardsSeen})...`);
      const { products, total } = await this.scrapePage(url);

      this.stats.pagesScraped++;

      if (total === 0) {
        // Página em branco: pode ser rate-limit ou fim real de resultados
        emptyPages++;
        console.warn(`⚠️  Página ${pageNum} sem cards (${emptyPages}/${MAX_EMPTY})`);
        if (emptyPages >= MAX_EMPTY) break;
        pageNum++;
        continue;
      }

      emptyPages = 0; // reseta contador ao receber itens

      // ✅ Acumula o total REAL de cards vistos para calcular o próximo offset
      totalCardsSeen += total;

      const beforeCount = allProducts.length;
      await this.processProducts(products, allProducts);
      const afterCount = allProducts.length;

      console.log(`   ✔ ${afterCount - beforeCount} novos produtos (total: ${afterCount}/${this.limit})`);

      // ✅ FIX: Só para se o ML indicar explicitamente que acabou (total < 48)
      // Margem de 2 para tolerar cards patrocinados que o ML às vezes omite
      if (total < 48) {
        console.log('📭 Última página detectada (total de cards < 48). Encerrando.');
        break;
      }

      pageNum++;
    }

    if (this.browser) await this.browser.close();

    this.stats.productsCollected = allProducts.length;
    console.log(`\n📊 Stats finais:`, this.stats);

    return allProducts;
  }
}

module.exports = MercadoLivreScraper;