require('dotenv').config();

const { connectDB, getProductConnection } = require('../database/mongodb');
const { getProductModel } = require('../database/models/Products');
const ScrapingService = require('../scraper/services/ScrapingService');
const readline = require('readline');

/**
 * ═══════════════════════════════════════════════════════════════
 * WORKER SHOPEE - VERSÃO INICIAL
 * ═══════════════════════════════════════════════════════════════
 * 
 * ✅ Nova estrutura de database (produtos/shopee)
 * ✅ Sistema de links afiliados
 * ✅ Sistema de tentativas (até 5x)
 * ✅ Seleção interativa
 * ✅ Filtro de preço máximo
 * 
 * MODOS DE USO:
 * 1. Interativo: node workers/shopeeWorker.js
 * 2. Via argumentos: node workers/shopeeWorker.js --preco=100
 */

const rl = readline.createInterface({ 
  input: process.stdin, 
  output: process.stdout 
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

/**
 * Processa argumentos da linha de comando
 */
function parseArguments(args) {
  const result = { maxPrice: null };
  
  for (const arg of args) {
    if (arg.startsWith('--preco=')) {
      result.maxPrice = arg.split('=')[1];
    }
  }
  
  return result;
}

/**
 * Seleção interativa
 */
async function selecionarInterativo() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         🛍️  WORKER SHOPEE BRASIL 🛍️                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  console.log('💰 FILTRO DE PREÇO:');
  console.log('  1. Menos de R$ 50');
  console.log('  2. Menos de R$ 100');
  console.log('  3. Menos de R$ 200');
  console.log('  0. Sem limite\n');
  
  const priceChoice = await question('Escolha: ');
  let maxPrice = null;
  
  switch(priceChoice) {
    case '1': maxPrice = '50'; break;
    case '2': maxPrice = '100'; break;
    case '3': maxPrice = '200'; break;
    default: maxPrice = null;
  }
  
  return { maxPrice };
}

/**
 * Worker Principal
 */
(async () => {
  const startTime = Date.now();
  
  try {
    // ═══════════════════════════════════════════════════════════
    // CONECTAR NO BANCO DE DADOS
    // ═══════════════════════════════════════════════════════════
    console.log('📡 Conectando no banco de dados...\n');
    await connectDB();
    
    const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT || 30);
    const TARGET_PRODUCTS = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    const MAX_ATTEMPTS = 5;
    
    // ═══════════════════════════════════════════════════════════
    // SELEÇÃO DE FILTROS
    // ═══════════════════════════════════════════════════════════
    
    let config;
    const argsConfig = parseArguments(process.argv);
    
    if (argsConfig.maxPrice !== null) {
      config = argsConfig;
      console.log('\n📋 Configuração via argumentos da linha de comando\n');
    } else {
      config = await selecionarInterativo();
      rl.close();
    }
    
    const { maxPrice } = config;
    
    // ═══════════════════════════════════════════════════════════
    // EXIBIÇÃO DA CONFIGURAÇÃO
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║              ⚙️  CONFIGURAÇÕES                      ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(`  🎯 Meta total: ${TARGET_PRODUCTS} produtos`);
    console.log(`  💯 Desconto mínimo: ${MIN_DISCOUNT}%`);
    if (maxPrice) {
      console.log(`  💰 Preço máximo: R$ ${maxPrice}`);
    }
    console.log('');
    
    // ═══════════════════════════════════════════════════════════
    // PROCESSAMENTO
    // ═══════════════════════════════════════════════════════════
    
    const scrapingService = new ScrapingService();
    let totalSaved = 0;
    let totalCollected = 0;
    let attempt = 0;
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🛍️  SHOPEE BRASIL - FLASH DEALS`);
    console.log(`🎯 Meta: ${TARGET_PRODUCTS} produtos`);
    console.log(`${'═'.repeat(70)}\n`);
    
    while (totalSaved < TARGET_PRODUCTS && attempt < MAX_ATTEMPTS) {
      attempt++;
      
      console.log(`🔄 TENTATIVA ${attempt}/${MAX_ATTEMPTS} | Salvos: ${totalSaved}/${TARGET_PRODUCTS}\n`);
      
      const remaining = TARGET_PRODUCTS - totalSaved;
      
      try {
        // Coleta produtos
        const products = await scrapingService.collectFromMarketplace('shopee', {
          minDiscount: MIN_DISCOUNT,
          limit: remaining,
          maxPrice: maxPrice
        });
        
        if (!products || products.length === 0) {
          console.log('⚠️  Nenhum produto encontrado.\n');
          break;
        }
        
        totalCollected += products.length;
        
        // Salva produtos
        const result = await scrapingService.saveProducts(products, 'shopee');
        const savedThisRound = result.inserted + result.betterOffers;
        
        totalSaved += savedThisRound;
        
        console.log(`\n📊 Progresso: ${totalSaved}/${TARGET_PRODUCTS}\n`);
        
        // Verifica se deve continuar
        if (totalSaved >= TARGET_PRODUCTS) {
          console.log(`✅ Meta atingida!\n`);
          break;
        }
        
        if (savedThisRound === 0) {
          console.log(`⚠️  Nenhum produto novo. Avançando...\n`);
          break;
        }
        
        // Aguarda antes da próxima tentativa
        if (totalSaved < TARGET_PRODUCTS && attempt < MAX_ATTEMPTS) {
          console.log(`⏳ Aguardando 3 segundos...\n`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (error) {
        console.error(`❌ Erro na tentativa ${attempt}:`, error.message);
        break;
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // RELATÓRIO FINAL
    // ═══════════════════════════════════════════════════════════
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🏁 PROCESSO FINALIZADO`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`✨ Total de produtos NOVOS: ${totalSaved}/${TARGET_PRODUCTS}`);
    console.log(`📦 Total coletados: ${totalCollected}`);
    console.log(`🔄 Tentativas realizadas: ${attempt}`);
    console.log(`⏱️  Tempo total: ${duration}s`);
    
    if (totalSaved >= TARGET_PRODUCTS) {
      console.log(`\n✅ META ATINGIDA! ${totalSaved} produtos salvos!\n`);
    } else {
      console.log(`\n⚠️  Meta parcial: ${totalSaved}/${TARGET_PRODUCTS} produtos`);
      console.log(`\n💡 DICAS:`);
      console.log(`   • Reduza MIN_DISCOUNT (atual: ${MIN_DISCOUNT}%)`);
      if (maxPrice) {
        console.log(`   • Remova ou aumente o filtro de preço (atual: R$ ${maxPrice})`);
      }
      console.log(`   • Tente novamente mais tarde\n`);
    }
    
    console.log(`${'═'.repeat(70)}\n`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    console.error(error.stack);
    if (rl) rl.close();
    process.exit(1);
  }
})();