// back/database/mongodb.js
//
// ESTRUTURA DOS DATABASES:
//   produtos  → ML, shopee, amazon, magalu (collections de produtos)//   cupons    → ML, shopee, amazon, magalu (collections de cupons)
//   whatsapp  → whatsapp_sessions, whatsapp_creds, whatsapp_keys
//

const mongoose = require('mongoose');

const MONGODB_BASE_URI = process.env.MONGODB_URI.split('?')[0].replace('/WebCash', '');
const URI_PARAMS = '?retryWrites=true&w=majority&appName=Promoforia';

const connections = {
  produtos:  null,
  cupons:    null,
  whatsapp:  null
};

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('✅ Usando conexões existentes do MongoDB');
    return connections;
  }

  try {
    mongoose.set('strictQuery', false);
    console.log('📡 Conectando nos databases do MongoDB...\n');

    // DATABASE: produtos
    const produtosUri = `${MONGODB_BASE_URI}/produtos${URI_PARAMS}`;
    connections.produtos = await mongoose.createConnection(produtosUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      directConnection: false,
    }).asPromise();
    console.log(`   ✅ Database produtos: ${connections.produtos.host}`);

    // DATABASE: cupons
    const cuponsUri = `${MONGODB_BASE_URI}/cupons${URI_PARAMS}`;
    connections.cupons = await mongoose.createConnection(cuponsUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      directConnection: false,
    }).asPromise();
    console.log(`   ✅ Database cupons: ${connections.cupons.host}`);

    // DATABASE: whatsapp (sessões + chaves de autenticação)
    const whatsappUri = `${MONGODB_BASE_URI}/whatsapp${URI_PARAMS}`;
    connections.whatsapp = await mongoose.createConnection(whatsappUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      directConnection: false,
    }).asPromise();
    console.log(`   ✅ Database whatsapp: ${connections.whatsapp.host}`);

    isConnected = true;

    console.log('\n✅ Todas as conexões MongoDB estabelecidas!');
    console.log('📊 Databases: produtos, cupons, whatsapp\n');

    return connections;

  } catch (error) {
    console.error('❌ Erro ao conectar MongoDB:', error.message);
    process.exit(1);
  }
};

function getProductConnection() {
  if (!connections.produtos) throw new Error('Database produtos não conectado.');
  return connections.produtos;
}

function getCouponConnection() {
  if (!connections.cupons) throw new Error('Database cupons não conectado.');
  return connections.cupons;
}

function getWhatsAppConnection() {
  if (!connections.whatsapp) throw new Error('Database whatsapp não conectado.');
  return connections.whatsapp;
}

function normalizeMarketplace(marketplace) {
  const mp = (marketplace || 'ML').toString().toLowerCase();
  if (mp === 'ml' || mp === 'mercado livre' || mp === 'mercadolivre') return 'ML';
  if (mp === 'shopee')  return 'shopee';
  if (mp === 'amazon')  return 'amazon';
  if (mp === 'magalu' || mp === 'magazine luiza') return 'magalu';
  return 'ML';
}

function getAllConnections() {
  return connections;
}

function getConnectionStatus() {
  return isConnected;
}

module.exports = {
  connectDB,
  getProductConnection,
  getCouponConnection,
  getWhatsAppConnection,
  getAllConnections,
  getConnectionStatus,
  normalizeMarketplace
};