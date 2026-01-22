require('dotenv').config();
const { connectDB } = require('../database/mongodb');
const ScrapingService = require('../scraper/services/ScrapingService');
const { getEnabledCategories } = require('../config/categorias-magalu');

/**
 * ═══════════════════════════════════════════════════════════
 * WORKER: MAGAZINE LUIZA COM MÚLTIPLAS CATEGORIAS
 * ═══════════════════════════════════════════════════════════
 * 
 * Este worker coleta produtos de TODAS as categorias do Magalu
 * de forma distribuída e organizada
 * 
 * ═══════════════════════════════════════════════════════════
 */

(async () => {
  const startTime = Date.now();
  
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║      🔵 WORKER: MAGAZINE LUIZA (CATEGORIAS) 🔵     ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    await connectDB();
    
    // ═══════════════════════════════════════════════════════════
    // CONFIGURAÇÕES
    // ═══════════════════════════════════════════════════════════
    
    const MIN_DISCOUNT = Number(process.env.MIN_DISCOUNT || 30);
    const TOTAL_PRODUCTS = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    const MODE = process.env.SCRAPING_MODE || 'auto';
    
    // Estratégia de distribuição:
    // 'equal' = Divide igualmente entre todas as categorias
    // 'priority' = Mais produtos nas categorias de alta prioridade
    const DISTRIBUTION_MODE = process.env.DISTRIBUTION_MODE || 'equal';
    
    const scrapingService = new ScrapingService();
    const categories = getEnabledCategories();
    
    console.log(`📋 Categorias habilitadas: ${categories.length}`);
    console.log(`🎯 Meta total: ${TOTAL_PRODUCTS} produtos NOVOS`);
    console.log(`📊 Modo de distribuição: ${DISTRIBUTION_MODE}\n`);
    
    // ═══════════════════════════════════════════════════════════
    // CÁLCULO DE DISTRIBUIÇÃO
    // ═══════════════════════════════════════════════════════════
    
    let productsPerCategory = {};
    
    if (DISTRIBUTION_MODE === 'equal') {
      // Distribui igualmente
      const perCat = Math.ceil(TOTAL_PRODUCTS / categories.length);
      categories.forEach(cat => {
        productsPerCategory[cat.key] = perCat;
      });
    } else {
      // Distribui por prioridade (alta prioridade = mais produtos)
      const totalPriority = categories.reduce((sum, cat) => sum + (10 - cat.priority), 0);
      categories.forEach(cat => {
        const weight = (10 - cat.priority) / totalPriority;
        productsPerCategory[cat.key] = Math.max(5, Math.ceil(TOTAL_PRODUCTS * weight));
      });
    }
    
    console.log('📊 Distribuição de produtos por categoria:');
    categories.forEach(cat => {
      console.log(`   ${cat.name.padEnd(20)} → ${productsPerCategory[cat.key]} produtos`);
    });
    console.log('');
    
    // ═══════════════════════════════════════════════════════════
    // COLETA POR CATEGORIA
    // ═══════════════════════════════════════════════════════════
    
    let totalSaved = 0;
    const resultsByCategory = {};
    
    for (const category of categories) {
      const categoryStart = Date.now();
      
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🔄 CATEGORIA: ${category.name.toUpperCase()}`);
      console.log(`${'═'.repeat(60)}\n`);
      
      const targetProducts = productsPerCategory[category.key];
      let savedInCategory = 0;
      let attempt = 0;
      const MAX_ATTEMPTS = 3;
      
      while (savedInCategory < targetProducts && attempt < MAX_ATTEMPTS) {
        attempt++;
        
        const remainingProducts = targetProducts - savedInCategory;
        
        console.log(`📌 Tentativa ${attempt}/${MAX_ATTEMPTS} | Faltam ${remainingProducts} produtos\n`);
        
        // Coleta produtos da categoria específica
        const products = await scrapingService.collectFromMarketplace('magalu', {
          minDiscount: MIN_DISCOUNT,
          limit: remainingProducts,
          mode: MODE,
          categoryKey: category.key // 🆕 PASSA A CHAVE DA CATEGORIA
        });
        
        if (!products || products.length === 0) {
          console.log(`⚠️  Nenhum produto encontrado nesta tentativa.\n`);
          break;
        }
        
        // Salva produtos
        const result = await scrapingService.saveProducts(products, 'MAGALU');
        
        const savedThisRound = result.inserted + result.betterOffers;
        savedInCategory += savedThisRound;
        totalSaved += savedThisRound;
        
        console.log(`📊 Progresso da categoria: ${savedInCategory}/${targetProducts} produtos salvos`);
        
        if (savedInCategory >= targetProducts) {
          console.log(`✅ Meta da categoria atingida!\n`);
          break;
        }
        
        if (savedThisRound === 0) {
          console.log(`⚠️  Nenhum produto novo foi salvo. Passando para próxima categoria.\n`);
          break;
        }
        
        // Aguarda antes da próxima tentativa
        if (savedInCategory < targetProducts && attempt < MAX_ATTEMPTS) {
          console.log(`⏳ Aguardando 5 segundos antes da próxima tentativa...\n`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      const categoryDuration = ((Date.now() - categoryStart) / 1000).toFixed(2);
      
      resultsByCategory[category.name] = {
        target: targetProducts,
        saved: savedInCategory,
        attempts: attempt,
        duration: categoryDuration
      };
      
      console.log(`\n✅ Categoria "${category.name}" finalizada em ${categoryDuration}s`);
      console.log(`   ${savedInCategory}/${targetProducts} produtos salvos (${attempt} tentativas)\n`);
    }
    
    // ═══════════════════════════════════════════════════════════
    // RELATÓRIO FINAL
    // ═══════════════════════════════════════════════════════════
    
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏁 PROCESSO FINALIZADO`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`✨ Total de produtos NOVOS salvos: ${totalSaved}/${TOTAL_PRODUCTS}`);
    console.log(`⏱️  Tempo total: ${totalDuration}s`);
    console.log(`\n📊 Resumo por categoria:`);
    
    Object.entries(resultsByCategory).forEach(([name, stats]) => {
      const percentage = ((stats.saved / stats.target) * 100).toFixed(1);
      console.log(`   ${name.padEnd(20)} → ${stats.saved}/${stats.target} (${percentage}%) - ${stats.duration}s`);
    });
    
    if (totalSaved < TOTAL_PRODUCTS) {
      console.log(`\n⚠️  ATENÇÃO: Não foi possível atingir a meta de ${TOTAL_PRODUCTS} produtos.`);
      console.log(`   Foram salvos ${totalSaved} produtos novos.`);
      console.log(`\n💡 Sugestões:`);
      console.log(`   • Reduza MIN_DISCOUNT (atual: ${MIN_DISCOUNT}%)`);
      console.log(`   • Limpe produtos antigos do banco`);
      console.log(`   • Aguarde novas ofertas do Magazine Luiza`);
    }
    
    console.log(`${'═'.repeat(60)}\n`);
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();