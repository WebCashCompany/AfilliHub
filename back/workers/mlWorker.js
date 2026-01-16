require('dotenv').config();
const connectDB = require('../database/mongodb'); 
const ScrapingService = require('../scraper/services/ScrapingService'); 

(async () => {
  const startTime = Date.now();
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         🟡 WORKER: MERCADO LIVRE 🟡                ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    await connectDB();
    
    const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT || 30);
    const LIMIT = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    const MODE = process.env.SCRAPING_MODE || 'auto';

    const scrapingService = new ScrapingService();

    const products = await scrapingService.collectFromMarketplace('mercadolivre', {
      minDiscount: MIN_DISCOUNT,
      limit: LIMIT,
      mode: MODE
    });

    if (products && products.length > 0) {
      await scrapingService.saveProducts(products, 'ML');
    } else {
      console.log('⚠️ Nenhum produto encontrado.');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️ Tempo total: ${duration}s\n`);
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    process.exit(1);
  }
})();