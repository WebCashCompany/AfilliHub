/**
 * ═══════════════════════════════════════════════════════════════════════
 * PRODUCTS MODEL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Cada produto pertence a um usuário (userId = Supabase auth.uid).
 * Todos os índices e queries incluem userId para isolamento total.
 */

const mongoose = require('mongoose');

function getMagaluCategorySlugs() {
  try {
    const { getUniqueCategoryNames } = require('../../config/categorias-magalu');
    return getUniqueCategoryNames();
  } catch (error) {
    return [];
  }
}

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

const BASE_CATEGORIES = [
  'Celulares', 'Eletrodomésticos', 'Casa e Decoração', 'Calçados e Roupas',
  'Joias e Relógios', 'Ofertas Relâmpago', 'Esportes e Fitness',
  'Eletrônicos, Áudio e Vídeo', 'Ferramentas', 'Informática',
  'Acessórios para Veículos', 'Beleza e Cuidado Pessoal', 'Saúde',
  'Brinquedos e Hobbies', 'Games', 'Todas as Ofertas', 'Ofertas do Dia',
  'Internacional', 'Casa', 'Eletroportáteis', 'Brinquedos', 'Automotivo',
  'Domésticos', 'Preços Imbatíveis', 'Moda', 'Beleza', 'Esportes', 'Livros'
];

const ALL_CATEGORIES = [...BASE_CATEGORIES, ...getMagaluCategorySlugs()];

const ProductSchema = new mongoose.Schema({
  // ─── ISOLAMENTO POR USUÁRIO ───────────────────────────────────────────
  // userId corresponde ao auth.uid() do Supabase.
  // Obrigatório — sem ele o produto não é salvo.
  userId: {
    type: String,
    required: true,
    index: true,
  },

  // ─── DADOS DO PRODUTO ────────────────────────────────────────────────
  nome:               { type: String, required: true, index: true, trim: true },
  nome_normalizado:   { type: String, index: true },
  imagem:             { type: String, required: true },
  link_original:      { type: String, required: true, index: true },

  // link_afiliado único POR usuário (índice composto abaixo)
  link_afiliado:      { type: String, required: true },

  preco:              { type: String, required: true },
  preco_anterior:     { type: String, required: true },
  preco_de:           { type: String, required: true },
  preco_para:         { type: String, required: true },
  desconto:           { type: String, required: true, index: true },

  categoria: {
    type: String,
    default: 'Ofertas do Dia',
    index: true,
    enum: ALL_CATEGORIES,
  },

  avaliacao:           { type: String, default: 'N/A' },
  numero_avaliacoes:   { type: String, default: '0' },
  frete:               { type: String, default: '' },
  parcelas:            { type: String, default: '' },
  vendedor:            { type: String, default: '' },
  porcentagem_vendido: { type: String, default: 'N/A' },
  tempo_restante:      { type: String, default: 'N/A' },

  marketplace: {
    type: String,
    enum: ['ML', 'Amazon', 'Magalu', 'Shopee', 'MAGALU'],
    required: true,
    index: true,
  },

  ultima_verificacao: { type: Date, default: Date.now, index: true },
  isActive:           { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
  collection: undefined,
});

// ─── ÍNDICES COMPOSTOS ────────────────────────────────────────────────
// Todos incluem userId para garantir isolamento nas queries

// Unicidade de link_afiliado por usuário (substitui o unique global anterior)
ProductSchema.index({ userId: 1, link_afiliado: 1 }, { unique: true });

ProductSchema.index({ userId: 1, marketplace: 1, desconto: -1 });
ProductSchema.index({ userId: 1, categoria: 1, ultima_verificacao: -1 });
ProductSchema.index({ userId: 1, isActive: 1, marketplace: 1 });
ProductSchema.index({ userId: 1, marketplace: 1, categoria: 1 });

// ─── HOOKS ────────────────────────────────────────────────────────────

ProductSchema.pre('save', async function () {
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

// ─── MÉTODOS ESTÁTICOS ────────────────────────────────────────────────

ProductSchema.statics.findActiveProducts = function (userId, filters = {}) {
  return this.find({ userId, isActive: true, ...filters }).sort({ desconto: -1, createdAt: -1 });
};

ProductSchema.statics.findByMinDiscount = function (userId, minDiscount, marketplace = null) {
  const query = { userId, isActive: true };
  if (marketplace) query.marketplace = marketplace;
  return this.find(query).where('desconto').gte(minDiscount).sort({ desconto: -1 });
};

ProductSchema.statics.deactivateOldProducts = async function (userId, daysOld = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  const result = await this.updateMany(
    { userId, ultima_verificacao: { $lt: cutoffDate }, isActive: true },
    { isActive: false }
  );
  return result.modifiedCount;
};

// ─── CACHE DE MODELS ──────────────────────────────────────────────────

const modelCache = {};

function getProductModel(marketplace, connection) {
  if (!connection) {
    throw new Error('❌ Connection é obrigatória. Use getProductConnection() do mongodb.js');
  }

  const mp = normalizeMarketplaceName(marketplace);
  const cacheKey = `produtos_${mp}`;

  if (modelCache[cacheKey]) return modelCache[cacheKey];

  const model = connection.model(mp, ProductSchema, mp);
  modelCache[cacheKey] = model;
  return model;
}

module.exports = { ProductSchema, getProductModel, normalizeMarketplaceName };