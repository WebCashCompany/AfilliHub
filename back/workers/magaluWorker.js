require('dotenv').config();
const { connectDB } = require('../database/mongodb'); // ← CORREÇÃO AQUI: usa destructuring { }
const ScrapingService = require('../scraper/services/ScrapingService'); 

(async () => {
  const startTime = Date.now();
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         🔵 WORKER: MAGAZINE LUIZA 🔵               ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    await connectDB();
    
    const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT || 30);
    const TARGET_PRODUCTS = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    const MODE = process.env.SCRAPING_MODE || 'auto';
    const MAX_ATTEMPTS = 5;

    const scrapingService = new ScrapingService();
    
    let totalSaved = 0;
    let attempt = 0;

    console.log(`🎯 OBJETIVO: Salvar ${TARGET_PRODUCTS} produtos NOVOS no banco\n`);

    while (totalSaved < TARGET_PRODUCTS && attempt < MAX_ATTEMPTS) {
      attempt++;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔄 TENTATIVA ${attempt}/${MAX_ATTEMPTS} | Salvos até agora: ${totalSaved}/${TARGET_PRODUCTS}`);
      console.log(`${'='.repeat(60)}\n`);

      // Calcula quantos produtos ainda faltam
      const remainingProducts = TARGET_PRODUCTS - totalSaved;
      
      console.log(`📌 Faltam ${remainingProducts} produtos para atingir a meta\n`);

      // Coleta APENAS a quantidade necessária
      const products = await scrapingService.collectFromMarketplace('magalu', {
        minDiscount: MIN_DISCOUNT,
        limit: remainingProducts,
        mode: MODE
      });

      if (!products || products.length === 0) {
        console.log('⚠️  Nenhum produto encontrado nesta tentativa.');
        break;
      }

      // Salva produtos
      const result = await scrapingService.saveProducts(products, 'MAGALU');
      
      // Conta APENAS produtos NOVOS (inserted + betterOffers)
      const savedThisRound = result.inserted + result.betterOffers;
      totalSaved += savedThisRound;

      console.log(`📊 Progresso: ${totalSaved}/${TARGET_PRODUCTS} produtos NOVOS salvos`);

      // Se já atingiu o objetivo, para
      if (totalSaved >= TARGET_PRODUCTS) {
        console.log(`\n✅ OBJETIVO ATINGIDO! ${totalSaved} produtos NOVOS salvos no banco.`);
        break;
      }

      // Se não conseguiu salvar NENHUM produto novo, para
      if (savedThisRound === 0) {
        console.log(`\n⚠️  Nenhum produto novo foi salvo nesta tentativa.`);
        console.log(`   Todos os produtos encontrados já existem no banco com ofertas iguais/melhores.`);
        console.log(`   Considere:`);
        console.log(`   • Reduzir MIN_DISCOUNT (atual: ${MIN_DISCOUNT}%)`);
        console.log(`   • Limpar produtos antigos do banco`);
        console.log(`   • Aguardar novas ofertas do Magazine Luiza`);
        break;
      }

      // Aguarda antes da próxima tentativa
      if (totalSaved < TARGET_PRODUCTS && attempt < MAX_ATTEMPTS) {
        console.log(`\n⏳ Aguardando 5 segundos antes da próxima coleta...\n`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏁 PROCESSO FINALIZADO`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`✨ Total de produtos NOVOS salvos: ${totalSaved}/${TARGET_PRODUCTS}`);
    console.log(`🔄 Tentativas realizadas: ${attempt}/${MAX_ATTEMPTS}`);
    console.log(`⏱️  Tempo total: ${duration}s`);
    
    if (totalSaved < TARGET_PRODUCTS) {
      console.log(`\n⚠️  ATENÇÃO: Não foi possível atingir a meta de ${TARGET_PRODUCTS} produtos.`);
      console.log(`   Foram salvos ${totalSaved} produtos novos.`);
    }
    
    console.log(`${'═'.repeat(60)}\n`);
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();