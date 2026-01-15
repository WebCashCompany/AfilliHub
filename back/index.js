require('dotenv').config();

const MercadoLivreScraper = require('./scraper/scrapers/MercadoLivreScraper');


(async () => {
    try {
        console.log('🚀 Iniciando automação Affiliate Hub Pro');

        const minDiscount = Number(process.env.MIN_DISCOUNT || 30);
        const maxProducts = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);

        const scraper = new MercadoLivreScraper(minDiscount);

        const produtos = await scraper.scrapeCategory(null, maxProducts);

        console.log(`✅ Automação finalizada`);
        console.log(`📦 Produtos capturados: ${produtos.length}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Erro na automação:', err);
        process.exit(1);
    }
})();
