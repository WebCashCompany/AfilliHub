// back/database/models/WhatsAppSession.js
const mongoose = require('mongoose');

const whatsappSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
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

// Índices
whatsappSessionSchema.index({ sessionId: 1 });
whatsappSessionSchema.index({ conectado: 1 });
whatsappSessionSchema.index({ status: 1 });

// Métodos
whatsappSessionSchema.methods.toPublic = function() {
  return {
    sessionId: this.sessionId,
    phoneNumber: this.phoneNumber,
    conectado: this.conectado,
    status: this.status,
    connectedAt: this.connectedAt,
    disconnectedAt: this.disconnectedAt,
    lastActivity: this.lastActivity
  };
};

// Statics
whatsappSessionSchema.statics.findBySessionId = function(sessionId) {
  return this.findOne({ sessionId });
};

whatsappSessionSchema.statics.getActiveSessions = function() {
  return this.find({ conectado: true, status: 'online' });
};

whatsappSessionSchema.statics.getAllSessions = function() {
  return this.find().sort({ lastActivity: -1 });
};

// Criar modelo dinâmico baseado na conexão
function getWhatsAppSessionModel(connection) {
  // Se o modelo já existe na conexão, retorná-lo
  if (connection.models.WhatsAppSession) {
    return connection.models.WhatsAppSession;
  }
  
  // Caso contrário, criar o modelo
  return connection.model('WhatsAppSession', whatsappSessionSchema);
}

module.exports = { getWhatsAppSessionModel, whatsappSessionSchema };