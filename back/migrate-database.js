// ═══════════════════════════════════════════════════════════
// SCRIPT DE MIGRAÇÃO - VERSÃO CORRETA FINAL
// ═══════════════════════════════════════════════════════════
// 
// ESTRUTURA CORRETA:
// 
// produtos (database)
// ├── ML (collection)
// ├── shopee (collection)
// ├── amazon (collection)
// └── magalu (collection)
//
// cupons (database)
// ├── ML (collection)
// ├── shopee (collection)
// ├── amazon (collection)
// └── magalu (collection)
//
// ═══════════════════════════════════════════════════════════

console.log('\n🔥 INICIANDO MIGRAÇÃO CORRETA...\n');

const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const MONGODB_BASE_URI = process.env.MONGODB_URI.split('?')[0].replace('/WebCash', '');
const URI_PARAMS = '?retryWrites=true&w=majority&appName=Promoforia';
const OLD_DATABASE = 'WebCash';

console.log('⚙️  CONFIGURAÇÃO:');
console.log(`   Database antigo: ${OLD_DATABASE}`);
console.log(`   Novos databases: produtos, cupons`);
console.log('');

// ═══════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════

const ProductSchema = new mongoose.Schema({
  nome: { type: String, required: true, index: true },
  nome_normalizado: { type: String, index: true },
  imagem: { type: String, required: true },
  link_original: { type: String, required: true, unique: true, index: true },
  link_afiliado: { type: String, required: true },
  preco: { type: String, required: true },
  preco_anterior: { type: String, required: true },
  preco_de: { type: String, required: true },
  preco_para: { type: String, required: true },
  desconto: { type: String, required: true, index: true },
  categoria: { type: String, default: 'Todas as Ofertas', index: true },
  avaliacao: { type: String, default: 'N/A' },
  numero_avaliacoes: { type: String, default: '0' },
  frete: { type: String, default: '' },
  parcelas: { type: String, default: '' },
  vendedor: { type: String, default: '' },
  porcentagem_vendido: { type: String, default: 'N/A' },
  tempo_restante: { type: String, default: 'N/A' },
  marketplace: {
    type: String,
    enum: ['ML', 'Amazon', 'Magalu', 'Shopee'],
    required: true,
    index: true
  },
  ultima_verificacao: { type: Date, default: Date.now, index: true },
  isActive: { type: Boolean, default: true, index: true }
}, {
  timestamps: true
});

const CouponSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, index: true },
  descricao: { type: String, required: true },
  desconto: { type: String, required: true },
  tipo: { 
    type: String, 
    enum: ['percentual', 'fixo', 'frete_gratis'], 
    default: 'percentual' 
  },
  marketplace: {
    type: String,
    enum: ['ML', 'Amazon', 'Magalu', 'Shopee'],
    required: true,
    index: true
  },
  link_afiliado: String,
  categoria: { type: String, default: 'Geral', index: true },
  validade: { type: Date, index: true },
  termos_uso: String,
  uso_minimo: String,
  primeira_compra: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  usos: { type: Number, default: 0 },
  limite_usos: Number,
  ultima_verificacao: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true
});

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PARA DELETAR DATABASES ERRADOS
// ═══════════════════════════════════════════════════════════

