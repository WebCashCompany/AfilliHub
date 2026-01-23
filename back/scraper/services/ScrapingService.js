/**
 * ═══════════════════════════════════════════════════════════════════════
 * SCRAPING SERVICE - ENTERPRISE EDITION
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Serviço unificado para coleta de produtos de múltiplos marketplaces
 * Sistema de cache, validação e salvamento otimizado
 * 
 * @version 2.0.0
 * @author Dashboard Promoforia
 * @license Proprietary
 */

const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const MercadoLivreScraper = require('../scrapers/MercadoLivreScraper');
const { getCategoria } = require('../../config/categorias-ml');

// Scrapers opcionais
let MagaluScraper, ShopeeScraper;

try {
  MagaluScraper = require('../scrapers/MagaluScraper');
} catch (e) {
  console.warn('⚠️  MagaluScraper não disponível');
}

try {
  ShopeeScraper = require('../scrapers/ShopeeScraper');
} catch (e) {
  console.warn('⚠️  ShopeeScraper não disponível');
}

class ScrapingService {
  constructor() {
    this.marketplaces = new Map();
    this.initializeMarketplaces();
  }

  /**
   * Inicializa scrapers de marketplaces disponíveis
   */
  initializeMarketplaces() {
    // ═══════════════════════════════════════════════════════════
    // MERCADO LIVRE
    // ═══════════════════════════════════════════════════════════
    try {
      const mlConfig = {
        name: 'Mercado Livre',
        code: 'ML',
        scraper: new MercadoLivreScraper(),
        enabled: true
      };
      
      // Registra com múltiplos aliases para compatibilidade
      this.marketplaces.set('mercadolivre', mlConfig);
      this.marketplaces.set('ML', mlConfig);
      this.marketplaces.set('ml', mlConfig);
      
    } catch (error) {
      console.error('⚠️  Mercado Livre não disponível:', error.message);
    }

    // ═══════════════════════════════════════════════════════════
    // MAGAZINE LUIZA
    // ═══════════════════════════════════════════════════════════
    if (MagaluScraper) {
      try {
        const magaluConfig = {
          name: 'Magazine Luiza',
          code: 'MAGALU',
          scraper: new MagaluScraper(),
          enabled: true
        };
        
        this.marketplaces.set('magalu', magaluConfig);
        this.marketplaces.set('MAGALU', magaluConfig);
        
      } catch (error) {
        console.error('⚠️  Magazine Luiza não disponível:', error.message);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // SHOPEE
    // ═══════════════════════════════════════════════════════════
    if (ShopeeScraper) {
      try {
        const shopeeConfig = {
          name: 'Shopee Brasil',
          code: 'shopee',
          scraper: new ShopeeScraper(),
          enabled: true
        };
        
        this.marketplaces.set('shopee', shopeeConfig);
        this.marketplaces.set('Shopee', shopeeConfig);
        
      } catch (error) {
        console.error('⚠️  Shopee não disponível:', error.message);
      }
    }
  }

  /**
   * Coleta produtos de um marketplace específico
   */
  async collectFromMarketplace(marketplaceName, options = {}) {
    const { 
      minDiscount = 30, 
      limit = 50, 
      categoria = null,
      categoryKey = null,
      maxPrice = null 
    } = options;

    // Busca marketplace (case-insensitive)
    const marketplace = this.marketplaces.get(marketplaceName) || 
                        this.marketplaces.get(marketplaceName.toLowerCase()) ||
                        this.marketplaces.get(marketplaceName.toUpperCase());

    if (!marketplace) {
      throw new Error(`Marketplace "${marketplaceName}" não encontrado. Disponíveis: ${Array.from(this.marketplaces.keys()).join(', ')}`);
    }

    if (!marketplace.enabled) {
      throw new Error(`Marketplace "${marketplace.name}" está desabilitado`);
    }

    console.log(`\n🚀 INICIANDO COLETA: ${marketplace.name.toUpperCase()}`);
    
    // Exibe filtros ativos
    const filters = [];
    if (categoria) filters.push(`Categoria: ${categoria}`);
    if (categoryKey) filters.push(`Categoria Key: ${categoryKey}`);
    if (maxPrice) filters.push(`Preço Máx: R$ ${maxPrice}`);
    if (filters.length > 0) {
      console.log(`🎯 FILTROS: ${filters.join(' | ')}`);
    }

    console.log('🟡 Iniciando Web Scraper (Playwright)...\n');
    
    // ═══════════════════════════════════════════════════════════
    // CONFIGURAÇÃO DO SCRAPER
    // ═══════════════════════════════════════════════════════════
    marketplace.scraper.minDiscount = minDiscount;
    marketplace.scraper.limit = limit;
    marketplace.scraper.maxPrice = maxPrice;
    
    // Configuração específica por marketplace
    if (marketplace.code === 'ML' && categoria) {
      const categoriaInfo = getCategoria(categoria);
      if (categoriaInfo) {
        marketplace.scraper.categoriaKey = categoria;
        marketplace.scraper.categoriaInfo = categoriaInfo;
      } else {
        console.warn(`⚠️  Categoria "${categoria}" não encontrada, usando padrão`);
      }
    }
    
    if (marketplace.code === 'MAGALU' && categoryKey) {
      if (typeof marketplace.scraper.setCategory === 'function') {
        marketplace.scraper.setCategory(categoryKey);
      }
    }
    
    // Executa scraping
    const products = await marketplace.scraper.scrapeCategory();
    
    console.log(`✅ Scraping concluído: ${products.length} produtos coletados\n`);

    // ═══════════════════════════════════════════════════════════
    // VALIDAÇÃO E PROCESSAMENTO DE LINKS
    // ═══════════════════════════════════════════════════════════
    if (products.length > 0) {
      console.log(`🔗 Processando ${products.length} links de afiliado...\n`);
      
      let processados = 0;
      
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        
        // ═════════════════════════════════════════════════════════
        // IMPORTANTE: Para ML, o link já vem pronto do scraper
        // NÃO modificamos, apenas usamos como está
        // ═════════════════════════════════════════════════════════
        if (marketplace.code === 'ML') {
          // Link já vem correto do getAffiliateLink()
          if (!product.link_afiliado) {
            product.link_afiliado = product.link_original;
          }
          processados++;
          
          if (i < 3) {
            console.log(`   [${i + 1}] ${product.nome.substring(0, 40)}...`);
            console.log(`       🔗 ${product.link_afiliado.substring(0, 80)}...`);
          }
        } 
        // ═════════════════════════════════════════════════════════
        // OUTROS MARKETPLACES: Adiciona parâmetros de afiliado
        // ═════════════════════════════════════════════════════════
        else if (marketplace.code === 'MAGALU') {
          const separator = product.link_original.includes('?') ? '&' : '?';
          product.link_afiliado = `${product.link_original}${separator}utm_source=webcash&utm_medium=affiliate`;
          processados++;
          
        } else if (marketplace.code === 'shopee') {
          const separator = product.link_original.includes('?') ? '&' : '?';
          const affiliateId = process.env.SHOPEE_AFFILIATE_ID || '18182230010';
          product.link_afiliado = `${product.link_original}${separator}af_siteid=${affiliateId}&pid=affiliates&af_click_lookback=7d`;
          processados++;
          
          if (i < 3) {
            console.log(`   [${i + 1}] ${product.nome.substring(0, 40)}...`);
            console.log(`       🔗 ${product.link_afiliado.substring(0, 80)}...`);
          }
        } else {
          product.link_afiliado = product.link_original;
          processados++;
        }
      }

      if (processados < products.length) {
        console.log(`   ...e mais ${products.length - 3} produtos\n`);
      }
      
      console.log(`✅ ${processados} links processados\n`);
    }

    return products;
  }

  /**
   * Salva produtos no banco de dados com detecção de duplicatas
   */
  async saveProducts(products, marketplaceCode = 'ML') {
    console.log(`\n💾 Salvando no MongoDB (Marketplace: ${marketplaceCode})...`);
    
    const conn = getProductConnection();
    const Product = getProductModel(marketplaceCode, conn);
    
    const stats = {
      inserted: 0,
      updated: 0,
      duplicates: 0,
      errors: 0,
      betterOffers: 0,
      totalSaved: 0
    };

    for (const product of products) {
      try {
        // Validação básica
        if (!product.link_afiliado || product.link_afiliado.length < 20) {
          console.log(`   ⚠️  Produto sem link válido: ${product.nome.substring(0, 40)}...`);
          stats.errors++;
          continue;
        }

        const normalizedName = this.normalizeProductName(product.nome);
        
        // ═══════════════════════════════════════════════════════
        // ATUALIZAÇÃO DE OFERTA MELHOR
        // ═══════════════════════════════════════════════════════
        if (product._shouldUpdate) {
          const query = { link_afiliado: product._oldLink || product.link_afiliado };
          const existing = await Product.findOne(query);

          if (existing) {
            const { _shouldUpdate, _oldLink, ...cleanProduct } = product;
            
            await Product.updateOne(
              { _id: existing._id }, 
              { 
                $set: { 
                  ...cleanProduct, 
                  nome_normalizado: normalizedName,
                  ultima_verificacao: new Date(),
                  updatedAt: new Date(), 
                  isActive: true 
                } 
              }
            );
            
            stats.betterOffers++;
            console.log(`   🔥 MELHOR OFERTA: ${product.nome.substring(0, 35)}... (${product.desconto})`);
          } else {
            // Produto não existe, cria novo
            const { _shouldUpdate, _oldLink, ...cleanProduct } = product;
            
            await Product.create({ 
              ...cleanProduct, 
              nome_normalizado: normalizedName,
              ultima_verificacao: new Date(),
              createdAt: new Date() 
            });
            
            stats.inserted++;
            console.log(`   ✨ NOVO: ${product.nome.substring(0, 40)}...`);
          }
        } 
        // ═══════════════════════════════════════════════════════
        // PRODUTO NORMAL (verificar se já existe)
        // ═══════════════════════════════════════════════════════
        else {
          const query = { link_afiliado: product.link_afiliado };
          const existing = await Product.findOne(query);

          if (existing) {
            // Atualiza produto existente
            await Product.updateOne(
              { _id: existing._id }, 
              { 
                $set: { 
                  ...product, 
                  nome_normalizado: normalizedName,
                  ultima_verificacao: new Date(),
                  updatedAt: new Date(), 
                  isActive: true 
                } 
              }
            );
            stats.updated++;
          } else {
            // Cria novo produto
            await Product.create({ 
              ...product, 
              nome_normalizado: normalizedName,
              ultima_verificacao: new Date(),
              createdAt: new Date() 
            });
            
            stats.inserted++;
            console.log(`   ✨ NOVO: ${product.nome.substring(0, 40)}...`);
          }
        }
      } catch (err) {
        if (err.code === 11000) {
          stats.duplicates++;
          console.log(`   ⏭️  Duplicata: ${product.nome.substring(0, 40)}...`);
        } else {
          stats.errors++;
          console.error(`   ❌ Erro: ${product.nome.substring(0, 30)}... - ${err.message}`);
        }
      }
    }

    stats.totalSaved = stats.inserted + stats.betterOffers;

    // Relatório
    console.log(`\n╔═══════════════════════════════════════╗`);
    console.log(`║         📊 RESULTADO FINAL 📊         ║`);
    console.log(`╚═══════════════════════════════════════╝`);
    console.log(`✨ Novos produtos: ${stats.inserted}`);
    console.log(`🔥 Ofertas melhoradas: ${stats.betterOffers}`);
    console.log(`📝 Atualizados: ${stats.updated}`);
    console.log(`⏭️  Duplicatas: ${stats.duplicates}`);
    console.log(`❌ Erros: ${stats.errors}`);
    console.log(`📦 Total processados: ${products.length}`);
    
    if (stats.totalSaved < products.length) {
      const ignorados = products.length - stats.totalSaved - stats.updated;
      console.log(`\n⚠️  ${ignorados} produtos foram ignorados (duplicatas ou ofertas piores)`);
    }
    console.log('');

    return stats;
  }

  /**
   * Normaliza nome do produto para comparação
   */
  normalizeProductName(name) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 5)
      .join(' ');
  }

  /**
   * Lista marketplaces disponíveis
   */
  listMarketplaces() {
    console.log('\n📋 MARKETPLACES DISPONÍVEIS:\n');
    
    const unique = new Set();
    for (const [key, mp] of this.marketplaces.entries()) {
      if (!unique.has(mp.code)) {
        console.log(`   ${mp.enabled ? '✅' : '❌'} ${mp.name} (${mp.code})`);
        unique.add(mp.code);
      }
    }
    console.log('');
  }

  /**
   * Coleta de todos os marketplaces (paralelo ou sequencial)
   */
  async collectFromAll(options = {}) {
    const results = {};
    const unique = new Set();
    
    for (const [key, mp] of this.marketplaces.entries()) {
      if (!mp.enabled || unique.has(mp.code)) continue;
      unique.add(mp.code);
      
      try {
        console.log(`\n${'═'.repeat(70)}`);
        const products = await this.collectFromMarketplace(key, options);
        results[mp.code] = {
          success: true,
          products,
          count: products.length
        };
      } catch (error) {
        results[mp.code] = {
          success: false,
          error: error.message,
          count: 0
        };
        console.error(`\n❌ Erro em ${mp.name}: ${error.message}\n`);
      }
    }
    
    return results;
  }
}

module.exports = ScrapingService;