// back/database/models/WhatsAppSession.js
const mongoose = require('mongoose');

const whatsappSessionSchema = new mongoose.Schema({
  // ─── ISOLAMENTO POR USUÁRIO ───────────────────────────────
  // userId = auth.uid() do Supabase. Obrigatório.
  userId: {
    type: String,
    required: true,
    index: true
  },

  sessionId: {
    type: String,
    required: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    default: null
  },
  conectado: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'connecting'],
    default: 'offline'
  },
  connectedAt: {
    type: Date,
    default: null
  },
  disconnectedAt: {
    type: Date,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'whatsapp_sessions'
});

// ─── ÍNDICES ──────────────────────────────────────────────
// Unicidade: um sessionId é único por usuário
whatsappSessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
whatsappSessionSchema.index({ userId: 1, conectado: 1 });
whatsappSessionSchema.index({ userId: 1, status: 1 });

// ─── MÉTODOS DE INSTÂNCIA ─────────────────────────────────
whatsappSessionSchema.methods.toPublic = function () {
  return {
    sessionId:      this.sessionId,
    phoneNumber:    this.phoneNumber,
    conectado:      this.conectado,
    status:         this.status,
    connectedAt:    this.connectedAt,
    disconnectedAt: this.disconnectedAt,
    lastActivity:   this.lastActivity
  };
};

// ─── MÉTODOS ESTÁTICOS (todos filtram por userId) ─────────
whatsappSessionSchema.statics.findBySessionId = function (userId, sessionId) {
  return this.findOne({ userId, sessionId });
};

whatsappSessionSchema.statics.getActiveSessions = function (userId) {
  return this.find({ userId, conectado: true, status: 'online' });
};

whatsappSessionSchema.statics.getAllSessions = function (userId) {
  return this.find({ userId }).sort({ lastActivity: -1 });
};

// ─── FACTORY ──────────────────────────────────────────────
function getWhatsAppSessionModel(connection) {
  if (connection.models.WhatsAppSession) {
    return connection.models.WhatsAppSession;
  }
  return connection.model('WhatsAppSession', whatsappSessionSchema);
}

module.exports = { getWhatsAppSessionModel, whatsappSessionSchema };