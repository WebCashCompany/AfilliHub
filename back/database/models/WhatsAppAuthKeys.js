// back/database/models/WhatsAppAuthKeys.js
//
// Armazena as chaves criptográficas do Baileys (WhatsApp Web) no MongoDB.
// Isso permite que qualquer instância do servidor (deploy, outro PC, etc.)
// restaure a sessão autenticada sem precisar escanear o QR Code novamente.
//
// Estrutura de chaves do Baileys:
//   creds   → credenciais principais da conta (1 doc por sessão)
//   keys    → chave de sinal, pre-keys, sender-keys, session-keys, etc. (N docs por sessão)

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────
// SCHEMA: CREDENCIAIS PRINCIPAIS
// ─────────────────────────────────────────────────────────
const whatsappCredsSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Objeto completo retornado pelo Baileys (creds)
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

// ─────────────────────────────────────────────────────────
// SCHEMA: CHAVES DE SINAL (pre-keys, session, sender-key, etc.)
// ─────────────────────────────────────────────────────────
// O Baileys usa uma store de chaves onde cada "tipo" tem vários IDs.
// Exemplo: { type: 'pre-key', id: '1', data: <Buffer> }
const whatsappKeySchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  // Tipo da chave: 'pre-key', 'session', 'sender-key', 'sender-key-memory',
  //               'app-state-sync-key', 'app-state-sync-version'
  type: {
    type: String,
    required: true
  },
  // ID da chave (pode ser string ou número, ex: "1", "55199999999:0")
  keyId: {
    type: String,
    required: true
  },
  // Dados serializados como string base64 (Buffer → base64 → Buffer)
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

// Índice composto único: uma chave é identificada por (sessionId + type + keyId)
whatsappKeySchema.index({ sessionId: 1, type: 1, keyId: 1 }, { unique: true });

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