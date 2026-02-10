// back/database/models/UserPreferences.js
const mongoose = require('mongoose');

const userPreferencesSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    default: 'default' // Futuramente será o ID do usuário autenticado
  },
  
  // ═══════════════════════════════════════════════════════════
  // PREFERÊNCIAS DE INTERFACE
  // ═══════════════════════════════════════════════════════════
  theme: {
    type: String,
    enum: ['light', 'dark', 'system'],
    default: 'dark'
  },
  
  language: {
    type: String,
    enum: ['pt-BR', 'en-US', 'es-ES'],
    default: 'pt-BR'
  },
  
  // ═══════════════════════════════════════════════════════════
  // WHATSAPP - SESSÃO ATUAL E GRUPOS
  // ═══════════════════════════════════════════════════════════
  whatsapp: {
    currentSessionId: {
      type: String,
      default: null
    },
    
    selectedGroups: [{
      id: String,
      nome: String,
      participantes: Number,
      sessionId: String // Qual sessão este grupo pertence
    }],
    
    enabled: {
      type: Boolean,
      default: true
    }
  },
  
  // ═══════════════════════════════════════════════════════════
  // TELEGRAM
  // ═══════════════════════════════════════════════════════════
  telegram: {
    enabled: {
      type: Boolean,
      default: false
    },
    
    selectedChannels: [{
      id: String,
      name: String
    }]
  },
  
  // ═══════════════════════════════════════════════════════════
  // AUTOMAÇÃO
  // ═══════════════════════════════════════════════════════════
  automation: {
    active: {
      type: Boolean,
      default: false
    },
    
    paused: {
      type: Boolean,
      default: false
    },
    
    config: {
      intervalMinutes: Number,
      categories: [String],
      marketplaces: [String]
    },
    
    currentProductIndex: {
      type: Number,
      default: 0
    },
    
    totalSent: {
      type: Number,
      default: 0
    }
  },
  
  // ═══════════════════════════════════════════════════════════
  // MENSAGEM PERSONALIZADA
  // ═══════════════════════════════════════════════════════════
  customMessage: {
    type: String,
    default: ''
  },
  
  // ═══════════════════════════════════════════════════════════
  // NOTIFICAÇÕES
  // ═══════════════════════════════════════════════════════════
  notifications: {
    browser: {
      type: Boolean,
      default: true
    },
    sound: {
      type: Boolean,
      default: true
    }
  },
  
  // ═══════════════════════════════════════════════════════════
  // METADADOS
  // ═══════════════════════════════════════════════════════════
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
  
}, {
  timestamps: true,
  collection: 'user_preferences'
});

// Índices
userPreferencesSchema.index({ userId: 1 });

// ═══════════════════════════════════════════════════════════
// MÉTODOS INSTANCE
// ═══════════════════════════════════════════════════════════
userPreferencesSchema.methods.toPublic = function() {
  return {
    userId: this.userId,
    theme: this.theme,
    language: this.language,
    whatsapp: this.whatsapp,
    telegram: this.telegram,
    automation: this.automation,
    customMessage: this.customMessage,
    notifications: this.notifications,
    updatedAt: this.updatedAt
  };
};

// ═══════════════════════════════════════════════════════════
// MÉTODOS STATIC
// ═══════════════════════════════════════════════════════════
userPreferencesSchema.statics.getPreferences = async function(userId = 'default') {
  let prefs = await this.findOne({ userId });
  
  if (!prefs) {
    // Criar preferências padrão se não existir
    prefs = await this.create({ userId });
  }
  
  return prefs;
};

userPreferencesSchema.statics.updatePreferences = async function(userId = 'default', updates) {
  const prefs = await this.findOneAndUpdate(
    { userId },
    { $set: updates },
    { upsert: true, new: true }
  );
  
  return prefs;
};

// Criar modelo dinâmico baseado na conexão
function getUserPreferencesModel(connection) {
  if (connection.models.UserPreferences) {
    return connection.models.UserPreferences;
  }
  
  return connection.model('UserPreferences', userPreferencesSchema);
}

module.exports = { getUserPreferencesModel, userPreferencesSchema };