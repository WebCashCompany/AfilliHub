const fs = require('fs');
const csv = require('csv-parser');
const { connectDB, getProductConnection } = require('../database/mongodb');
const { getProductModel } = require('../database/models/Products');

/**
 * ═══════════════════════════════════════════════════════════════
 * IMPORTADOR CSV SHOPEE - Painel de Afiliados
 * ═══════════════════════════════════════════════════════════════
 * 
 * Como usar:
 * 1. Acesse: https://affiliate.shopee.com.br/offer/product_offer
 * 2. Filtre produtos com desconto
 * 3. Exporte como CSV
 * 4. Salve como: shopee-produtos.csv
 * 5. Execute: node workers/importShopeeCSV.js
 */

async function importCSV() {
  const startTime = Date.now();
  
  try {
    console.log('📡 Conectando no banco de dados...\n');
    await connectDB();
    
    const conn = getProductConnection();
    const Product = getProductModel('shopee', conn);
    
    const csvFile = process.argv[2] || 'shopee-produtos.csv';
    
    if (!fs.existsSync(csvFile)) {
      console.error(`❌ Arquivo não encontrado: ${csvFile}`);
      console.log(`\n💡 Como usar:`);
      console.log(`   1. Baixe o CSV do painel da Shopee`);
      console.log(`   2. Salve como: shopee-produtos.csv`);
      console.log(`   3. Execute: node workers/importShopeeCSV.js shopee-produtos.csv\n`);
      process.exit(1);
    }
    
    console.log(`📂 Importando: ${csvFile}\n`);
    
    const products = [];
    let lineCount = 0;
    
    // Lê o CSV
    fs.createReadStream(csvFile)
      .pipe(csv())
      .on('data', (row) => {
        lineCount++;
        
        try {
          // Formato do CSV do painel da Shopee:
          // Item Id, Item Name, Price, Sales, Shop Name, Commission Rate, Commission, Product Link, Offer Link
          
          const itemId = row['Item Id'];
          const itemName = row['Item Name'];
          const price = row['Price'];
          const shopName = row['Shop Name'];
          const commissionRate = row['Commission Rate'];
          const productLink = row['Product Link'];
          const offerLink = row['Offer Link']; // Link de afiliado curto
          
          if (!itemId || !itemName || !productLink) {
            console.log(`⚠️  Linha ${lineCount}: Dados incompletos, ignorando`);
            return;
          }
          
          // Calcula desconto (se tiver)
          // Você pode adicionar lógica aqui se o CSV tiver preço anterior
          
          const product = {
            nome: itemName,
            imagem: '', // CSV não tem imagem, pode adicionar depois
            link_original: productLink,
            link_afiliado: offerLink || productLink,
            preco: price,
            preco_anterior: price, // Ajustar se CSV tiver
            preco_de: price.replace(/\D/g, ''),
            preco_para: price.replace(/\D/g, ''),
            desconto: '0%', // Ajustar se CSV tiver
            categoria: 'Importado do Painel',
            vendedor: shopName || '',
            marketplace: 'Shopee',
            isActive: true
          };
          
          products.push(product);
          
        } catch (error) {
          console.error(`❌ Erro na linha ${lineCount}:`, error.message);
        }
      })
      .on('end', async () => {
        console.log(`\n✅ CSV processado: ${products.length} produtos encontrados\n`);
        
        if (products.length === 0) {
          console.log('❌ Nenhum produto válido encontrado\n');
          process.exit(0);
        }
        
        // Salva no banco
        let inserted = 0;
        let updated = 0;
        let errors = 0;
        
        for (const product of products) {
          try {
            const existing = await Product.findOne({ link_original: product.link_original });
            
            if (existing) {
              await Product.updateOne(
                { _id: existing._id },
                { $set: { ...product, updatedAt: new Date() } }
              );
              updated++;
            } else {
              await Product.create(product);
              inserted++;
            }
            
          } catch (error) {
            errors++;
            console.error(`❌ Erro ao salvar: ${product.nome.substring(0, 30)}...`);
          }
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\n╔════════════════════════════════════════════════════╗');
        console.log('║           📊 IMPORTAÇÃO FINALIZADA 📊             ║');
        console.log('╚════════════════════════════════════════════════════╝');
        console.log(`✨ Produtos novos: ${inserted}`);
        console.log(`🔄 Produtos atualizados: ${updated}`);
        console.log(`❌ Erros: ${errors}`);
        console.log(`⏱️  Tempo total: ${duration}s`);
        console.log('╚════════════════════════════════════════════════════╝\n');
        
        process.exit(0);
      })
      .on('error', (error) => {
        console.error('❌ Erro ao ler CSV:', error.message);
        process.exit(1);
      });
    
  } catch (error) {
    console.error('\n❌ ERRO CRÍTICO:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

importCSV();