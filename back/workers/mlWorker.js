/**
 * ═══════════════════════════════════════════════════════════════════════
 * MERCADO LIVRE WORKER - ENTERPRISE EDITION
 * ═══════════════════════════════════════════════════════════════════════
 * * @version 2.4.1 - ✅ INTEGRADO: Carregamento de Cookies (SSID/CSRF)
 * * MODOS DE USO:
 * 1. Interativo: node workers/mlWorker.js
 * 2. Via argumentos: node workers/mlWorker.js --categorias=informatica --preco=50
 * 3. Busca por termo: node workers/mlWorker.js --busca=creatina --preco=100
 */

require('dotenv').config();

const { connectDB, getProductConnection } = require('../database/mongodb');
const ScrapingService = require('../scraper/services/ScrapingService');
const mlAffiliate = require('../services/MLAffiliateService');
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
  const result = { categorias: null, maxPrice: null, searchTerm: null };
  
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
    } else if (arg.startsWith('--busca=')) {
      result.searchTerm = arg.split('=')[1].trim();
    }
  }
  
  return result;
}

async function selecionarInterativo() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         🚀 WORKER MERCADO LIVRE 🚀                 ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  console.log('🔍 MODO DE BUSCA:\n');
  console.log('  1. 📂 Buscar por CATEGORIAS');
  console.log('  2. 🔎 Buscar por TERMO (ex: creatina, notebook, etc)\n');
  
  const modeChoice = await question('Escolha o modo (1 ou 2): ');
  
  if (modeChoice === '2') {
    const searchTerm = await question('\n🔎 Digite o termo de busca (ex: creatina): ');
    
    if (!searchTerm || searchTerm.trim().length < 2) {
      console.log('⚠️  Termo inválido. Usando categorias.\n');
      return await selecionarCategorias();
    }
    
    return await selecionarBusca(searchTerm.trim());
  }
  
  return await selecionarCategorias();
}

async function selecionarCategorias() {
  console.log('\n📂 CATEGORIAS DISPONÍVEIS:\n');
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
  
  const maxPrice = await selecionarPreco();
  
  return { 
    mode: 'categories',
    categorias: selectedCats, 
    maxPrice,
    searchTerm: null 
  };
}

async function selecionarBusca(searchTerm) {
  console.log(`\n🔎 Termo de busca: "${searchTerm}"\n`);
  const maxPrice = await selecionarPreco();
  
  return { 
    mode: 'search',
    categorias: null,
    maxPrice,
    searchTerm 
  };
}

async function selecionarPreco() {
  console.log('\n💰 FILTRO DE PREÇO:\n');
  Object.entries(PRICE_FILTERS).forEach(([num, filter]) => {
    console.log(`  ${num}. ${filter.label}`);
  });
  console.log('  OU digite um valor direto (ex: 75 para limitar a R$ 75)\n');
  
  const priceChoice = await question('Escolha (0-3) ou digite o valor: ');
  
  let maxPrice = null;
  if (PRICE_FILTERS[priceChoice]) {
    maxPrice = PRICE_FILTERS[priceChoice].value;
  } else {
    const numValue = parseInt(priceChoice);
    if (!isNaN(numValue) && numValue > 0 && numValue < 100000) {
      maxPrice = String(numValue);
    }
  }
  
  return maxPrice;
}

function displayConfiguration(mode, selectedCats, maxPrice, searchTerm) {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║              ⚙️  CONFIGURAÇÕES                      ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`  🎯 Meta total: ${CONFIG.TARGET_PRODUCTS} produtos`);
  console.log(`  💯 Desconto mínimo: ${CONFIG.MIN_DISCOUNT}%`);
  
  if (mode === 'search') {
    console.log(`  🔎 Busca: "${searchTerm}"`);
  } else {
    console.log(`  📁 Categorias: ${selectedCats.length}`);
  }
  
  if (maxPrice) {
    console.log(`  💰 Preço máximo: R$ ${maxPrice}`);
  } else {
    console.log(`  💰 Preço máximo: Sem limite`);
  }
  console.log(`  🔄 Tentativas: ${CONFIG.MAX_ATTEMPTS}`);
  
  const limitPerCat = mode === 'search' ? CONFIG.TARGET_PRODUCTS : Math.max(1, Math.floor(CONFIG.TARGET_PRODUCTS / selectedCats.length));
  
  if (mode === 'categories') {
    console.log(`\n📊 Distribuição: ~${limitPerCat} produtos por categoria\n`);
  } else {
    console.log(`\n📊 Limite: ${limitPerCat} produtos no total\n`);
  }
  
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
        
        if (consecutiveZeros >= 3) {
          console.log(`⏭️  Encerrando categoria após 3 tentativas vazias.\n`);
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
  
  const percentual = Math.min(100, Math.round((savedInCategory / limitPerCat) * 100));
  
  return {
    meta: limitPerCat,
    salvos: savedInCategory,
    coletados: collectedInCategory,
    tentativas: attempt,
    percentual: percentual
  };
}

