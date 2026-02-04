/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE WORKER - ENTERPRISE EDITION
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * @version 2.2.0 - ✅ CORRIGIDO: Aceita valor direto como filtro de preço
 * 
 * MODOS DE USO:
 * 1. Interativo: node workers/mlWorker.js
 * 2. Via argumentos: node workers/mlWorker.js --categorias=informatica --preco=50
 */

require('dotenv').config();

const { connectDB } = require('../database/mongodb');
const ScrapingService = require('../scraper/services/ScrapingService');
const readline = require('readline');

const CONFIG = {
  MIN_DISCOUNT: Number(process.env.MIN_DISCOUNT || 30),
  TARGET_PRODUCTS: Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50),
  MAX_ATTEMPTS: 5,
  RETRY_DELAY: 3000,
  MIN_PRODUCTS_TO_CONTINUE: 1
};

const CATEGORIES = {
  '1': { key: 'celulares', name: 'Celulares', emoji: '📱' },
  '2': { key: 'beleza', name: 'Beleza', emoji: '💄' },
  '3': { key: 'eletrodomesticos', name: 'Eletrodomésticos', emoji: '🏠' },
  '4': { key: 'casa_decoracao', name: 'Casa e Decoração', emoji: '🛋️' },
  '5': { key: 'calcados_roupas', name: 'Calçados e Roupas', emoji: '👟' },
  '6': { key: 'informatica', name: 'Informática', emoji: '💻' },
  '7': { key: 'games', name: 'Games', emoji: '🎮' },
  '8': { key: 'ferramentas', name: 'Ferramentas', emoji: '🔧' },
  '9': { key: 'joias_relogios', name: 'Joias e Relógios', emoji: '⌚' },
  '10': { key: 'esportes', name: 'Esportes', emoji: '⚽' },
  '11': { key: 'precos_imbativeis', name: 'Preços Imbatíveis', emoji: '💥' },
  '12': { key: 'ofertas_dia', name: 'Ofertas do Dia', emoji: '🌟' },
  '13': { key: 'ofertas_relampago', name: 'Ofertas Relâmpago', emoji: '⚡' }
};

const PRICE_FILTERS = {
  '1': { value: '50', label: 'Menos de R$ 50' },
  '2': { value: '100', label: 'Menos de R$ 100' },
  '3': { value: '200', label: 'Menos de R$ 200' },
  '0': { value: null, label: 'Sem limite' }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

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
    selectedCats = inputCat.split(',').map(i => CATEGORIES[i.trim()]?.key).filter(Boolean);
  }
  
  if (selectedCats.length === 0) {
    console.log('⚠️  Nenhuma categoria válida selecionada. Usando TODAS.\n');
    selectedCats = Object.values(CATEGORIES).map(c => c.key);
  }
  
  console.log('\n💰 FILTRO DE PREÇO:\n');
  Object.entries(PRICE_FILTERS).forEach(([num, filter]) => {
    console.log(`  ${num}. ${filter.label}`);
  });
  console.log('  OU digite um valor direto (ex: 75 para limitar a R$ 75)\n');
  
  const priceChoice = await question('Escolha (0-3) ou digite o valor: ');
  
  // ✅ CORREÇÃO: Aceita tanto opção pré-definida quanto valor direto
  let maxPrice = null;
  if (PRICE_FILTERS[priceChoice]) {
    maxPrice = PRICE_FILTERS[priceChoice].value;
  } else if (!isNaN(priceChoice) && parseInt(priceChoice) > 0) {
    maxPrice = priceChoice.trim();
  }
  
  return { categorias: selectedCats, maxPrice };
}

function displayConfiguration(selectedCats, maxPrice) {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║              ⚙️  CONFIGURAÇÕES                      ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`  🎯 Meta total: ${CONFIG.TARGET_PRODUCTS} produtos`);
  console.log(`  💯 Desconto mínimo: ${CONFIG.MIN_DISCOUNT}%`);
  console.log(`  📁 Categorias: ${selectedCats.length}`);
  if (maxPrice) {
    console.log(`  💰 Preço máximo: R$ ${maxPrice}`);
  } else {
    console.log(`  💰 Preço máximo: Sem limite`);
  }
  console.log(`  🔄 Tentativas por categoria: ${CONFIG.MAX_ATTEMPTS}`);
  
  const limitPerCat = Math.max(1, Math.floor(CONFIG.TARGET_PRODUCTS / selectedCats.length));
  console.log(`\n📊 Distribuição: ~${limitPerCat} produtos por categoria\n`);
  
  return limitPerCat;
}

