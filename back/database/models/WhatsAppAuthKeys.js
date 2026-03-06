// back/database/models/WhatsAppAuthKeys.js
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────
// SCHEMA: CREDENCIAIS PRINCIPAIS
// ─────────────────────────────────────────────────────────
const whatsappCredsSchema = new mongoose.Schema({
  // userId = auth.uid() do Supabase — isolamento obrigatório
  userId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true
  },
  creds: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'whatsapp_creds',
  timestamps: false
});

// Unicidade: (userId + sessionId)
whatsappCredsSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────
// SCHEMA: CHAVES DE SINAL
// ─────────────────────────────────────────────────────────
const whatsappKeySchema = new mongoose.Schema({
  // userId = auth.uid() do Supabase — isolamento obrigatório
  userId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true
  },
  keyId: {
    type: String,
    required: true
  },
  data: {
    type: String,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'whatsapp_keys',
  timestamps: false
});

// Índice composto único: (userId + sessionId + type + keyId)
whatsappKeySchema.index(
  { userId: 1, sessionId: 1, type: 1, keyId: 1 },
  { unique: true }
);

// ─────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────
function getWhatsAppAuthModels(connection) {
  const CredsModel = connection.models.WhatsAppCreds
    || connection.model('WhatsAppCreds', whatsappCredsSchema);

  const KeysModel = connection.models.WhatsAppKeys
    || connection.model('WhatsAppKeys', whatsappKeySchema);

  return { CredsModel, KeysModel };
}

module.exports = { getWhatsAppAuthModels };