require('dotenv').config();

const connectDB = require('./database/mongodb');
const ScrapingService = require('./services/ScrapingService');

/**
 * AUTOMAÇÃO PRINCIPAL - MULTI-MARKETPLACE
 * 
 * Pode rodar:
 * 1. TODOS os marketplaces de uma vez
 * 2. Apenas um marketplace específico
 * 
 * Uso:
 * - node index.js                    → Roda TODOS
 * - node index.js mercadolivre       → Roda apenas ML
 * - node index.js shopee             → Roda apenas Shopee
 */

(async () => {
  const startTime = Date.now();

  try {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║     🚀 AFFILIATE HUB PRO - MULTI-MARKETPLACE 🚀  ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('\n');

    // Conecta MongoDB
    console.log('🔌 Conectando ao MongoDB...');
    await connectDB();
    console.log('✅ MongoDB conectado!\n');

    // Configurações
    const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT || 30);
    const LIMIT = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    const MODE = process.env.SCRAPING_MODE || 'auto';

    console.log('⚙️  CONFIGURAÇÕES GLOBAIS:');
    console.log(`   └─ Desconto mínimo: ${MIN_DISCOUNT}%`);
    console.log(`   └─ Limite por marketplace: ${LIMIT}`);
    console.log(`   └─ Modo: ${MODE.toUpperCase()}\n`);

    // Inicia scraping service
    const scrapingService = new ScrapingService();

    // Verifica se foi especificado um marketplace específico
    const targetMarketplace = process.argv[2]; // node index.js mercadolivre

    const options = {
      minDiscount: MIN_DISCOUNT,
      limit: LIMIT,
      mode: MODE
    };

    let allProducts = [];
    let marketplacesProcessed = 0;

    // MODO 1: Marketplace específico
    if (targetMarketplace) {
      console.log(`🎯 Executando apenas: ${targetMarketplace.toUpperCase()}\n`);
      
      const products = await scrapingService.collectFromMarketplace(
        targetMarketplace,
        options
      );

      if (products && products.length > 0) {
        allProducts.push(...products);
        await scrapingService.saveProducts(products);
        marketplacesProcessed = 1;
      }
    }
    // MODO 2: Todos os marketplaces
    else {
      console.log('🌐 Executando TODOS os marketplaces\n');
      
      scrapingService.listMarketplaces();

      const results = await scrapingService.collectFromAll(options);

      // Salva produtos de cada marketplace
      for (const [name, result] of Object.entries(results)) {
        if (result.success && result.products.length > 0) {
          console.log(`\n💾 Salvando produtos: ${name}\n`);
          
          await scrapingService.saveProducts(result.products);
          allProducts.push(...result.products);
          marketplacesProcessed++;
        }
      }
    }

    // Resumo geral
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║           ✅ AUTOMAÇÃO CONCLUÍDA ✅              ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(`📊 Marketplaces processados: ${marketplacesProcessed}`);
    console.log(`📦 Total de produtos coletados: ${allProducts.length}`);
    console.log(`⏱️  Tempo total: ${duration}s\n`);

    // Estatísticas por marketplace
    if (!targetMarketplace) {
      console.log('📈 ESTATÍSTICAS POR MARKETPLACE:\n');
      
      const stats = {};
      for (const product of allProducts) {
        stats[product.marketplace] = (stats[product.marketplace] || 0) + 1;
      }

      for (const [marketplace, count] of Object.entries(stats)) {
        console.log(`   ${marketplace}: ${count} produtos`);
      }
      console.log('');
    }

    process.exit(0);

  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════════╗');
    console.error('║                 ❌ ERRO CRÍTICO ❌                ║');
    console.error('╚════════════════════════════════════════════════════╝\n');
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack, '\n');
    
    process.exit(1);
  }
})();