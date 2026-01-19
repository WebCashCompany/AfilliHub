require('dotenv').config();

const { connectDB, getProductConnection } = require('../database/mongodb');
const { getProductModel } = require('../database/models/Products');
const ScrapingService = require('../scraper/services/ScrapingService');
const readline = require('readline');

/**
 * ═══════════════════════════════════════════════════════════════
 * WORKER MERCADO LIVRE - VERSÃO ATUALIZADA
 * ═══════════════════════════════════════════════════════════════
 * 
 * ✅ Nova estrutura de database (produtos/ML)
 * ✅ Sistema de links afiliados
 * ✅ Sistema de tentativas (até 5x)
 * ✅ Seleção interativa de categorias
 * ✅ Filtro de preço máximo
 * 
 * MODOS DE USO:
 * 1. Interativo: node workers/mlWorker.js
 * 2. Via argumentos: node workers/mlWorker.js --categorias=informatica,games --preco=100
 */

const rl = readline.createInterface({ 
  input: process.stdin, 
  output: process.stdout 
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Mapa de categorias
const CATEGORY_MAP = {
  '1': { key: 'celulares', name: 'Celulares' },
  '2': { key: 'beleza', name: 'Beleza' },
  '3': { key: 'eletrodomesticos', name: 'Eletrodomésticos' },
  '4': { key: 'casa_decoracao', name: 'Casa e Decoração' },
  '5': { key: 'calcados_roupas', name: 'Calçados e Roupas' },
  '6': { key: 'informatica', name: 'Informática' },
  '7': { key: 'games', name: 'Games' },
  '8': { key: 'eletronicos', name: 'Eletrônicos' },
  '9': { key: 'joias_relogios', name: 'Joias e Relógios' },
  '10': { key: 'esportes', name: 'Esportes' },
  '11': { key: 'ferramentas', name: 'Ferramentas' },
  '12': { key: 'ofertas_dia', name: 'Ofertas do Dia' },
  '13': { key: 'ofertas_relampago', name: 'Ofertas Relâmpago' }
};

/**
 * Processa argumentos da linha de comando
 */
function parseArguments(args) {
  const result = { categorias: null, maxPrice: null };
  
  for (const arg of args) {
    if (arg.startsWith('--categorias=')) {
      const valor = arg.split('=')[1];
      if (valor.toLowerCase() === 'todas') {
        result.categorias = Object.values(CATEGORY_MAP).map(c => c.key);
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
 * Seleção interativa
 */
async function selecionarInterativo() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         🚀 WORKER MERCADO LIVRE 🚀                 ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  console.log('📂 CATEGORIAS DISPONÍVEIS:\n');
  Object.entries(CATEGORY_MAP).forEach(([num, cat]) => {
    console.log(`  ${num.padStart(2, ' ')}. ${cat.name}`);
  });
  console.log('  A.  TODAS AS CATEGORIAS\n');
  
  const inputCat = await question('Digite os números separados por vírgula (ex: 1,6,7) ou A: ');
  
  let selectedCats = [];
  if (inputCat.toUpperCase() === 'A') {
    selectedCats = Object.values(CATEGORY_MAP).map(c => c.key);
  } else {
    selectedCats = inputCat
      .split(',')
      .map(i => CATEGORY_MAP[i.trim()]?.key)
      .filter(Boolean);
  }
  
  if (selectedCats.length === 0) {
    console.log('⚠️  Nenhuma categoria válida. Usando TODAS.\n');
    selectedCats = Object.values(CATEGORY_MAP).map(c => c.key);
  }
  
  console.log('\n💰 FILTRO DE PREÇO:');
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
  
  return { categorias: selectedCats, maxPrice };
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
    // SELEÇÃO DE CATEGORIAS E FILTROS
    // ═══════════════════════════════════════════════════════════
    
    let config;
    const argsConfig = parseArguments(process.argv);
    
    if (argsConfig.categorias) {
      config = argsConfig;
      console.log('\n📋 Configuração via argumentos da linha de comando\n');
    } else {
      config = await selecionarInterativo();
      rl.close();
    }
    
    const { categorias: selectedCats, maxPrice } = config;
    
    // ═══════════════════════════════════════════════════════════
    // EXIBIÇÃO DA CONFIGURAÇÃO
    // ═══════════════════════════════════════════════════════════
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║              ⚙️  CONFIGURAÇÕES                      ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(`  🎯 Meta total: ${TARGET_PRODUCTS} produtos`);
    console.log(`  💯 Desconto mínimo: ${MIN_DISCOUNT}%`);
    console.log(`  📁 Categorias: ${selectedCats.length}`);
    if (maxPrice) {
      console.log(`  💰 Preço máximo: R$ ${maxPrice}`);
    }
    console.log('');
    
    const limitPerCat = Math.max(1, Math.floor(TARGET_PRODUCTS / selectedCats.length));
    console.log(`📊 Distribuição: ~${limitPerCat} produtos por categoria\n`);
    
    // ═══════════════════════════════════════════════════════════
    // PROCESSAMENTO POR CATEGORIA
    // ═══════════════════════════════════════════════════════════
    
    const scrapingService = new ScrapingService();
    let totalSaved = 0;
    let totalCollected = 0;
    const resultados = {};
    
    for (const [index, categoria] of selectedCats.entries()) {
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`📁 CATEGORIA ${index + 1}/${selectedCats.length}: ${categoria.toUpperCase()}`);
      console.log(`🎯 Meta: ${limitPerCat} produtos`);
      console.log(`${'═'.repeat(70)}\n`);
      
      let savedInCategory = 0;
      let attempt = 0;
      
      while (savedInCategory < limitPerCat && attempt < MAX_ATTEMPTS) {
        attempt++;
        
        console.log(`🔄 TENTATIVA ${attempt}/${MAX_ATTEMPTS} | Salvos: ${savedInCategory}/${limitPerCat}\n`);
        
        const remaining = limitPerCat - savedInCategory;
        
        try {
          // Coleta produtos
          const products = await scrapingService.collectFromMarketplace('mercadolivre', {
            minDiscount: MIN_DISCOUNT,
            limit: remaining,
            categoria: categoria,
            maxPrice: maxPrice
          });
          
          if (!products || products.length === 0) {
            console.log('⚠️  Nenhum produto encontrado.\n');
            break;
          }
          
          totalCollected += products.length;
          
          // Salva produtos
          const result = await scrapingService.saveProducts(products, 'ML');
          const savedThisRound = result.inserted + result.betterOffers;
          
          savedInCategory += savedThisRound;
          totalSaved += savedThisRound;
          
          console.log(`\n📊 Progresso: ${savedInCategory}/${limitPerCat} (${totalSaved}/${TARGET_PRODUCTS} total)\n`);
          
          // Verifica se deve continuar
          if (savedInCategory >= limitPerCat) {
            console.log(`✅ Meta da categoria atingida!\n`);
            break;
          }
          
          if (savedThisRound === 0) {
            console.log(`⚠️  Nenhum produto novo. Avançando...\n`);
            break;
          }
          
          // Aguarda antes da próxima tentativa
          if (savedInCategory < limitPerCat && attempt < MAX_ATTEMPTS) {
            console.log(`⏳ Aguardando 3 segundos...\n`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
        } catch (error) {
          console.error(`❌ Erro na categoria ${categoria}:`, error.message);
          break;
        }
      }
      
      // Salva resultado
      resultados[categoria] = {
        meta: limitPerCat,
        salvos: savedInCategory,
        tentativas: attempt,
        percentual: Math.round((savedInCategory / limitPerCat) * 100)
      };
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
    console.log(`📁 Categorias processadas: ${selectedCats.length}`);
    console.log(`⏱️  Tempo total: ${duration}s`);
    
    console.log(`\n📊 RESULTADOS POR CATEGORIA:\n`);
    
    for (const [categoria, res] of Object.entries(resultados)) {
      const status = res.salvos >= res.meta ? '✅' : '⚠️';
      console.log(`   ${status} ${categoria.padEnd(20)} ${res.salvos}/${res.meta} (${res.percentual}%) - ${res.tentativas} tentativas`);
    }
    
    if (totalSaved >= TARGET_PRODUCTS) {
      console.log(`\n✅ META ATINGIDA! ${totalSaved} produtos salvos!\n`);
    } else {
      console.log(`\n⚠️  Meta parcial: ${totalSaved}/${TARGET_PRODUCTS} produtos`);
      console.log(`\n💡 DICAS:`);
      console.log(`   • Reduza MIN_DISCOUNT (atual: ${MIN_DISCOUNT}%)`);
      console.log(`   • Escolha categorias com mais ofertas`);
      console.log(`   • Remova o filtro de preço\n`);
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