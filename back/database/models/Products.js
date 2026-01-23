// ═══════════════════════════════════════════════════════════
// database/models/Products.js - VERSÃO CORRIGIDA
// ═══════════════════════════════════════════════════════════
//
// ✅ Categorias do Mercado Livre adicionadas
// ✅ Mantém compatibilidade total com Magalu
// ✅ Sem interferências
//
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');

// Função auxiliar para obter slugs das categorias do Magalu (se existir)
function getCategorySlugs() {
  try {
    const { getUniqueCategoryNames } = require('../../config/categorias-magalu');
    return getUniqueCategoryNames();
  } catch (error) {
    // Se categorias-magalu não existir, retorna array vazio
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════

const ProductSchema = new mongoose.Schema({
  nome: { type: String, required: true, index: true },
  nome_normalizado: { type: String, index: true },
  imagem: { type: String, required: true },
  link_original: { type: String, required: true, index: true },
  link_afiliado: { type: String, required: true, unique: true, index: true },
  preco: { type: String, required: true },
  preco_anterior: { type: String, required: true },
  preco_de: { type: String, required: true },
  preco_para: { type: String, required: true },
  desconto: { type: String, required: true, index: true },
  
  // ═══════════════════════════════════════════════════════════
  // 📂 CATEGORIA - ENUM COMPLETO (ML + MAGALU + OUTROS)
  // ═══════════════════════════════════════════════════════════
  categoria: { 
    type: String, 
    default: 'Ofertas do Dia', 
    index: true,
    enum: [
      // ════════════════════════════════════════════════════
      // 📱 CATEGORIAS DO MERCADO LIVRE
      // ════════════════════════════════════════════════════
      'Celulares',
      'Eletrodomésticos',
      'Casa e Decoração',
      'Calçados e Roupas',
      'Joias e Relógios',
      'Ofertas Relâmpago',
      
      // ════════════════════════════════════════════════════
      // 🛒 CATEGORIAS COMPARTILHADAS
      // ════════════════════════════════════════════════════
      'Todas as Ofertas',
      'Ofertas do Dia',
      'Internacional',
      'Casa',
      'Ferramentas',
      'Eletroportáteis',
      'Brinquedos',
      'Automotivo',
      'Domésticos',
      'Eletrônicos',
      'Moda',
      'Beleza',
      'Esportes',
      'Livros',
      'Games',
      'Informática',
      
      // ════════════════════════════════════════════════════
      // 🏪 CATEGORIAS DINÂMICAS DO MAGALU (SE EXISTIR)
      // ════════════════════════════════════════════════════
      ...getCategorySlugs()
    ]
  },
  
  avaliacao: { type: String, default: 'N/A' },
  numero_avaliacoes: { type: String, default: '0' },
  frete: { type: String, default: '' },
  parcelas: { type: String, default: '' },
  vendedor: { type: String, default: '' },
  porcentagem_vendido: { type: String, default: 'N/A' },
  tempo_restante: { type: String, default: 'N/A' },
  marketplace: {
    type: String,
    enum: ['ML', 'Amazon', 'Magalu', 'Shopee', 'MAGALU'],
    required: true,
    index: true
  },
  ultima_verificacao: { type: Date, default: Date.now, index: true },
  isActive: { type: Boolean, default: true, index: true }
}, {
  timestamps: true
});

// ═══════════════════════════════════════════════════════════
// ÍNDICES COMPOSTOS
// ═══════════════════════════════════════════════════════════
ProductSchema.index({ marketplace: 1, desconto: -1 });
ProductSchema.index({ categoria: 1, ultima_verificacao: -1 });
ProductSchema.index({ isActive: 1, marketplace: 1 });
ProductSchema.index({ link_afiliado: 1 }, { unique: true });
ProductSchema.index({ marketplace: 1, categoria: 1 });

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
 * @param {Connection} connection - Conexão do database "produtos"
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
// EXEMPLO DE USO
// ═══════════════════════════════════════════════════════════
/*
const { getProductConnection } = require('../mongodb');
const { getProductModel } = require('./Products');

// MERCADO LIVRE
const conn = getProductConnection();
const ProductML = getProductModel('ML', conn);

await ProductML.create({
  nome: 'iPhone 15 Pro',
  imagem: 'https://...',
  link_original: 'https://produto.mercadolivre.com.br/...',
  link_afiliado: 'https://produto.mercadolivre.com.br/...?matt_tool=12345',
  preco: 'R$ 5.999',
  preco_anterior: 'R$ 7.999',
  preco_de: '799900',
  preco_para: '599900',
  desconto: '25%',
  categoria: 'Celulares', // ✅ Categoria do ML
  marketplace: 'ML',
  isActive: true
});

// MAGALU (sem alterações)
const ProductMagalu = getProductModel('magalu', conn);

await ProductMagalu.create({
  nome: 'Furadeira Bosch',
  imagem: 'https://...',
  link_original: 'https://...',
  link_afiliado: 'https://...',
  preco: 'R$ 100',
  preco_anterior: 'R$ 150',
  preco_de: '15000',
  preco_para: '10000',
  desconto: '33%',
  categoria: 'Ferramentas', // ✅ Funciona igual
  marketplace: 'MAGALU',
  isActive: true
});
*/