async function processCategory(scrapingService, categoria, limitPerCat, maxPrice, categoryIndex, totalCategories) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📁 CATEGORIA ${categoryIndex}/${totalCategories}: ${categoria.toUpperCase()}`);
  console.log(`🎯 Meta: ${limitPerCat} produtos`);
  if (maxPrice) console.log(`💰 Preço máximo: R$ ${maxPrice}`);
  console.log(`${'═'.repeat(70)}\n`);
  
  let savedInCategory = 0, collectedInCategory = 0, attempt = 0, consecutiveZeros = 0;
  
  while (savedInCategory < limitPerCat && attempt < CONFIG.MAX_ATTEMPTS) {
    attempt++;
    console.log(`🔄 TENTATIVA ${attempt}/${CONFIG.MAX_ATTEMPTS} | Salvos: ${savedInCategory}/${limitPerCat}\n`);
    
    try {
      const products = await scrapingService.collectFromMarketplace('ML', {
        minDiscount: CONFIG.MIN_DISCOUNT,
        limit: limitPerCat - savedInCategory,
        categoria: categoria,
        maxPrice: maxPrice
      });
      
      if (!products || products.length === 0) {
        consecutiveZeros++;
        console.log(`⚠️  Nenhum produto coletado. (${consecutiveZeros}ª vez)\n`);
        if (consecutiveZeros >= 2) {
          console.log(`⏭️  Encerrando categoria.\n`);
          break;
        }
        continue;
      }
      
      consecutiveZeros = 0;
      collectedInCategory += products.length;
      console.log(`📦 ${products.length} produtos coletados, salvando...\n`);
      
      const result = await scrapingService.saveProducts(products, 'ML');
      savedInCategory += result.inserted + result.betterOffers;
      
      console.log(`\n📊 Resultado: Novos: ${result.inserted} | Melhores: ${result.betterOffers}`);
      console.log(`📈 Progresso: ${savedInCategory}/${limitPerCat} (${Math.round((savedInCategory/limitPerCat)*100)}%)\n`);
      
      if (savedInCategory >= limitPerCat) {
        console.log(`✅ Meta atingida!\n`);
        break;
      }
      
      if (savedInCategory < limitPerCat && attempt < CONFIG.MAX_ATTEMPTS) {
        console.log(`⏳ Aguardando ${CONFIG.RETRY_DELAY/1000}s...\n`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      }
      
    } catch (error) {
      console.error(`\n❌ Erro: ${error.message}\n`);
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

function displayFinalReport(resultados, totalSaved, totalCollected, selectedCats, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🏁 PROCESSO FINALIZADO`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`✨ Produtos salvos: ${totalSaved}/${CONFIG.TARGET_PRODUCTS}`);
  console.log(`📦 Total coletados: ${totalCollected}`);
  console.log(`⏱️  Tempo: ${duration}s`);
  console.log(`⚡ Taxa: ${Math.round((totalSaved/CONFIG.TARGET_PRODUCTS)*100)}%`);
  
  console.log(`\n📊 RESULTADOS POR CATEGORIA:\n`);
  for (const [categoria, res] of Object.entries(resultados)) {
    const status = res.salvos >= res.meta ? '✅' : res.salvos > 0 ? '⚠️' : '❌';
    const catInfo = Object.values(CATEGORIES).find(c => c.key === categoria);
    console.log(`   ${status} ${catInfo?.emoji || '📦'} ${categoria.padEnd(22)} ${res.salvos}/${res.meta} (${res.percentual}%)`);
  }
  
  if (totalSaved >= CONFIG.TARGET_PRODUCTS) {
    console.log(`\n🎉 META COMPLETA!\n`);
  } else if (totalSaved > 0) {
    console.log(`\n⚠️  Meta parcial: ${totalSaved}/${CONFIG.TARGET_PRODUCTS}`);
    console.log(`💡 Dica: Reduza MIN_DISCOUNT ou remova filtro de preço\n`);
  } else {
    console.log(`\n❌ Nenhum produto salvo. Verifique filtros.\n`);
  }
  
  console.log(`${'═'.repeat(70)}\n`);
}

(async () => {
  const startTime = Date.now();
  
  try {
    console.log('📡 Conectando ao banco...\n');
    await connectDB();
    
    let config;
    const argsConfig = parseArguments(process.argv);
    
    if (argsConfig.categorias) {
      config = argsConfig;
      console.log('\n📋 Config via argumentos\n');
    } else {
      config = await selecionarInterativo();
      rl.close();
    }
    
    const { categorias: selectedCats, maxPrice } = config;
    const limitPerCat = displayConfiguration(selectedCats, maxPrice);
    const scrapingService = new ScrapingService();
    
    let totalSaved = 0, totalCollected = 0;
    const resultados = {};
    
    for (const [index, categoria] of selectedCats.entries()) {
      if (index > 0) scrapingService.clearScraperCache('ML');
      
      const resultado = await processCategory(scrapingService, categoria, limitPerCat, maxPrice, index + 1, selectedCats.length);
      resultados[categoria] = resultado;
      totalSaved += resultado.salvos;
      totalCollected += resultado.coletados;
      
      if (totalSaved >= CONFIG.TARGET_PRODUCTS) {
        console.log(`\n🎯 META GLOBAL ATINGIDA! ${totalSaved}/${CONFIG.TARGET_PRODUCTS}\n`);
        break;
      }
    }
    
    displayFinalReport(resultados, totalSaved, totalCollected, selectedCats, startTime);
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    if (rl) rl.close();
    process.exit(1);
  }
})();