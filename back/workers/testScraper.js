const connectDB = require('../database/mongodb');
const ScrapingService = require('../scraper/services/ScrapingService');
require('dotenv').config();

async function main() {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    await connectDB();

    console.log('🚀 Iniciando scraping de teste do Mercado Livre...\n');
    
    const result = await ScrapingService.scrapeMarketplaces(
      ['ML'],
      30
    );

    console.log('\n📊 RESULTADO FINAL:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n✅ Teste concluído com sucesso!');
    console.log('\n💡 Dica: Confira os produtos no MongoDB Compass!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error);
    process.exit(1);
  }
}

main();