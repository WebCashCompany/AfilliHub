const mongoose = require('mongoose');

const IntegrationSchema = new mongoose.Schema({
  provider: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  affiliateId: { 
    type: String, 
    required: true 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Exporta uma função que recebe a conexão e define o modelo nela
module.exports = (connection) => {
  return connection.model('Integration', IntegrationSchema);
};