/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE WORKER - ENTERPRISE EDITION
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Worker profissional para coleta de ofertas do Mercado Livre
 * Sistema de retry automático e distribuição inteligente de produtos
 * 
 * @version 2.0.0
 * @author Dashboard Promoforia
 * @license Proprietary
 * 
 * MODOS DE USO:
 * 1. Interativo: node workers/mlWorker.js
 * 2. Via argumentos: node workers/mlWorker.js --categorias=informatica,games --preco=100
 */

require('dotenv').config();

const { connectDB, getProductConnection } = require('../database/mongodb');
const { getProductModel } = require('../database/models/Products');
const ScrapingService = require('../scraper/services/ScrapingService');
const readline = require('readline');

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════

const CONFIG = {
  MIN_DISCOUNT: Number(process.env.MIN_DISCOUNT || 30),
  TARGET_PRODUCTS: Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50),
  MAX_ATTEMPTS: 5,
  RETRY_DELAY: 3000,
  MIN_PRODUCTS_TO_CONTINUE: 1
};

// Mapeamento de categorias
const CATEGORIES = {
  '1': { key: 'celulares', name: 'Celulares', emoji: '📱' },
  '2': { key: 'beleza', name: 'Beleza', emoji: '💄' },
  '3': { key: 'eletrodomesticos', name: 'Eletrodomésticos', emoji: '🏠' },
  '4': { key: 'casa_decoracao', name: 'Casa e Decoração', emoji: '🛋️' },
  '5': { key: 'calcados_roupas', name: 'Calçados e Roupas', emoji: '👟' },
  '6': { key: 'informatica', name: 'Informática', emoji: '💻' },
  '7': { key: 'games', name: 'Games', emoji: '🎮' },
  '8': { key: 'eletronicos', name: 'Eletrônicos', emoji: '📱' },
  '9': { key: 'joias_relogios', name: 'Joias e Relógios', emoji: '⌚' },
  '10': { key: 'esportes', name: 'Esportes', emoji: '⚽' },
  '11': { key: 'ferramentas', name: 'Ferramentas', emoji: '🔧' },
  '12': { key: 'ofertas_dia', name: 'Ofertas do Dia', emoji: '🌟' },
  '13': { key: 'ofertas_relampago', name: 'Ofertas Relâmpago', emoji: '⚡' }
};

const PRICE_FILTERS = {
  '1': { value: '50', label: 'Menos de R$ 50' },
  '2': { value: '100', label: 'Menos de R$ 100' },
  '3': { value: '200', label: 'Menos de R$ 200' },
  '0': { value: null, label: 'Sem limite' }
};

// ═══════════════════════════════════════════════════════════════════════
// INTERFACE
// ═══════════════════════════════════════════════════════════════════════

const rl = readline.createInterface({ 
  input: process.stdin, 
  output: process.stdout 
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

/**
 * Parser de argumentos da linha de comando
 */
function parseArguments(args) {
  const result = { categorias: null, maxPrice: null };
  
  for (const arg of args) {
    if (arg.startsWith('--categorias=')) {
      const valor = arg.split('=')[1];
      if (valor.toLowerCase() === 'todas') {
        result.categorias = Object.values(CATEGORIES).map(c => c.key);
      } else {
        result.categorias = valor.split(',').map(c => c.trim());
      }
    } else if (arg.startsWith('--preco=')) {
      result.maxPrice = arg.split('=')[1];
    }
  }
  
  return result;
}

/**
 * Interface interativa de seleção
 */
async function selecionarInterativo() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         🚀 WORKER MERCADO LIVRE 🚀                 ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  console.log('📂 CATEGORIAS DISPONÍVEIS:\n');
  Object.entries(CATEGORIES).forEach(([num, cat]) => {
    console.log(`  ${num.padStart(2, ' ')}. ${cat.emoji} ${cat.name}`);
  });
  console.log('  A.  🎯 TODAS AS CATEGORIAS\n');
  
  const inputCat = await question('Digite os números separados por vírgula (ex: 1,6,7) ou A: ');
  
  let selectedCats = [];
  if (inputCat.toUpperCase() === 'A' || !inputCat.trim()) {
    selectedCats = Object.values(CATEGORIES).map(c => c.key);
  } else {
    selectedCats = inputCat
      .split(',')
      .map(i => CATEGORIES[i.trim()]?.key)
      .filter(Boolean);
  }
  
  if (selectedCats.length === 0) {
    console.log('⚠️  Nenhuma categoria válida selecionada. Usando TODAS.\n');
    selectedCats = Object.values(CATEGORIES).map(c => c.key);
  }
  
  console.log('\n💰 FILTRO DE PREÇO:\n');
  Object.entries(PRICE_FILTERS).forEach(([num, filter]) => {
    console.log(`  ${num}. ${filter.label}`);
  });
  console.log('');
  
  const priceChoice = await question('Escolha: ');
  const maxPrice = PRICE_FILTERS[priceChoice]?.value || null;
  
  return { categorias: selectedCats, maxPrice };
}

/**
 * Exibe configuração do scraping
 */
function displayConfiguration(selectedCats, maxPrice) {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║              ⚙️  CONFIGURAÇÕES                      ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`  🎯 Meta total: ${CONFIG.TARGET_PRODUCTS} produtos`);
  console.log(`  💯 Desconto mínimo: ${CONFIG.MIN_DISCOUNT}%`);
  console.log(`  📁 Categorias: ${selectedCats.length}`);
  if (maxPrice) {
    console.log(`  💰 Preço máximo: R$ ${maxPrice}`);
  }
  console.log(`  🔄 Tentativas por categoria: ${CONFIG.MAX_ATTEMPTS}`);
  
  const limitPerCat = Math.max(1, Math.floor(CONFIG.TARGET_PRODUCTS / selectedCats.length));
  console.log(`\n📊 Distribuição: ~${limitPerCat} produtos por categoria\n`);
  
  return limitPerCat;
}