async function deletarDatabasesErrados() {
  console.log('🗑️  DELETANDO DATABASES ERRADOS...\n');
  
  const databasesParaDeletar = [
    'produtos_ML',
    'produtos_shopee', 
    'produtos_amazon',
    'produtos_magalu',
    'cupons_ML',
    'cupons_shopee',
    'cupons_amazon',
    'cupons_magalu'
  ];

  for (const dbName of databasesParaDeletar) {
    try {
      const uri = `${MONGODB_BASE_URI}/${dbName}${URI_PARAMS}`;
      const conn = await mongoose.createConnection(uri);
      
      await new Promise((resolve, reject) => {
        conn.once('open', resolve);
        conn.once('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
      
      await conn.dropDatabase();
      await conn.close();
      
      console.log(`   ✅ Database deletado: ${dbName}`);
    } catch (error) {
      console.log(`   ⚠️  ${dbName}: ${error.message}`);
    }
  }
  
  console.log('\n✅ Databases errados deletados!\n');
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL DE MIGRAÇÃO
// ═══════════════════════════════════════════════════════════

async function migrate() {
  console.log('🚀 INICIANDO MIGRAÇÃO DO BANCO DE DADOS\n');
  console.log('════════════════════════════════════════════════════════\n');
  
  let oldConnection;
  let produtosConnection;
  let cuponsConnection;

  try {
    // ─────────────────────────────────────────────────────────
    // 1. DELETAR DATABASES ERRADOS PRIMEIRO
    // ─────────────────────────────────────────────────────────
    await deletarDatabasesErrados();

    // ─────────────────────────────────────────────────────────
    // 2. CONECTAR NO DATABASE ANTIGO (WebCash)
    // ─────────────────────────────────────────────────────────
    console.log('📡 Conectando no database antigo (WebCash)...');
    
    const oldUri = `${MONGODB_BASE_URI}/${OLD_DATABASE}${URI_PARAMS}`;
    oldConnection = await mongoose.createConnection(oldUri);
    
    await new Promise((resolve, reject) => {
      oldConnection.once('open', resolve);
      oldConnection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 10000);
    });
    
    console.log(`✅ Conectado em WebCash!`);
    console.log(`   Database: ${oldConnection.name}\n`);

    // ─────────────────────────────────────────────────────────
    // 3. CRIAR CONEXÕES COM OS 2 NOVOS DATABASES
    // ─────────────────────────────────────────────────────────
    console.log('📊 Criando novos databases...\n');

    // Database: produtos
    console.log('   🔗 Conectando em database "produtos"...');
    const produtosUri = `${MONGODB_BASE_URI}/produtos${URI_PARAMS}`;
    produtosConnection = await mongoose.createConnection(produtosUri);
    await new Promise((resolve, reject) => {
      produtosConnection.once('open', resolve);
      produtosConnection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 10000);
    });
    console.log('   ✅ Database "produtos" criado!\n');

    // Database: cupons
    console.log('   🔗 Conectando em database "cupons"...');
    const cuponsUri = `${MONGODB_BASE_URI}/cupons${URI_PARAMS}`;
    cuponsConnection = await mongoose.createConnection(cuponsUri);
    await new Promise((resolve, reject) => {
      cuponsConnection.once('open', resolve);
      cuponsConnection.once('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 10000);
    });
    console.log('   ✅ Database "cupons" criado!\n');

    console.log('✅ Todos os databases foram criados!\n');

    // ─────────────────────────────────────────────────────────
    // 4. CRIAR MODELS (COLLECTIONS)
    // ─────────────────────────────────────────────────────────
    console.log('📝 Criando collections (models)...\n');

    // Collections no database "produtos"
    const ProductML = produtosConnection.model('ML', ProductSchema, 'ML');
    const ProductShopee = produtosConnection.model('shopee', ProductSchema, 'shopee');
    const ProductAmazon = produtosConnection.model('amazon', ProductSchema, 'amazon');
    const ProductMagalu = produtosConnection.model('magalu', ProductSchema, 'magalu');
    
    console.log('   ✅ Collections criadas no database "produtos":');
    console.log('      - ML');
    console.log('      - shopee');
    console.log('      - amazon');
    console.log('      - magalu\n');

    // Collections no database "cupons"
    const CouponML = cuponsConnection.model('ML', CouponSchema, 'ML');
    const CouponShopee = cuponsConnection.model('shopee', CouponSchema, 'shopee');
    const CouponAmazon = cuponsConnection.model('amazon', CouponSchema, 'amazon');
    const CouponMagalu = cuponsConnection.model('magalu', CouponSchema, 'magalu');
    
    console.log('   ✅ Collections criadas no database "cupons":');
    console.log('      - ML');
    console.log('      - shopee');
    console.log('      - amazon');
    console.log('      - magalu\n');

    console.log('✅ Todas as collections criadas!\n');

    // ─────────────────────────────────────────────────────────
    // 5. VERIFICAR E MIGRAR DADOS ANTIGOS
    // ─────────────────────────────────────────────────────────
    console.log('🔍 Verificando collections antigas no WebCash...\n');
    
    const collections = await oldConnection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log(`📦 Collections encontradas:`);
    collectionNames.forEach(name => console.log(`   - ${name}`));
    console.log('');

    if (collectionNames.includes('produtos')) {
      console.log('📦 Collection "produtos" encontrada. Iniciando migração...\n');
      
      const OldProduct = oldConnection.model('produtos', ProductSchema, 'produtos');
      
      console.log('   🔍 Contando produtos...');
      const totalCount = await OldProduct.countDocuments();
      console.log(`   📊 Total de produtos: ${totalCount}\n`);
      
      if (totalCount === 0) {
        console.log('   ⚠️  Nenhum produto encontrado para migrar.\n');
      } else {
        console.log('   📥 Buscando produtos...');
        const oldProducts = await OldProduct.find({}).lean();
        console.log(`   ✅ ${oldProducts.length} produtos carregados\n`);

        let countML = 0;
        let countShopee = 0;
        let countAmazon = 0;
        let countMagalu = 0;
        let errors = 0;

        console.log('   🔄 Migrando produtos...\n');

        for (let i = 0; i < oldProducts.length; i++) {
          const productData = { ...oldProducts[i] };
          delete productData._id;
          delete productData.__v;
          
          const marketplace = (productData.marketplace || 'ML').toString();
          
          try {
            if (marketplace === 'ML') {
              await ProductML.create(productData);
              countML++;
            } else if (marketplace === 'Shopee') {
              await ProductShopee.create(productData);
              countShopee++;
            } else if (marketplace === 'Amazon') {
              await ProductAmazon.create(productData);
              countAmazon++;
            } else if (marketplace === 'Magalu') {
              await ProductMagalu.create(productData);
              countMagalu++;
            }
            
            if ((i + 1) % 10 === 0 || i === oldProducts.length - 1) {
              process.stdout.write(`   📦 Progresso: ${i + 1}/${oldProducts.length} produtos migrados...\r`);
            }
          } catch (error) {
            errors++;
            if (errors <= 3) {
              console.log(`\n   ⚠️  Erro ao migrar produto ${i + 1}: ${error.message}`);
            }
          }
        }

        console.log('\n\n✅ MIGRAÇÃO DE PRODUTOS CONCLUÍDA:\n');
        console.log(`   🛒 Mercado Livre: ${countML} produtos`);
        console.log(`   🛍️  Shopee: ${countShopee} produtos`);
        console.log(`   📦 Amazon: ${countAmazon} produtos`);
        console.log(`   🏪 Magazine Luiza: ${countMagalu} produtos`);
        console.log(`   📊 Total: ${countML + countShopee + countAmazon + countMagalu} produtos migrados`);
        if (errors > 0) {
          console.log(`   ⚠️  Erros: ${errors}`);
        }
        console.log('');
      }
    } else {
      console.log('ℹ️  Nenhuma collection "produtos" encontrada.\n');
    }

    // ─────────────────────────────────────────────────────────
    // 6. CRIAR CUPONS DE EXEMPLO
    // ─────────────────────────────────────────────────────────
    console.log('🎟️  Criando cupons de exemplo...\n');

    const exampleCoupons = [
      {
        codigo: 'BEMVINDO10',
        descricao: '10% de desconto na primeira compra',
        desconto: '10%',
        tipo: 'percentual',
        marketplace: 'ML',
        categoria: 'Primeira Compra',
        validade: new Date('2025-12-31'),
        primeira_compra: true,
        isActive: true
      },
      {
        codigo: 'FRETEGRATIS',
        descricao: 'Frete grátis em compras acima de R$ 99',
        desconto: 'Frete Grátis',
        tipo: 'frete_gratis',
        marketplace: 'ML',
        categoria: 'Frete',
        uso_minimo: 'R$ 99',
        validade: new Date('2025-12-31'),
        isActive: true
      },
      {
        codigo: 'TECH50',
        descricao: '50% OFF em Tecnologia',
        desconto: '50%',
        tipo: 'percentual',
        marketplace: 'ML',
        categoria: 'Tecnologia',
        uso_minimo: 'R$ 500',
        validade: new Date('2025-12-31'),
        isActive: true
      }
    ];

    for (const coupon of exampleCoupons) {
      try {
        await CouponML.create(coupon);
        console.log(`   ✅ Cupom criado: ${coupon.codigo} - ${coupon.descricao}`);
      } catch (error) {
        console.log(`   ⚠️  Cupom ${coupon.codigo}: ${error.message}`);
      }
    }

    console.log('\n✅ Cupons de exemplo criados!\n');

    // ─────────────────────────────────────────────────────────
    // 7. RESUMO FINAL
    // ─────────────────────────────────────────────────────────
    console.log('════════════════════════════════════════════════════════');
    console.log('✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');
    console.log('📊 NOVA ESTRUTURA (CORRETA):');
    console.log('');
    console.log('   produtos (database)');
    console.log('   ├── ML (collection)');
    console.log('   ├── shopee (collection)');
    console.log('   ├── amazon (collection)');
    console.log('   └── magalu (collection)');
    console.log('');
    console.log('   cupons (database)');
    console.log('   ├── ML (collection)');
    console.log('   ├── shopee (collection)');
    console.log('   ├── amazon (collection)');
    console.log('   └── magalu (collection)');
    console.log('════════════════════════════════════════════════════════\n');
    
    console.log('⚠️  PRÓXIMOS PASSOS:');
    console.log('   1. ✅ Databases criados corretamente');
    console.log('   2. 🔍 Verifique no MongoDB Atlas');
    console.log('   3. 📝 Substitua database/mongodb.js');
    console.log('   4. 📝 Substitua database/models/Products.js');
    console.log('   5. 📝 Adicione database/models/Coupons.js');
    console.log('   6. 🧪 Teste a aplicação');
    console.log('   7. 🗑️  Delete o database WebCash se quiser\n');

  } catch (error) {
    console.error('\n❌ ERRO NA MIGRAÇÃO:');
    console.error('   Mensagem:', error.message);
    console.error('   Stack:', error.stack);
  } finally {
    console.log('🔌 Fechando conexões...\n');
    
    if (oldConnection) {
      await oldConnection.close();
      console.log('   ✅ Conexão WebCash fechada');
    }
    
    if (produtosConnection) {
      await produtosConnection.close();
      console.log('   ✅ Conexão produtos fechada');
    }
    
    if (cuponsConnection) {
      await cuponsConnection.close();
      console.log('   ✅ Conexão cupons fechada');
    }
    
    console.log('\n✅ Migração finalizada.\n');
    process.exit(0);
  }
}

// ═══════════════════════════════════════════════════════════
// EXECUTAR
// ═══════════════════════════════════════════════════════════

migrate().catch(error => {
  console.error('\n💥 ERRO FATAL:', error);
  process.exit(1);
});