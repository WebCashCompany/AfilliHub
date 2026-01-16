require('dotenv').config();

const connectDB = require('./database/mongodb');
const Product = require('./database/models/Product');
const MercadoLivreScraper = require('./scraper/scrapers/MercadoLivreScraper');

/**
 * Normaliza o nome do produto para comparação (remove caracteres especiais, espaços extras, etc)
 */
function normalizeProductName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^\w\s]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, ' ') // Remove espaços extras
    .trim();
}

/**
 * Extrai o valor numérico do desconto
 */
function getDiscountValue(desconto) {
  if (!desconto) return 0;
  const match = desconto.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Extrai o valor numérico do preço
 */
function getPriceValue(preco) {
  if (!preco) return 0;
  const cleaned = preco.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/**
 * Verifica se o produto deve ser atualizado (promoção melhor)
 */
function shouldUpdate(existingProduct, newProduct) {
  const existingDiscount = getDiscountValue(existingProduct.desconto);
  const newDiscount = getDiscountValue(newProduct.desconto);
  const existingPrice = getPriceValue(existingProduct.preco);
  const newPrice = getPriceValue(newProduct.preco);

  // Atualiza se:
  // 1. Desconto maior, OU
  // 2. Desconto igual mas preço menor
  return newDiscount > existingDiscount || 
         (newDiscount === existingDiscount && newPrice < existingPrice);
}

(async () => {
  try {
    console.log('🚀 Iniciando automação Affiliate Hub Pro');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await connectDB();

    const scraper = new MercadoLivreScraper(
      Number(process.env.MIN_DISCOUNT || 30)
    );

    console.log('📡 Capturando produtos do Mercado Livre...\n');
    const scrapedProducts = await scraper.scrapeCategory();

    console.log(`\n📦 Produtos capturados: ${scrapedProducts.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    console.log('💾 Processando produtos no banco de dados...\n');

    for (const product of scrapedProducts) {
      try {
        const normalizedName = normalizeProductName(product.nome);

        // Busca produto existente por link_afiliado OU nome similar
        const existingProduct = await Product.findOne({
          $or: [
            { link_afiliado: product.link_afiliado },
            { link_original: product.link_original },
            { nome: { $regex: new RegExp(normalizedName.split(' ').slice(0, 5).join('.*'), 'i') } }
          ],
          marketplace: 'ML'
        });

        if (existingProduct) {
          // Produto já existe - verifica se deve atualizar
          if (shouldUpdate(existingProduct, product)) {
            await Product.updateOne(
              { _id: existingProduct._id },
              { 
                $set: {
                  ...product,
                  updatedAt: new Date()
                }
              }
            );
            updated++;
            console.log(`🔄 Atualizado: ${product.nome.substring(0, 60)}...`);
            console.log(`   └─ Desconto: ${existingProduct.desconto} → ${product.desconto}`);
            console.log(`   └─ Preço: ${existingProduct.preco} → ${product.preco}\n`);
          } else {
            skipped++;
            console.log(`⏭️  Pulado (já existe melhor): ${product.nome.substring(0, 50)}...\n`);
          }
        } else {
          // Produto novo - insere
          await Product.create({
            ...product,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          inserted++;
          console.log(`✅ Novo produto: ${product.nome.substring(0, 60)}...`);
          console.log(`   └─ Desconto: ${product.desconto} | Preço: ${product.preco}\n`);
        }

      } catch (err) {
        errors++;
        console.error(`❌ Erro ao processar "${product.nome}":`, err.message, '\n');
      }
    }

    // Relatório final
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RELATÓRIO FINAL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Novos produtos inseridos: ${inserted}`);
    console.log(`🔄 Produtos atualizados: ${updated}`);
    console.log(`⏭️  Produtos pulados: ${skipped}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📦 Total processado: ${scrapedProducts.length}`);
    
    const totalInDB = await Product.countDocuments({ marketplace: 'ML', isActive: true });
    console.log(`\n💾 Total de produtos ML ativos no banco: ${totalInDB}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🟢 Automação finalizada com sucesso!');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ ERRO CRÍTICO NA AUTOMAÇÃO:', err);
    console.error('Stack trace:', err.stack);
    process.exit(1);
  }
})();