require('dotenv').config();
const { connectDB } = require('../database/mongodb');
const ScrapingService = require('../scraper/services/ScrapingService');
// Importar configurações da amazon
const { getEnabledCategories } = require('../config/categorias-amazon');

/**
 * ═══════════════════════════════════════════════════════════
 * WORKER: amazon BR
 * ═══════════════════════════════════════════════════════════
 */

(async () => {
  const startTime = Date.now();
  
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║           🟠 WORKER: amazon BRASIL 🟠              ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    await connectDB();
    
    // CONFIGURAÇÕES
    const MIN_DISCOUNT = Number(process.env.amazon_MIN_DISCOUNT || 15);
    const TOTAL_PRODUCTS = Number(process.env.amazon_MAX_PRODUCTS || 50);
    const MODE = 'auto';
    
    const scrapingService = new ScrapingService();
    const categories = getEnabledCategories();
    
    console.log(`📋 Categorias habilitadas: ${categories.length}`);
    console.log(`🎯 Meta total: ${TOTAL_PRODUCTS} produtos`);

    // Distribuição Simples (Igualitária)
    let productsPerCategory = {};
    const perCat = Math.ceil(TOTAL_PRODUCTS / categories.length);
    categories.forEach(cat => productsPerCategory[cat.key] = perCat);

    let totalSaved = 0;
    
    for (const category of categories) {
      console.log(`\n🔄 PROCESSANDO: ${category.name.toUpperCase()}`);
      
      const targetProducts = productsPerCategory[category.key];
      let savedInCategory = 0;
      let attempt = 1;
      
      // amazonScraper é chamado internamente pelo ScrapingService 
      // baseado no parâmetro 'amazon' passado abaixo
      while (savedInCategory < targetProducts && attempt <= 2) {
        
        const remaining = targetProducts - savedInCategory;
        console.log(`📌 Tentativa ${attempt} | Buscando ${remaining} produtos...`);

        // IMPORTANTE: O método collectFromMarketplace deve ser capaz de instanciar o amazonScraper
        // Certifique-se que o ScrapingService tem o case 'amazon' no switch/factory
        const products = await scrapingService.collectFromMarketplace('amazon', {
          minDiscount: MIN_DISCOUNT,
          limit: remaining,
          categoryKey: category.key
        });
        
        if (!products || products.length === 0) break;
        
        const result = await scrapingService.saveProducts(products, 'amazon');
        const saved = result.inserted + result.betterOffers;
        savedInCategory += saved;
        totalSaved += saved;
        
        console.log(`📊 Salvos agora: ${saved} | Total Categoria: ${savedInCategory}/${targetProducts}`);
        
        if (saved === 0) break;
        attempt++;
        if (savedInCategory < targetProducts) await new Promise(r => setTimeout(r, 5000));
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🏁 FINALIZADO EM ${duration}s`);
    console.log(`✨ Total Salvo: ${totalSaved}`);
    process.exit(0);

  } catch (error) {
    console.error('❌ ERRO NO WORKER:', error);
    process.exit(1);
  }
})();