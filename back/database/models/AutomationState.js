const mongoose = require('mongoose');

const AutomationStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, 
  sessionId: { type: String, required: true },
  grupoIds: { type: [String], default: [] },
  products: { type: [Object], default: [] }, 
  intervalMinutes: { type: Number, required: true },
  currentIndex: { type: Number, default: 0 },
  totalSent: { type: Number, default: 0 },
  isPaused: { type: Boolean, default: false },
  nextFireAt: { type: Number, default: null }, 
  categories: { type: [String], default: [] },
  marketplaces: { type: [String], default: [] },
}, { timestamps: true });

// ✅ Exportação direta para funcionar com o seu index.js
module.exports = {
  getAutomationStateModel: (conn) => {
    if (conn.models && conn.models.AutomationState) {
      return conn.models.AutomationState;
    }
    return conn.model('AutomationState', AutomationStateSchema);
  }
};