/**
 * Processa uma categoria individual
 */
async function processCategory(scrapingService, categoria, limitPerCat, maxPrice, categoryIndex, totalCategories) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📁 CATEGORIA ${categoryIndex}/${totalCategories}: ${categoria.toUpperCase()}`);
  console.log(`🎯 Meta: ${limitPerCat} produtos`);
  console.log(`${'═'.repeat(70)}\n`);
  
  let savedInCategory = 0;
  let collectedInCategory = 0;
  let attempt = 0;
  let consecutiveZeros = 0;
  
  while (savedInCategory < limitPerCat && attempt < CONFIG.MAX_ATTEMPTS) {
    attempt++;
    
    console.log(`🔄 TENTATIVA ${attempt}/${CONFIG.MAX_ATTEMPTS} | Salvos: ${savedInCategory}/${limitPerCat}\n`);
    
    const remaining = limitPerCat - savedInCategory;
    
    try {
      // Coleta produtos
      const products = await scrapingService.collectFromMarketplace('ML', {
        minDiscount: CONFIG.MIN_DISCOUNT,
        limit: remaining,
        categoria: categoria,
        maxPrice: maxPrice
      });
      
      if (!products || products.length === 0) {
        consecutiveZeros++;
        console.log(`⚠️  Nenhum produto coletado. (${consecutiveZeros}ª vez sem resultados)\n`);
        
        if (consecutiveZeros >= 2) {
          console.log(`⏭️  Encerrando categoria após ${consecutiveZeros} tentativas sem resultados.\n`);
          break;
        }
        
        continue;
      }
      
      consecutiveZeros = 0;
      collectedInCategory += products.length;
      
      console.log(`📦 ${products.length} produtos coletados, salvando no banco...\n`);
      
      // Salva produtos
      const result = await scrapingService.saveProducts(products, 'ML');
      const savedThisRound = result.inserted + result.betterOffers;
      
      savedInCategory += savedThisRound;
      
      console.log(`\n📊 Resultado:`);
      console.log(`   ├─ Novos: ${result.inserted}`);
      console.log(`   ├─ Ofertas melhores: ${result.betterOffers}`);
      console.log(`   ├─ Duplicados: ${result.duplicates}`);
      console.log(`   └─ Erros: ${result.errors}`);
      console.log(`\n📈 Progresso: ${savedInCategory}/${limitPerCat} (${Math.round((savedInCategory/limitPerCat)*100)}%)\n`);
      
      // Verifica se deve continuar
      if (savedInCategory >= limitPerCat) {
        console.log(`✅ Meta da categoria atingida!\n`);
        break;
      }
      
      if (savedThisRound < CONFIG.MIN_PRODUCTS_TO_CONTINUE) {
        console.log(`⚠️  Poucos produtos novos (${savedThisRound}). Continuando busca...\n`);
      }
      
      // Aguarda antes da próxima tentativa
      if (savedInCategory < limitPerCat && attempt < CONFIG.MAX_ATTEMPTS) {
        const delay = CONFIG.RETRY_DELAY / 1000;
        console.log(`⏳ Aguardando ${delay} segundos antes da próxima tentativa...\n`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      }
      
    } catch (error) {
      console.error(`\n❌ Erro na categoria ${categoria}:`);
      console.error(`   ${error.message}`);
      console.error(`\n⏭️  Pulando para próxima tentativa...\n`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return {
    meta: limitPerCat,
    salvos: savedInCategory,
    coletados: collectedInCategory,
    tentativas: attempt,
    percentual: Math.round((savedInCategory / limitPerCat) * 100)
  };
}

/**
 * Exibe relatório final
 */
function displayFinalReport(resultados, totalSaved, totalCollected, selectedCats, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🏁 PROCESSO FINALIZADO`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`✨ Total de produtos NOVOS salvos: ${totalSaved}/${CONFIG.TARGET_PRODUCTS}`);
  console.log(`📦 Total coletados: ${totalCollected}`);
  console.log(`📁 Categorias processadas: ${selectedCats.length}`);
  console.log(`⏱️  Tempo total: ${duration}s`);
  console.log(`⚡ Taxa de sucesso: ${Math.round((totalSaved/CONFIG.TARGET_PRODUCTS)*100)}%`);
  
  console.log(`\n📊 RESULTADOS POR CATEGORIA:\n`);
  
  for (const [categoria, res] of Object.entries(resultados)) {
    const status = res.salvos >= res.meta ? '✅' : res.salvos > 0 ? '⚠️' : '❌';
    const catInfo = Object.values(CATEGORIES).find(c => c.key === categoria);
    const emoji = catInfo?.emoji || '📦';
    
    console.log(`   ${status} ${emoji} ${categoria.padEnd(22)} ${res.salvos}/${res.meta} (${res.percentual}%) - ${res.tentativas}x`);
  }
  
  if (totalSaved >= CONFIG.TARGET_PRODUCTS) {
    console.log(`\n🎉 META COMPLETA! ${totalSaved} produtos salvos com sucesso!\n`);
  } else if (totalSaved > 0) {
    console.log(`\n⚠️  Meta parcial: ${totalSaved}/${CONFIG.TARGET_PRODUCTS} produtos`);
    console.log(`\n💡 SUGESTÕES DE OTIMIZAÇÃO:`);
    console.log(`   • Reduza MIN_DISCOUNT (atual: ${CONFIG.MIN_DISCOUNT}%)`);
    console.log(`   • Escolha categorias com mais ofertas disponíveis`);
    console.log(`   • Remova o filtro de preço máximo`);
    console.log(`   • Aumente o TARGET_PRODUCTS para compensar duplicatas\n`);
  } else {
    console.log(`\n❌ Nenhum produto foi salvo.`);
    console.log(`\n🔍 DIAGNÓSTICO:`);
    console.log(`   • Verifique a conexão com o Mercado Livre`);
    console.log(`   • Confirme que há ofertas disponíveis nas categorias selecionadas`);
    console.log(`   • Reduza o desconto mínimo (atual: ${CONFIG.MIN_DISCOUNT}%)`);
    console.log(`   • Remova filtros de preço\n`);
  }
  
  console.log(`${'═'.repeat(70)}\n`);
}

