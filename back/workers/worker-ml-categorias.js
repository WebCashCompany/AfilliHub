require('dotenv').config();

const connectDB = require('../database/mongodb');
const ScrapingService = require('../scraper/services/ScrapingService');
const { 
  selecionarCategorias, 
  selecionarViaArgumentos,
  exibirCategoriasSelecionadas 
} = require('../config/seletor-categorias');
const { dividirProdutosPorCategoria } = require('../config/categorias-ml');

/**
 * ═══════════════════════════════════════════════════════════════
 * WORKER MERCADO LIVRE - VERSÃO COM CATEGORIAS
 * ═══════════════════════════════════════════════════════════════
 * 
 * ✅ MANTÉM: Sistema de links afiliados
 * ✅ MANTÉM: Sistema de tentativas
 * ✅ MANTÉM: Detecção de produtos novos vs atualizados
 * ✅ NOVO: Seleção de categorias
 * ✅ NOVO: Distribuição automática de produtos por categoria
 * 
 * MODOS DE USO:
 * 1. Interativo: node worker-ml.js
 * 2. Via argumentos: node worker-ml.js --categorias=beleza,games,informatica
 * 3. Todas categorias: node worker-ml.js --categorias=todas
 */

(async () => {
  const startTime = Date.now();
  
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         🟡 WORKER: MERCADO LIVRE 🟡                ║');
    console.log('║            COM SELEÇÃO DE CATEGORIAS               ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    await connectDB();
   
    const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT || 30);
    const TARGET_PRODUCTS = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    const MODE = process.env.SCRAPING_MODE || 'auto';
    const MAX_ATTEMPTS = 5;

    console.log('⚙️  CONFIGURAÇÕES:');
    console.log(`   └─ Desconto mínimo: ${MIN_DISCOUNT}%`);
    console.log(`   └─ Total de produtos: ${TARGET_PRODUCTS}`);
    console.log(`   └─ Modo: ${MODE.toUpperCase()}\n`);

    // ═══════════════════════════════════════════════════════════
    // ✅ NOVO: SELEÇÃO DE CATEGORIAS
    // ═══════════════════════════════════════════════════════════
    
    let categoriasSelecionadas;
    
    // Verifica se foi passado via argumentos
    const categoriasViaArgs = selecionarViaArgumentos(process.argv);
    
    if (categoriasViaArgs) {
      categoriasSelecionadas = categoriasViaArgs;
      console.log('📋 Categorias selecionadas via argumentos da linha de comando\n');
    } else {
      // Seleção interativa
      categoriasSelecionadas = await selecionarCategorias();
    }

    // Divide produtos entre as categorias
    const distribuicao = dividirProdutosPorCategoria(TARGET_PRODUCTS, categoriasSelecionadas);
    
    // Exibe seleção
    exibirCategoriasSelecionadas(categoriasSelecionadas, distribuicao);

    console.log(`🎯 OBJETIVO: Salvar ${TARGET_PRODUCTS} produtos NOVOS no banco\n`);
    console.log(`📊 Distribuição: ${TARGET_PRODUCTS} produtos / ${categoriasSelecionadas.length} categoria(s)\n`);

    // ═══════════════════════════════════════════════════════════
    // ✅ PROCESSAMENTO POR CATEGORIA
    // ═══════════════════════════════════════════════════════════

    const scrapingService = new ScrapingService();
    let totalSaved = 0;
    let totalCollected = 0;
    const resultadosPorCategoria = {};

    for (const [index, categoria] of categoriasSelecionadas.entries()) {
      const produtosParaCategoria = distribuicao[categoria];
      
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`📁 CATEGORIA ${index + 1}/${categoriasSelecionadas.length}: ${categoria.toUpperCase()}`);
      console.log(`🎯 Meta: ${produtosParaCategoria} produtos`);
      console.log(`${'═'.repeat(70)}\n`);

      let savedInCategory = 0;
      let attempt = 0;

      while (savedInCategory < produtosParaCategoria && attempt < MAX_ATTEMPTS) {
        attempt++;
       
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`🔄 TENTATIVA ${attempt}/${MAX_ATTEMPTS} | Salvos: ${savedInCategory}/${produtosParaCategoria}`);
        console.log(`${'─'.repeat(60)}\n`);

        const remainingProducts = produtosParaCategoria - savedInCategory;
       
        console.log(`📌 Faltam ${remainingProducts} produtos nesta categoria\n`);

        // ✅ Coleta com categoria específica
        const products = await scrapingService.collectFromMarketplace('mercadolivre', {
          minDiscount: MIN_DISCOUNT,
          limit: remainingProducts,
          mode: MODE,
          categoria: categoria // ✅ NOVO: Passa categoria
        });

        if (!products || products.length === 0) {
          console.log('⚠️  Nenhum produto encontrado nesta tentativa.');
          break;
        }

        totalCollected += products.length;

        // Salva produtos
        const result = await scrapingService.saveProducts(products, 'ML');
       
        // Conta APENAS produtos NOVOS (inserted + betterOffers)
        const savedThisRound = result.inserted + result.betterOffers;
        savedInCategory += savedThisRound;
        totalSaved += savedThisRound;

        console.log(`📊 Progresso na categoria: ${savedInCategory}/${produtosParaCategoria} produtos NOVOS`);
        console.log(`📊 Progresso total: ${totalSaved}/${TARGET_PRODUCTS} produtos NOVOS`);

        // Se já atingiu o objetivo da categoria, para
        if (savedInCategory >= produtosParaCategoria) {
          console.log(`\n✅ META DA CATEGORIA ATINGIDA! ${savedInCategory} produtos salvos.`);
          break;
        }

        // Se não conseguiu salvar NENHUM produto novo, para
        if (savedThisRound === 0) {
          console.log(`\n⚠️  Nenhum produto novo foi salvo nesta tentativa.`);
          console.log(`   Passando para próxima categoria...`);
          break;
        }

        // Aguarda antes da próxima tentativa
        if (savedInCategory < produtosParaCategoria && attempt < MAX_ATTEMPTS) {
          console.log(`\n⏳ Aguardando 3 segundos antes da próxima coleta...\n`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Registra resultados da categoria
      resultadosPorCategoria[categoria] = {
        meta: produtosParaCategoria,
        salvos: savedInCategory,
        tentativas: attempt
      };
    }

    // ═══════════════════════════════════════════════════════════
    // ✅ RELATÓRIO FINAL
    // ═══════════════════════════════════════════════════════════

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
   
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🏁 PROCESSO FINALIZADO`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`✨ Total de produtos NOVOS salvos: ${totalSaved}/${TARGET_PRODUCTS}`);
    console.log(`📦 Total de produtos coletados: ${totalCollected}`);
    console.log(`📁 Categorias processadas: ${categoriasSelecionadas.length}`);
    console.log(`⏱️  Tempo total: ${duration}s`);
   
    // Estatísticas por categoria
    console.log(`\n📊 RESULTADOS POR CATEGORIA:\n`);
    
    for (const [categoria, resultado] of Object.entries(resultadosPorCategoria)) {
      const percentual = Math.round((resultado.salvos / resultado.meta) * 100);
      const status = resultado.salvos >= resultado.meta ? '✅' : '⚠️';
      
      console.log(`   ${status} ${categoria.padEnd(20)} → ${resultado.salvos}/${resultado.meta} (${percentual}%) - ${resultado.tentativas} tentativas`);
    }
    
    if (totalSaved < TARGET_PRODUCTS) {
      console.log(`\n⚠️  ATENÇÃO: Não foi possível atingir a meta de ${TARGET_PRODUCTS} produtos.`);
      console.log(`   Foram salvos ${totalSaved} produtos novos.`);
      console.log(`   Considere:`);
      console.log(`   • Reduzir MIN_DISCOUNT (atual: ${MIN_DISCOUNT}%)`);
      console.log(`   • Selecionar menos categorias ou categorias diferentes`);
      console.log(`   • Limpar produtos antigos do banco`);
    } else {
      console.log(`\n✅ META GLOBAL ATINGIDA! Todos os ${totalSaved} produtos foram salvos com sucesso!`);
    }
   
    console.log(`${'═'.repeat(70)}\n`);
   
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();