const mongoose = require('mongoose');

const IntegrationSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    unique: true,
    enum: ['mercadolivre', 'magalu', 'shopee', 'amazon'],
  },

  // Mercado Livre OAuth
  accessToken:  { type: String, default: null },
  refreshToken: { type: String, default: null },
  tokenExpiry:  { type: Number, default: null },
  userId:       { type: String, default: null },
  ssid:         { type: String, default: null },
  csrf:         { type: String, default: null },

  // Magalu / outros
  affiliateId: { type: String, default: null },

  // Status
  isActive:    { type: Boolean, default: true },
  connectedAt: { type: Date, default: null },

}, { timestamps: true });

module.exports = (conn) => {
  if (conn.models && conn.models.Integration) {
    return conn.models.Integration;
  }
  return conn.model('Integration', IntegrationSchema);
};