// ═══════════════════════════════════════════════════════════════════════
// EXECUÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

(async () => {
  const startTime = Date.now();
  
  try {
    // Conecta ao banco de dados
    console.log('📡 Conectando ao banco de dados...\n');
    await connectDB();
    
    // Configuração via argumentos ou interativa
    let config;
    const argsConfig = parseArguments(process.argv);
    
    if (argsConfig.categorias) {
      config = argsConfig;
      console.log('\n📋 Configuração via linha de comando\n');
    } else {
      config = await selecionarInterativo();
      rl.close();
    }
    
    const { categorias: selectedCats, maxPrice } = config;
    
    // Exibe configuração
    const limitPerCat = displayConfiguration(selectedCats, maxPrice);
    
    // Inicializa serviço de scraping
    const scrapingService = new ScrapingService();
    
    // Estatísticas globais
    let totalSaved = 0;
    let totalCollected = 0;
    const resultados = {};
    
    // Processa cada categoria
    for (const [index, categoria] of selectedCats.entries()) {
      const resultado = await processCategory(
        scrapingService,
        categoria,
        limitPerCat,
        maxPrice,
        index + 1,
        selectedCats.length
      );
      
      resultados[categoria] = resultado;
      totalSaved += resultado.salvos;
      totalCollected += resultado.coletados;
      
      // Verifica se já atingiu a meta global
      if (totalSaved >= CONFIG.TARGET_PRODUCTS) {
        console.log(`\n🎯 META GLOBAL ATINGIDA! ${totalSaved}/${CONFIG.TARGET_PRODUCTS}\n`);
        console.log(`⏭️  Pulando categorias restantes...\n`);
        break;
      }
    }
    
    // Exibe relatório final
    displayFinalReport(resultados, totalSaved, totalCollected, selectedCats, startTime);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO NO WORKER:');
    console.error(`   ${error.message}`);
    console.error(`\n📋 Stack trace:`);
    console.error(error.stack);
    
    if (rl) rl.close();
    process.exit(1);
  }
})();