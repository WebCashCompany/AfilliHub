const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  nome: { type: String, required: true, index: true },
  imagem: { type: String, required: true },
  link_afiliado: { type: String, required: true, unique: true },
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
    default: 'ML',
    index: true
  },
  ultima_verificacao: { type: Date, default: Date.now, index: true },
  isActive: { type: Boolean, default: true, index: true }
}, {
  collection: 'produtos',
  timestamps: true
});

ProductSchema.index({ marketplace: 1, desconto: -1 });
ProductSchema.index({ categoria: 1, ultima_verificacao: -1 });

module.exports = mongoose.model('Product', ProductSchema);
