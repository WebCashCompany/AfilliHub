// ═══════════════════════════════════════════════════════════
// database/mongodb.js - VERSÃO CORRETA
// ═══════════════════════════════════════════════════════════
//
// ESTRUTURA:
// produtos (database) → ML, shopee, amazon, magalu (collections)
// cupons (database) → ML, shopee, amazon, magalu (collections)
//
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const MONGODB_BASE_URI = process.env.MONGODB_URI.split('?')[0].replace('/WebCash', '');
const URI_PARAMS = '?retryWrites=true&w=majority&appName=Promoforia';

// Armazena as conexões ativas
const connections = {
  produtos: null,
  cupons: null
};

let isConnected = false;

// ═══════════════════════════════════════════════════════════
// FUNÇÃO DE CONEXÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════

const connectDB = async () => {
  if (isConnected) {
    console.log('✅ Usando conexões existentes do MongoDB');
    return connections;
  }

  try {
    mongoose.set('strictQuery', false);

    console.log('📡 Conectando nos databases do MongoDB...\n');

    // ─────────────────────────────────────────────────────────
    // CONECTAR NO DATABASE "produtos"
    // ─────────────────────────────────────────────────────────
    const produtosUri = `${MONGODB_BASE_URI}/produtos${URI_PARAMS}`;
    connections.produtos = await mongoose.createConnection(produtosUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`   ✅ Database produtos: ${connections.produtos.host}`);

    // ─────────────────────────────────────────────────────────
    // CONECTAR NO DATABASE "cupons"
    // ─────────────────────────────────────────────────────────
    const cuponsUri = `${MONGODB_BASE_URI}/cupons${URI_PARAMS}`;
    connections.cupons = await mongoose.createConnection(cuponsUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`   ✅ Database cupons: ${connections.cupons.host}`);

    isConnected = true;
    
    console.log('\n✅ Todas as conexões MongoDB estabelecidas!');
    console.log('📊 Databases conectados: produtos, cupons\n');

    return connections;

  } catch (error) {
    console.error('❌ Erro ao conectar MongoDB:', error.message);
    process.exit(1);
  }
};

// ═══════════════════════════════════════════════════════════
// EVENTOS DE CONEXÃO
// ═══════════════════════════════════════════════════════════

// Monitora desconexões
if (connections.produtos) {
  connections.produtos.on('disconnected', () => {
    console.log('⚠️ MongoDB desconectado (produtos)');
    isConnected = false;
  });
  
  connections.produtos.on('error', (err) => {
    console.error('❌ Erro MongoDB (produtos):', err);
  });
}

if (connections.cupons) {
  connections.cupons.on('disconnected', () => {
    console.log('⚠️ MongoDB desconectado (cupons)');
    isConnected = false;
  });
  
  connections.cupons.on('error', (err) => {
    console.error('❌ Erro MongoDB (cupons):', err);
  });
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Retorna a conexão do database de produtos
 * @returns {Connection} Conexão do MongoDB
 */
function getProductConnection() {
  if (!connections.produtos) {
    throw new Error('Database produtos não conectado. Execute connectDB() primeiro.');
  }
  return connections.produtos;
}

/**
 * Retorna a conexão do database de cupons
 * @returns {Connection} Conexão do MongoDB
 */
function getCouponConnection() {
  if (!connections.cupons) {
    throw new Error('Database cupons não conectado. Execute connectDB() primeiro.');
  }
  return connections.cupons;
}

/**
 * Normaliza o nome do marketplace
 * @param {string} marketplace 
 * @returns {string} Nome normalizado (ML, shopee, amazon, magalu)
 */
function normalizeMarketplace(marketplace) {
  const mp = (marketplace || 'ML').toString().toLowerCase();
  
  if (mp === 'ml' || mp === 'mercado livre' || mp === 'mercadolivre') {
    return 'ML';
  } else if (mp === 'shopee') {
    return 'shopee';
  } else if (mp === 'amazon') {
    return 'amazon';
  } else if (mp === 'magalu' || mp === 'magazine luiza') {
    return 'magalu';
  }
  
  return 'ML'; // Default
}

/**
 * Retorna todas as conexões ativas
 * @returns {Object} Objeto com todas as conexões
 */
function getAllConnections() {
  return connections;
}

/**
 * Verifica se está conectado
 * @returns {boolean}
 */
function getConnectionStatus() {
  return isConnected;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  connectDB,
  getProductConnection,
  getCouponConnection,
  getAllConnections,
  getConnectionStatus,
  normalizeMarketplace
};

// ═══════════════════════════════════════════════════════════
// EXEMPLO DE USO:
// ═══════════════════════════════════════════════════════════

/*
const { connectDB, getProductConnection } = require('./database/mongodb');
const { getProductModel } = require('./database/models/Products');

// Na inicialização do servidor
await connectDB();

// Para usar produtos do Mercado Livre
const conn = getProductConnection(); // Database "produtos"
const ProductML = getProductModel('ML', conn); // Collection "ML"

const produtos = await ProductML.find({ isActive: true });
*/