async function processSearch(scrapingService, searchTerm, limit, maxPrice) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🔎 BUSCA: "${searchTerm.toUpperCase()}"`);
  console.log(`🎯 Meta: ${limit} produtos`);
  if (maxPrice) console.log(`💰 Preço máximo: R$ ${maxPrice}`);
  console.log(`${'═'.repeat(70)}\n`);
  
  let savedTotal = 0, collectedTotal = 0, attempt = 0, consecutiveZeros = 0;
  
  while (savedTotal < limit && attempt < CONFIG.MAX_ATTEMPTS) {
    attempt++;
    console.log(`🔄 TENTATIVA ${attempt}/${CONFIG.MAX_ATTEMPTS} | Salvos: ${savedTotal}/${limit}\n`);
    
    try {
      const products = await scrapingService.collectFromMarketplace('ML', {
        minDiscount: CONFIG.MIN_DISCOUNT,
        limit: limit - savedTotal,
        searchTerm: searchTerm,
        maxPrice: maxPrice
      });
      
      if (!products || products.length === 0) {
        consecutiveZeros++;
        console.log(`⚠️  Nenhum produto coletado. (${consecutiveZeros}ª vez)\n`);
        
        if (consecutiveZeros >= 3) {
          console.log(`⏭️  Encerrando busca após 3 tentativas vazias.\n`);
          break;
        }
        continue;
      }
      
      consecutiveZeros = 0;
      collectedTotal += products.length;
      console.log(`📦 ${products.length} produtos coletados, salvando...\n`);
      
      const result = await scrapingService.saveProducts(products, 'ML');
      savedTotal += result.inserted + result.betterOffers;
      
      console.log(`\n📊 Resultado: Novos: ${result.inserted} | Melhores: ${result.betterOffers}`);
      console.log(`📈 Progresso: ${savedTotal}/${limit} (${Math.round((savedTotal/limit)*100)}%)\n`);
      
      if (savedTotal >= limit) {
        console.log(`✅ Meta atingida!\n`);
        break;
      }
      
      if (savedTotal < limit && attempt < CONFIG.MAX_ATTEMPTS) {
        console.log(`⏳ Aguardando ${CONFIG.RETRY_DELAY/1000}s...\n`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      }
      
    } catch (error) {
      console.error(`\n❌ Erro: ${error.message}\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const percentual = Math.min(100, Math.round((savedTotal / limit) * 100));
  
  return {
    meta: limit,
    salvos: savedTotal,
    coletados: collectedTotal,
    tentativas: attempt,
    percentual: percentual
  };
}

function displayFinalReport(resultados, totalSaved, totalCollected, mode, selectedCats, searchTerm, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🏁 PROCESSO FINALIZADO`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`✨ Produtos salvos: ${totalSaved}/${CONFIG.TARGET_PRODUCTS}`);
  console.log(`📦 Total coletados: ${totalCollected}`);
  console.log(`⏱️  Tempo: ${duration}s`);
  
  const taxa = Math.min(100, Math.round((totalSaved/CONFIG.TARGET_PRODUCTS)*100));
  console.log(`⚡ Taxa: ${taxa}%`);
  
  if (mode === 'categories') {
    console.log(`\n📊 RESULTADOS POR CATEGORIA:\n`);
    for (const [categoria, res] of Object.entries(resultados)) {
      const status = res.salvos >= res.meta ? '✅' : res.salvos > 0 ? '⚠️' : '❌';
      const catInfo = Object.values(CATEGORIES).find(c => c.key === categoria);
      console.log(`   ${status} ${catInfo?.emoji || '📦'} ${categoria.padEnd(22)} ${res.salvos}/${res.meta} (${res.percentual}%)`);
    }
  } else {
    console.log(`\n📊 RESULTADO DA BUSCA:\n`);
    console.log(`   🔎 Termo: "${searchTerm}"`);
    console.log(`   ✨ Salvos: ${resultados.search.salvos}/${resultados.search.meta}`);
    console.log(`   📦 Coletados: ${resultados.search.coletados}`);
    console.log(`   ⚡ Taxa: ${resultados.search.percentual}%`);
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
    
    // ✅ NOVO: Garante que as credenciais do ML (SSID/CSRF) sejam carregadas do MongoDB para o serviço
    const prodConnection = getProductConnection();
    const IntegrationModel = require('../models/Integration')(prodConnection);
    const mlConfig = await IntegrationModel.findOne({ provider: 'mercadolivre', isActive: true });
    
    if (mlConfig && mlConfig.ssid) {
        mlAffiliate.updateCookies(mlConfig.ssid, mlConfig.csrf);
        mlAffiliate.accessToken = mlConfig.accessToken;
        console.log('🍪 [Worker] Credenciais Mercado Livre carregadas do banco!');
    } else {
        console.warn('⚠️  [Worker] Conta Mercado Livre não conectada ou sem cookies. Links afiliados podem falhar.');
    }

    let config;
    const argsConfig = parseArguments(process.argv);
    
    if (argsConfig.categorias || argsConfig.searchTerm) {
      config = argsConfig;
      config.mode = argsConfig.searchTerm ? 'search' : 'categories';
      console.log('\n📋 Config via argumentos\n');
    } else {
      config = await selecionarInterativo();
      rl.close();
    }
    
    const { mode, categorias: selectedCats, maxPrice, searchTerm } = config;
    const limitPerCat = displayConfiguration(mode, selectedCats, maxPrice, searchTerm);
    const scrapingService = new ScrapingService();
    
    let totalSaved = 0, totalCollected = 0;
    const resultados = {};
    
    if (mode === 'search') {
      const resultado = await processSearch(scrapingService, searchTerm, limitPerCat, maxPrice);
      resultados.search = resultado;
      totalSaved = resultado.salvos;
      totalCollected = resultado.coletados;
      
    } else {
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
    }
    
    displayFinalReport(resultados, totalSaved, totalCollected, mode, selectedCats, searchTerm, startTime);
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    if (rl) rl.close();
    process.exit(1);
  }
})();