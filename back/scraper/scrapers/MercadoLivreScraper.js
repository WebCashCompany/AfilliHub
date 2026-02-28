/**
 * MERCADO LIVRE SCRAPER
 * @version 4.0.0 - 100% API oficial do ML, sem Playwright, sem browser
 */

const axios = require('axios');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoria } = require('../../config/categorias-ml');
const mlAffiliate = require('../../services/MLAffiliateService');

// Mapeamento de categoriaKey → category_id da API do ML
const CATEGORIA_ID_MAP = {
  celulares:         'MLB-CELLPHONES',
  informatica:       'MLB1648',
  eletrodomesticos:  'MLB5726',
  casa_decoracao:    'MLB1574',
  joias_relogios:    'MLB3937',
  esportes:          'MLB1276',
  games:             'MLB1144',
  ferramentas:       'MLB263532',
  calcados_roupas:   'MLB1430',
  beleza:            'MLB1246',
  ofertas_dia:       null, // usa endpoint geral
  ofertas_relampago: null,
  precos_imbativeis: null,
  todas:             null,
};

class MercadoLivreScraper {
  constructor(minDiscount = 30, options = {}) {
    this.minDiscount = minDiscount;
    this.limit = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    this.maxPrice = options.maxPrice ? parseInt(options.maxPrice) : null;
    this.categoriaKey = options.categoria || 'todas';
    this.searchTerm = options.searchTerm || null;
    this.onProductCollected = options.onProductCollected || null;

    this.stats = {
      productsCollected: 0,
      affiliateLinksSuccess: 0,
      affiliateLinksFailed: 0,
      skippedNoAffiliate: 0,
      filteredByDiscount: 0,
      filteredByPrice: 0,
      duplicatesIgnored: 0,
    };

    this.seenLinks = new Set();
    this.categoriaInfo = getCategoria(this.categoriaKey) || getCategoria('informatica');
  }

  isRealAffiliateLink(link) {
    return link && (link.includes('meli.la') || link.includes('/sec/'));
  }

  async loadExistingLinks() {
    try {
      const conn = getProductConnection();
      const Product = getProductModel('ML', conn);

      const query = this.searchTerm
        ? { isActive: true, marketplace: 'ML' }
        : this.categoriaInfo && this.categoriaInfo.nome !== 'Todas as Ofertas'
          ? { categoria: this.categoriaInfo.nome, isActive: true, marketplace: 'ML' }
          : { isActive: true, marketplace: 'ML' };

      const products = await Product.find(query)
        .select('link_original')
        .lean()
        .limit(2000);

      for (const p of products) {
        if (p.link_original) this.seenLinks.add(p.link_original);
      }

      console.log(`📋 ${this.seenLinks.size} produtos já existentes no banco (serão ignorados)\n`);
    } catch (error) {
      console.warn('⚠️  Não foi possível carregar produtos existentes:', error.message);
    }
  }

