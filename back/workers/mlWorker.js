require('dotenv').config();
const connectDB = require('../database/mongodb'); 
const ScrapingService = require('../scraper/services/ScrapingService'); 
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         🚀 SELEÇÃO DE CATEGORIAS ML 🚀             ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('1. Celulares           2. Beleza         3. Eletrodomésticos');
    console.log('4. Casa e Decoração    5. Calçados       6. Informática');
    console.log('7. Games               8. Eletrônicos    9. Joias e Relógios');
    console.log('10. Esportes           11. Ferramentas   12. Ofertas do Dia');
    console.log('A. TODAS AS CATEGORIAS ACIMA');
    
    const inputCat = await question('\nDigite os números separados por vírgula (ex: 1,2,6) ou A: ');
    
    console.log('\n--- FILTRO DE PREÇO ---');
    console.log('1. Menos de R$ 100 | 2. Menos de R$ 50 | 0. Sem limite');
    const priceChoice = await question('Escolha: ');
    let selectedMaxPrice = priceChoice === '1' ? '100' : (priceChoice === '2' ? '50' : null);

    await connectDB();
    const TARGET_TOTAL = Number(process.env.MAX_PRODUCTS_PER_CATEGORY || 50);
    const scrapingService = new ScrapingService();

    // ✅ MAPA CORRETO com as chaves usadas em categorias-ml.js
    const categoryMap = {
      '1': 'celulares',
      '2': 'beleza',
      '3': 'eletrodomesticos',
      '4': 'casa_decoracao',
      '5': 'calcados_roupas',
      '6': 'informatica',
      '7': 'games',
      '8': 'eletronicos',
      '9': 'joias_relogios',
      '10': 'esportes',
      '11': 'ferramentas',
      '12': 'ofertas_dia'
    };

    let selectedCats = [];
    if (inputCat.toUpperCase() === 'A') {
      selectedCats = Object.values(categoryMap);
    } else {
      selectedCats = inputCat.split(',').map(i => categoryMap[i.trim()]).filter(Boolean);
    }

    if (selectedCats.length === 0) {
        console.log('❌ Nenhuma categoria válida selecionada.');
        rl.close();
        process.exit(1);
    }

    const limitPerCat = Math.max(1, Math.floor(TARGET_TOTAL / selectedCats.length));
    console.log(`\n🎯 Objetivo Total: ${TARGET_TOTAL} | Buscando ~${limitPerCat} por categoria.`);
    if (selectedMaxPrice) {
      console.log(`💰 Filtro de Preço: Máximo R$ ${selectedMaxPrice}`);
    }

    let totalSaved = 0;

    for (const cat of selectedCats) {
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`📂 PROCESSANDO: ${cat.toUpperCase()}`);
      console.log(`${'═'.repeat(70)}`);
      
      // ✅ CORREÇÃO: Passa 'categoria' ao invés de 'category'
      const products = await scrapingService.collectFromMarketplace('mercadolivre', {
        minDiscount: Number(process.env.MIN_DISCOUNT || 30),
        limit: limitPerCat,
        categoria: cat,  // ✅ NOME CORRETO
        maxPrice: selectedMaxPrice
      });

      if (products.length > 0) {
        const result = await scrapingService.saveProducts(products, 'ML');
        totalSaved += result.totalSaved;
        console.log(`✅ Resultado de ${cat}: ${result.totalSaved} novos salvos.`);
      } else {
        console.log(`⚠️ Nenhum produto encontrado para ${cat}.`);
      }
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log('🏁 TODAS AS CATEGORIAS PROCESSADAS!');
    console.log(`${'═'.repeat(70)}`);
    console.log(`✨ Total de produtos NOVOS salvos: ${totalSaved}/${TARGET_TOTAL}`);
    console.log(`📁 Categorias processadas: ${selectedCats.length}`);
    
    if (totalSaved >= TARGET_TOTAL) {
      console.log(`\n✅ META ATINGIDA! ${totalSaved} produtos salvos com sucesso!`);
    } else {
      console.log(`\n⚠️ Meta parcialmente atingida. ${totalSaved} de ${TARGET_TOTAL} produtos salvos.`);
    }
    console.log(`${'═'.repeat(70)}\n`);
    
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro Crítico:', error);
    rl.close();
    process.exit(1);
  }
})();