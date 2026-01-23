const { chromium } = require('playwright');
const { getProductConnection } = require('../../database/mongodb');
const { getProductModel } = require('../../database/models/Products');
const { getCategoria } = require('../../config/categorias-ml');
const path = require('path');
const fs = require('fs');

/**
 * ═══════════════════════════════════════════════════════════════
 * MERCADO LIVRE SCRAPER - VERSÃO AFILIADO GARANTIDA
 * ═══════════════════════════════════════════════════════════════
 * * ✅ Diferencia botões de compartilhar (Foca no Afiliado)
 * ✅ Extração via seletor de ID/Link curto /sec/
 * ✅ Lógica de Melhor Oferta e Cache de Banco de Dados
 */

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
      const products = await Product.find({}).select('link_original nome desconto preco_para preco_de isActive marketplace categoria').lean();
      
      products.forEach(p => {
        if (p.link_original) {
          p.desconto = String(p.desconto || '0').replace(/\D/g, '');
          p.preco_para = String(p.preco_para || '0').replace(/\D/g, '');
          this.existingProductsMap.set(p.link_original, p);
        }
      });
      console.log(`   ✅ ${this.existingProductsMap.size} produtos no cache\n`);
    } catch (error) {
      console.error('⚠️  Erro ao carregar banco:', error.message);
    }
  }

  normalizeProductName(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  isBetterOffer(newProd, existingProd) {
    const newDisc = parseInt(newProd.desconto) || 0;
    const oldDisc = parseInt(existingProd.desconto) || 0;
    const newP = parseInt(newProd.preco_para) || 0;
    const oldP = parseInt(existingProd.preco_para) || 0;
    return newDisc > oldDisc || (newDisc === oldDisc && newP < oldP);
  }

  async processProduct(product, collectedProducts) {
    const normName = this.normalizeProductName(product.nome);
    const isDupMem = collectedProducts.some(p => p.link_original === product.link_original || this.normalizeProductName(p.nome).substring(0, 20) === normName.substring(0, 20));

    if (isDupMem) return { action: 'skip', reason: 'duplicate' };
    const existing = this.existingProductsMap.get(product.link_original);
    if (!existing) return { action: 'add', reason: 'new' };
    return this.isBetterOffer(product, existing) ? { action: 'update', reason: 'better', oldLink: product.link_original } : { action: 'skip', reason: 'worse' };
  }

  async createBrowserContext() {
    const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
    const contextOptions = { viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
    if (fs.existsSync(this.sessionPath)) contextOptions.storageState = this.sessionPath;
    const context = await browser.newContext(contextOptions);
    return { browser, context };
  }

  /**
   * 🎯 PEGA LINK AFILIADO (FOCO NA BARRA DE FERRAMENTAS)
   */
  async getShareLink(page) {
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      
      // 1. Localiza o botão "Compartilhar" ESPECÍFICO da barra de afiliados
      // O botão de anúncio comum não tem o texto "GANHOS" por perto.
      const affiliateShareBtn = page.locator('div:has-text("GANHOS") button:has-text("Compartilhar"), #affiliates-toolkit button, .affiliates-toolkit__share-button').first();
      
      if (!(await affiliateShareBtn.isVisible())) {
        // Fallback: busca qualquer botão que NÃO esteja na área principal do produto (ui-pdp)
        const allShareButtons = await page.locator('button:has-text("Compartilhar")').all();
        for(const btn of allShareButtons) {
          const isMainShare = await btn.evaluate(el => el.closest('.ui-pdp-container'));
          if(!isMainShare) {
            await btn.click();
            break;
          }
        }
      } else {
        await affiliateShareBtn.click();
      }

      await page.waitForTimeout(2000);

      // 2. Extração via Varredura no Modal de Afiliado
      const shareLink = await page.evaluate(() => {
        const modal = document.querySelector('.andes-modal-content');
        if (!modal) return null;
        
        // Busca o input que contém o link curto exclusivo de afiliado
        const input = Array.from(modal.querySelectorAll('input')).find(i => i.value.includes('mercadolivre.com/sec'));
        return input ? input.value : null;
      });

      await page.keyboard.press('Escape');
      return shareLink;
    } catch (error) {
      console.log(`   ❌ Erro de Captura: ${error.message.substring(0, 50)}`);
      await page.keyboard.press('Escape').catch(() => {});
      return null;
    }
  }

  async scrapeCategory() {
    await this.loadExistingProducts();
    const { browser, context } = await this.createBrowserContext();
    const page = await context.newPage();
    
    let allProducts = [];
    let pageNum = 1;
    const affiliateId = process.env.ML_AFFILIATE_ID || '77997172';

    try {
      while (allProducts.length < this.limit && pageNum <= 50) {
        let url = this.categoriaInfo.url;
        if (pageNum > 1) url += (url.includes('?') ? '&' : '?') + `_Desde_${(pageNum - 1) * 48 + 1}`;

        console.log(`📄 Pág ${pageNum} ${this.getProgressBar(allProducts.length, this.limit)}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(() => window.scrollBy(0, 800));

        const links = await page.evaluate(({ minDisc, maxP }) => {
          return Array.from(document.querySelectorAll('.poly-card, .ui-search-result')).map(item => {
            const disc = parseInt(item.querySelector('[class*="discount"]')?.innerText.replace(/\D/g, '') || '0');
            const price = parseInt(item.querySelector('.andes-money-amount__fraction')?.innerText.replace(/\./g, '') || '0');
            return (disc >= minDisc && (!maxP || price <= maxP)) ? item.querySelector('a')?.href.split('?')[0] : null;
          }).filter(l => l);
        }, { minDisc: this.minDiscount, maxP: this.maxPrice });

        for (const link of links) {
          if (allProducts.length >= this.limit) break;
          try {
            await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
            const correctLink = await this.getShareLink(page);
            if (!correctLink) continue;

            const data = await page.evaluate((cat) => ({
              nome: document.querySelector('h1.ui-pdp-title')?.innerText.trim(),
              imagem: document.querySelector('img.ui-pdp-image')?.src,
              preco_para: document.querySelector('.andes-money-amount__fraction')?.innerText.replace(/\D/g, ''),
              preco_de: document.querySelectorAll('.andes-money-amount__fraction')[1]?.innerText.replace(/\D/g, '') || '0',
              desconto: document.querySelector('.andes-money-amount__discount')?.innerText || '0%',
              categoria: cat, marketplace: 'ML', isActive: true
            }), this.categoriaInfo.nome);

            data.link_original = correctLink;
            data.link_afiliado = `${correctLink}${correctLink.includes('?') ? '&' : '?'}matt_tool=${affiliateId}&utm_source=affiliate&utm_medium=webcash`;

            const res = await this.processProduct(data, allProducts);
            if (res.action !== 'skip') {
              if (res.action === 'update') data._shouldUpdate = true;
              allProducts.push(data);
              console.log(`   ✨ [${allProducts.length}/${this.limit}] ${data.nome.substring(0, 40)}`);
            }
          } catch (e) { console.log("   ❌ Erro no produto..."); }
        }
        pageNum++;
      }
    } finally { await browser.close(); }
    return allProducts;
  }

  getProgressBar(current, total) {
    const pct = Math.min(100, Math.round((current / total) * 100));
    return `[${'█'.repeat(Math.floor(pct / 5))}${'░'.repeat(20 - Math.floor(pct / 5))}] ${pct}%`;
  }
}

module.exports = MercadoLivreScraper;