  // ─── Busca produtos via API oficial do ML ─────────────────────────────────
  async fetchProductsFromAPI(offset = 0, limit = 50) {
    try {
      let url;
      const params = {
        limit,
        offset,
        sort: 'relevance',
        promotions: 'discount',
      };

      if (this.searchTerm) {
        // Busca por termo
        url = 'https://api.mercadolibre.com/sites/MLB/search';
        params.q = this.searchTerm;
        params.discount = this.minDiscount;
      } else {
        const categoryId = CATEGORIA_ID_MAP[this.categoriaKey];

        if (categoryId && categoryId.startsWith('MLB-')) {
          // Categoria especial (ex: celulares usa domain_id)
          url = 'https://api.mercadolibre.com/sites/MLB/search';
          params.category = 'MLB1051'; // Celulares e Telefonia
          params.discount = this.minDiscount;
        } else if (categoryId) {
          // Categoria numérica
          url = 'https://api.mercadolibre.com/sites/MLB/search';
          params.category = categoryId;
          params.discount = this.minDiscount;
        } else {
          // Ofertas gerais
          url = 'https://api.mercadolibre.com/sites/MLB/search';
          params.discount = this.minDiscount;
          params.q = 'ofertas';
        }
      }

      if (this.maxPrice) {
        params.price = `*-${this.maxPrice}`;
      }

      const response = await axios.get(url, {
        params,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          ...(mlAffiliate.accessToken && {
            'Authorization': `Bearer ${mlAffiliate.accessToken}`
          })
        },
        timeout: 15000
      });

      return response.data?.results || [];

    } catch (error) {
      console.error(`❌ [API ML] Erro ao buscar produtos: ${error.response?.status} ${error.message}`);
      return [];
    }
  }

  // ─── Busca ofertas relâmpago via API ──────────────────────────────────────
  async fetchLightningDeals(offset = 0) {
    try {
      const response = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
        params: {
          discount: this.minDiscount,
          sort: 'discount_desc',
          limit: 50,
          offset,
        },
        headers: { 'Accept': 'application/json' },
        timeout: 15000
      });

      return response.data?.results || [];
    } catch (error) {
      return [];
    }
  }

  // ─── Processa um item da API em produto do banco ──────────────────────────
  async processItem(item) {
    try {
      const originalPrice = item.original_price || item.price;
      const currentPrice  = item.price;

      if (!originalPrice || originalPrice <= currentPrice) {
        this.stats.filteredByDiscount++;
        return null;
      }

      const discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);

      if (discount < this.minDiscount) {
        this.stats.filteredByDiscount++;
        return null;
      }

      if (this.maxPrice && currentPrice > this.maxPrice) {
        this.stats.filteredByPrice++;
        return null;
      }

      const productUrl = item.permalink;

      if (this.seenLinks.has(productUrl)) {
        this.stats.duplicatesIgnored++;
        return null;
      }

      // Gera link afiliado
      let affiliateLink = null;
      if (mlAffiliate.isAuthenticated()) {
        try {
          affiliateLink = await mlAffiliate.generateAffiliateLink(productUrl);
        } catch (e) {}
      }

      if (!affiliateLink || !this.isRealAffiliateLink(affiliateLink)) {
        this.stats.affiliateLinksFailed++;
        this.stats.skippedNoAffiliate++;
        console.warn(`⏭️  Sem link afiliado, pulando: ${item.title?.substring(0, 50)}`);
        return null;
      }

      this.stats.affiliateLinksSuccess++;
      this.seenLinks.add(productUrl);

      const categoriaFinal = this.searchTerm ? 'Informática' : (this.categoriaInfo?.nome || 'Geral');

      const product = {
        nome:           item.title,
        imagem:         item.thumbnail?.replace('I.jpg', 'O.jpg') || item.thumbnail,
        link_original:  productUrl,
        link_afiliado:  affiliateLink,
        desconto:       `${discount}%`,
        preco:          `R$ ${currentPrice}`,
        preco_anterior: `R$ ${originalPrice}`,
        preco_de:       String(originalPrice),
        preco_para:     String(currentPrice),
        categoria:      categoriaFinal,
        marketplace:    'ML',
        isActive:       true,
      };

      this.stats.productsCollected++;

      if (this.onProductCollected) {
        setImmediate(() => {
          try { this.onProductCollected(product, this.stats.productsCollected, this.limit); } catch (e) {}
        });
      }

      console.log(`✅ [Scraper] ${item.title?.substring(0, 50)} | -${discount}% | R$ ${currentPrice}`);

      return product;

    } catch (error) {
      console.error(`❌ [Scraper] Erro ao processar item: ${error.message}`);
      return null;
    }
  }

  // ─── Entry point principal ────────────────────────────────────────────────
  async scrapeCategory() {
    await this.loadExistingLinks();

    if (mlAffiliate.isAuthenticated()) {
      console.log('⚡ [Scraper] Autenticado — gerando links afiliados via API!\n');
    } else {
      console.log('⚠️  [Scraper] Sem autenticação ML — produtos serão pulados sem link afiliado\n');
    }

    const allProducts = [];
    let offset = 0;
    const batchSize = 50;

    try {
      while (allProducts.length < this.limit) {
        console.log(`📄 Buscando produtos | Coletados: ${allProducts.length}/${this.limit} | offset: ${offset}`);

        const items = await this.fetchProductsFromAPI(offset, batchSize);

        if (!items || items.length === 0) {
          console.log('🏁 Sem mais produtos na API, encerrando');
          break;
        }

        console.log(`   📦 ${items.length} itens recebidos da API`);

        // Processa em paralelo em batches de 5
        const BATCH = 5;
        for (let i = 0; i < items.length; i += BATCH) {
          if (allProducts.length >= this.limit) break;

          const batch = items.slice(i, i + BATCH);
          const results = await Promise.all(batch.map(item => this.processItem(item)));

          for (const p of results) {
            if (p && allProducts.length < this.limit) allProducts.push(p);
          }
        }

        // Se a API retornou menos que o batch, não há mais páginas
        if (items.length < batchSize) {
          console.log('🏁 Última página da API atingida');
          break;
        }

        offset += batchSize;
      }

      console.log(`\n✅ Scraping concluído: ${allProducts.length} produtos coletados`);
      console.log(`   ✅ Links afiliados: ${this.stats.affiliateLinksSuccess}`);
      console.log(`   ⏭️  Pulados sem afiliado: ${this.stats.skippedNoAffiliate}`);
      console.log(`   🔁 Duplicatas ignoradas: ${this.stats.duplicatesIgnored}\n`);

      return allProducts;

    } catch (error) {
      console.error('❌ Erro no scraping:', error.message);
      return allProducts;
    }
  }
}

module.exports = MercadoLivreScraper;