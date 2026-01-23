/**
 * ═══════════════════════════════════════════════════════════════════════
 * PRODUCTS MODEL - ENTERPRISE EDITION
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Model MongoDB profissional para produtos de múltiplos marketplaces
 * Sistema unificado com categorias dinâmicas
 * 
 * @version 2.0.0
 * @author Dashboard Promoforia
 * @license Proprietary
 */

const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Carrega categorias do Magalu se disponíveis
 */
function getMagaluCategorySlugs() {
  try {
    const { getUniqueCategoryNames } = require('../../config/categorias-magalu');
    return getUniqueCategoryNames();
  } catch (error) {
    return [];
  }
}

/**
 * Normaliza o nome do marketplace
 */
function normalizeMarketplaceName(marketplace) {
  const mp = (marketplace || 'ML').toString().toLowerCase();
  
  const marketplaceMap = {
    'ml': 'ML',
    'mercado livre': 'ML',
    'mercadolivre': 'ML',
    'shopee': 'shopee',
    'amazon': 'amazon',
    'magalu': 'magalu',
    'magazine luiza': 'magalu'
  };
  
  return marketplaceMap[mp] || 'ML';
}

// ═══════════════════════════════════════════════════════════════════════
// CATEGORIAS SUPORTADAS
// ═══════════════════════════════════════════════════════════════════════

const BASE_CATEGORIES = [
  // Mercado Livre
  'Celulares',
  'Eletrodomésticos',
  'Casa e Decoração',
  'Calçados e Roupas',
  'Joias e Relógios',
  'Ofertas Relâmpago',
  
  // Compartilhadas
  'Todas as Ofertas',
  'Ofertas do Dia',
  'Internacional',
  'Casa',
  'Ferramentas',
  'Eletroportáteis',
  'Brinquedos',
  'Automotivo',
  'Domésticos',
  'Preços Imbatíveis',
  'Moda',
  'Beleza',
  'Esportes',
  'Livros',
  'Games',
  'Informática'
];

// Adiciona categorias dinâmicas do Magalu
const ALL_CATEGORIES = [...BASE_CATEGORIES, ...getMagaluCategorySlugs()];

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const ProductSchema = new mongoose.Schema({
  // Informações básicas
  nome: { 
    type: String, 
    required: true, 
    index: true,
    trim: true
  },
  
  nome_normalizado: { 
    type: String, 
    index: true 
  },
  
  // Imagem
  imagem: { 
    type: String, 
    required: true 
  },
  
  // Links
  link_original: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  link_afiliado: { 
    type: String, 
    required: true, 
    unique: true
  },
  
  // Preços
  preco: { 
    type: String, 
    required: true 
  },
  
  preco_anterior: { 
    type: String, 
    required: true 
  },
  
  preco_de: { 
    type: String, 
    required: true 
  },
  
  preco_para: { 
    type: String, 
    required: true 
  },
  
  desconto: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  // Categoria
  categoria: { 
    type: String, 
    default: 'Ofertas do Dia', 
    index: true,
    enum: ALL_CATEGORIES
  },
  
  // Informações adicionais (opcionais)
  avaliacao: { 
    type: String, 
    default: 'N/A' 
  },
  
  numero_avaliacoes: { 
    type: String, 
    default: '0' 
  },
  
  frete: { 
    type: String, 
    default: '' 
  },
  
  parcelas: { 
    type: String, 
    default: '' 
  },
  
  vendedor: { 
    type: String, 
    default: '' 
  },
  
  porcentagem_vendido: { 
    type: String, 
    default: 'N/A' 
  },
  
  tempo_restante: { 
    type: String, 
    default: 'N/A' 
  },
  
  // Marketplace
  marketplace: {
    type: String,
    enum: ['ML', 'Amazon', 'Magalu', 'Shopee', 'MAGALU'],
    required: true,
    index: true
  },
  
  // Status
  ultima_verificacao: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
  
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  }
}, {
  timestamps: true,
  collection: undefined // Será definido dinamicamente
});

// ═══════════════════════════════════════════════════════════════════════
// ÍNDICES COMPOSTOS PARA PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════

ProductSchema.index({ marketplace: 1, desconto: -1 });
ProductSchema.index({ categoria: 1, ultima_verificacao: -1 });
ProductSchema.index({ isActive: 1, marketplace: 1 });
ProductSchema.index({ marketplace: 1, categoria: 1 });
ProductSchema.index({ link_afiliado: 1 }, { unique: true });

// ═══════════════════════════════════════════════════════════════════════
// HOOKS (Middleware)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Pre-save: Normaliza nome para busca de duplicatas
 */
ProductSchema.pre('save', async function() {
  if (this.nome && !this.nome_normalizado) {
    this.nome_normalizado = this.nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
});

// ═══════════════════════════════════════════════════════════════════════
// MÉTODOS ESTÁTICOS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Busca produtos ativos com filtros
 */
ProductSchema.statics.findActiveProducts = function(filters = {}) {
  const query = { isActive: true, ...filters };
  return this.find(query).sort({ desconto: -1, createdAt: -1 });
};

/**
 * Busca produtos por desconto mínimo
 */
ProductSchema.statics.findByMinDiscount = function(minDiscount, marketplace = null) {
  const query = { isActive: true };
  
  if (marketplace) {
    query.marketplace = marketplace;
  }
  
  return this.find(query).where('desconto').gte(minDiscount).sort({ desconto: -1 });
};

/**
 * Atualiza status de produtos antigos
 */
ProductSchema.statics.deactivateOldProducts = async function(daysOld = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await this.updateMany(
    { 
      ultima_verificacao: { $lt: cutoffDate },
      isActive: true 
    },
    { 
      isActive: false 
    }
  );
  
  return result.modifiedCount;
};

// ═══════════════════════════════════════════════════════════════════════
// CACHE DE MODELS
// ═══════════════════════════════════════════════════════════════════════

const modelCache = {};

/**
 * Retorna ou cria model para um marketplace específico
 * 
 * @param {string} marketplace - ML, shopee, amazon, ou magalu
 * @param {Connection} connection - Conexão do database "produtos"
 * @returns {Model} Model do Mongoose
 */
function getProductModel(marketplace, connection) {
  if (!connection) {
    throw new Error('❌ Connection é obrigatória. Use getProductConnection() do mongodb.js');
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

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  ProductSchema,
  getProductModel,
  normalizeMarketplaceName
};

// ═══════════════════════════════════════════════════════════════════════
// EXEMPLO DE USO
// ═══════════════════════════════════════════════════════════════════════

/*
const { getProductConnection } = require('../mongodb');
const { getProductModel } = require('./Products');

// Obter model do Mercado Livre
const conn = getProductConnection();
const ProductML = getProductModel('ML', conn);

// Criar produto
await ProductML.create({
  nome: 'iPhone 15 Pro',
  imagem: 'https://...',
  link_original: 'https://...',
  link_afiliado: 'https://...',
  preco: 'R$ 5.999',
  preco_anterior: 'R$ 7.999',
  preco_de: '799900',
  preco_para: '599900',
  desconto: '25%',
  categoria: 'Celulares',
  marketplace: 'ML',
  isActive: true
});

// Buscar produtos ativos
const produtosAtivos = await ProductML.findActiveProducts({ categoria: 'Celulares' });

// Buscar por desconto mínimo
const ofertas = await ProductML.findByMinDiscount(30);

// Desativar produtos antigos
const desativados = await ProductML.deactivateOldProducts(7);
console.log(`${desativados} produtos foram desativados`);
*/