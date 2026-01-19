// ═══════════════════════════════════════════════════════════
// database/models/Products.js - VERSÃO CORRETA
// ═══════════════════════════════════════════════════════════
//
// Usa o database "produtos" com collections: ML, shopee, amazon, magalu
//
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// SCHEMA
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

// Índices compostos para performance
ProductSchema.index({ marketplace: 1, desconto: -1 });
ProductSchema.index({ categoria: 1, ultima_verificacao: -1 });
ProductSchema.index({ isActive: 1, marketplace: 1 });
ProductSchema.index({ link_original: 1 }, { unique: true });

// ═══════════════════════════════════════════════════════════
// CACHE DE MODELS
// ═══════════════════════════════════════════════════════════

const modelCache = {};

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PARA OBTER MODEL
// ═══════════════════════════════════════════════════════════

/**
 * Retorna o model de produtos para um marketplace específico
 * @param {string} marketplace - ML, shopee, amazon, ou magalu
 * @param {Connection} connection - Conexão do database "produtos" (obtida via getProductConnection)
 * @returns {Model} Model do Mongoose
 */
function getProductModel(marketplace, connection) {
  if (!connection) {
    throw new Error('Connection é obrigatória. Use getProductConnection() do mongodb.js');
  }

  const mp = normalizeMarketplaceName(marketplace);
  const cacheKey = `produtos_${mp}`;

  // Retorna do cache se já existe
  if (modelCache[cacheKey]) {
    return modelCache[cacheKey];
  }

  // Cria e armazena no cache
  // Database: produtos
  // Collection: ML, shopee, amazon ou magalu
  const model = connection.model(mp, ProductSchema, mp);
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
  ProductSchema,
  getProductModel,
  normalizeMarketplaceName
};

// ═══════════════════════════════════════════════════════════
// EXEMPLO DE USO:
// ═══════════════════════════════════════════════════════════

/*
const { getProductConnection } = require('../mongodb');
const { getProductModel } = require('./Products');

// Obter conexão do database "produtos"
const conn = getProductConnection();

// Obter model da collection "ML"
const ProductML = getProductModel('ML', conn);

// Usar o model
const produtos = await ProductML.find({ 
  isActive: true,
  desconto: { $gte: '30%' }
}).limit(50);

// Criar produto
await ProductML.create({
  nome: 'Produto Teste',
  imagem: 'https://...',
  link_original: 'https://...',
  link_afiliado: 'https://...',
  preco: 'R$ 100',
  preco_anterior: 'R$ 150',
  preco_de: 'R$ 150',
  preco_para: 'R$ 100',
  desconto: '33%',
  marketplace: 'ML',
  isActive: true
});
*/