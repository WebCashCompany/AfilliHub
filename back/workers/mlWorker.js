require('dotenv').config();
const connectDB = require('../database/mongodb'); 
const ScrapingService = require('../scraper/services/ScrapingService'); 
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
  const startTime = Date.now();
  
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         🟡 WORKER: MERCADO LIVRE INTERATIVO 🟡     ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // --- SELEÇÃO DE CATEGORIA ---
    console.log('--- PASSO 1: ESCOLHA A CATEGORIA ---');
    console.log('1. Tecnologia');
    console.log('2. Beleza');
    console.log('3. Eletrodomesticos');
    console.log('4. Casa');
    console.log('5. Moda');
    console.log('6. Informatica');
    console.log('0. Geral (Todas as ofertas)');
    
    const choice = await question('\nDigite o número ou ID (ex: MLB1051): ');
    
    const categoryMap = {
      '1': 'tecnologia',
      '2': 'beleza',
      '3': 'eletrodomesticos',
      '4': 'casa',
      '5': 'moda',
      '6': 'informatica',
      '0': null
    };

    const selectedCategory = categoryMap[choice] || (choice === '0' ? null : choice);

    // --- SELEÇÃO DE PREÇO (COM OPÇÃO RÁPIDA DE R$ 100) ---
    console.log('\n--- PASSO 2: FILTRO DE PREÇO ---');
    console.log('1. Menos de R$ 100');
    console.log('2. Menos de R$ 50');
    console.log('3. Digitar valor personalizado');
    console.log('0. Sem limite de preço');

    const priceChoice = await question('\nEscolha uma opção: ');
    let selectedMaxPrice = null;

    if (priceChoice === '1') {
      selectedMaxPrice = '100';
    } else if (priceChoice === '2') {
      selectedMaxPrice = '50';
    } else if (priceChoice === '3') {
      selectedMaxPrice = await question('Digite o valor máximo (ex: 150): ');
    }

    console.log('\n🚀 Configurações aplicadas! Iniciando coleta...');

    await connectDB();
    
    const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT || 30);
    const TARGET_PRODUCTS = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    const MODE = process.env.SCRAPING_MODE || 'auto';
    const MAX_ATTEMPTS = 5;

    const scrapingService = new ScrapingService();
    
    let totalSaved = 0;
    let attempt = 0;

    console.log(`\n🎯 OBJETIVO: Salvar ${TARGET_PRODUCTS} produtos NOVOS`);
    console.log(`📌 FILTROS: Cat: ${selectedCategory || 'Geral'} | Preço Máx: R$ ${selectedMaxPrice || 'N/A'}`);

    while (totalSaved < TARGET_PRODUCTS && attempt < MAX_ATTEMPTS) {
      attempt++;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔄 TENTATIVA ${attempt}/${MAX_ATTEMPTS} | Salvos: ${totalSaved}/${TARGET_PRODUCTS}`);
      console.log(`${'='.repeat(60)}\n`);

      const remainingProducts = TARGET_PRODUCTS - totalSaved;
      
      const products = await scrapingService.collectFromMarketplace('mercadolivre', {
        minDiscount: MIN_DISCOUNT,
        limit: remainingProducts,
        mode: MODE,
        category: selectedCategory,
        maxPrice: selectedMaxPrice
      });

      if (!products || products.length === 0) {
        console.log('⚠️ Nenhum produto encontrado nesta tentativa.');
        break;
      }

      const result = await scrapingService.saveProducts(products, 'ML');
      const savedThisRound = result.inserted + result.betterOffers;
      totalSaved += savedThisRound;

      console.log(`📊 Progresso: ${totalSaved}/${TARGET_PRODUCTS} produtos NOVOS salvos`);

      if (totalSaved >= TARGET_PRODUCTS) {
        console.log(`\n✅ OBJETIVO ATINGIDO! ${totalSaved} produtos NOVOS salvos.`);
        break;
      }

      if (savedThisRound === 0) {
        console.log(`\n⚠️ Nenhum produto novo foi salvo nesta tentativa.`);
        break;
      }

      if (totalSaved < TARGET_PRODUCTS && attempt < MAX_ATTEMPTS) {
        console.log(`\n⏳ Aguardando 5 segundos antes da próxima coleta...\n`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏁 PROCESSO FINALIZADO EM ${duration}s`);
    console.log(`${'═'.repeat(60)}\n`);
    
    rl.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    rl.close();
    process.exit(1);
  }
})();