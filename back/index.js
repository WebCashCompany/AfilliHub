require('dotenv').config();

const connectDB = require('./database/mongodb');
const Product = require('./database/models/Product');
const MercadoLivreScraper = require('./scraper/scrapers/MercadoLivreScraper');

(async () => {
  try {
    console.log('🚀 Iniciando automação Affiliate Hub Pro');

    await connectDB();

    const scraper = new MercadoLivreScraper(
      Number(process.env.MIN_DISCOUNT || 30)
    );

    const products = await scraper.scrapeCategory();

    console.log(`📦 Produtos capturados: ${products.length}`);

    for (const product of products) {
      await Product.updateOne(
        { link_afiliado: product.link_afiliado },
        { $set: product },
        { upsert: true }
      );
    }

    console.log(`🟢 ${products.length} produtos salvos no MongoDB`);
    process.exit(0);
  } catch (err) {
    console.error('❌ ERRO GERAL:', err);
    process.exit(1);
  }
})();
