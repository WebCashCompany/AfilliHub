// ═══════════════════════════════════════════════════════════
// database/models/Coupons.js - VERSÃO CORRETA
// ═══════════════════════════════════════════════════════════
//
// Usa o database "cupons" com collections: ML, shopee, amazon, magalu
//
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════

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

// Índices
CouponSchema.index({ codigo: 1 }, { unique: true });
CouponSchema.index({ marketplace: 1, isActive: 1 });
CouponSchema.index({ validade: 1 });
CouponSchema.index({ categoria: 1, marketplace: 1 });

// ═══════════════════════════════════════════════════════════
// CACHE DE MODELS
// ═══════════════════════════════════════════════════════════

const modelCache = {};

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PARA OBTER MODEL
// ═══════════════════════════════════════════════════════════

/**
 * Retorna o model de cupons para um marketplace específico
 * @param {string} marketplace - ML, shopee, amazon, ou magalu
 * @param {Connection} connection - Conexão do database "cupons" (obtida via getCouponConnection)
 * @returns {Model} Model do Mongoose
 */
function getCouponModel(marketplace, connection) {
  if (!connection) {
    throw new Error('Connection é obrigatória. Use getCouponConnection() do mongodb.js');
  }

  const mp = normalizeMarketplaceName(marketplace);
  const cacheKey = `cupons_${mp}`;

  // Retorna do cache se já existe
  if (modelCache[cacheKey]) {
    return modelCache[cacheKey];
  }

  // Cria e armazena no cache
  // Database: cupons
  // Collection: ML, shopee, amazon ou magalu
  const model = connection.model(mp, CouponSchema, mp);
  modelCache[cacheKey] = model;

  return model;
}

/**
 * Normaliza o nome do marketplace
 * @param {string} marketplace 
 * @returns {string}
 */
function normalizeMarketplaceName(marketplace) {
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
  
  return 'ML';
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  CouponSchema,
  getCouponModel,
  normalizeMarketplaceName
};

// ═══════════════════════════════════════════════════════════
// EXEMPLO DE USO:
// ═══════════════════════════════════════════════════════════

/*
const { getCouponConnection } = require('../mongodb');
const { getCouponModel } = require('./Coupons');

// Obter conexão do database "cupons"
const conn = getCouponConnection();

// Obter model da collection "ML"
const CouponML = getCouponModel('ML', conn);

// Buscar cupons ativos
const cuponsAtivos = await CouponML.find({
  isActive: true,
  validade: { $gte: new Date() }
}).sort({ createdAt: -1 });

// Criar cupom
await CouponML.create({
  codigo: 'PROMO10OFF',
  descricao: '10% de desconto em toda loja',
  desconto: '10%',
  tipo: 'percentual',
  marketplace: 'ML',
  categoria: 'Geral',
  validade: new Date('2025-12-31'),
  link_afiliado: 'https://...',
  isActive: true
});

// Incrementar uso de cupom
await CouponML.updateOne(
  { codigo: 'PROMO10OFF' },
  { $inc: { usos: 1 } }
);

// Buscar cupons por categoria
const cuponsFrete = await CouponML.find({
  tipo: 'frete_gratis',
  isActive: true
});
*/