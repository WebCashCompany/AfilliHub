/**
 * ═══════════════════════════════════════════════════════════
 * ML OAUTH ROUTES
 * @version 3.0.0 - Sem captura de cookies, usa endpoint oficial da API
 * ═══════════════════════════════════════════════════════════
 */

const express  = require('express');
const router   = express.Router();
const mlAffiliate = require('../services/MLAffiliateService');
const { getProductConnection } = require('../database/mongodb');
const IntegrationModel = require('../models/Integration');

// ─── Salva credenciais no MongoDB ───────────────────────────────────────────
async function saveMLCredentials(data) {
  try {
    const conn = getProductConnection();
    const Integration = IntegrationModel(conn);

    await Integration.findOneAndUpdate(
      { provider: 'mercadolivre' },
      {
        provider:      'mercadolivre',
        accessToken:   data.accessToken,
        refreshToken:  data.refreshToken,
        tokenExpiry:   data.tokenExpiry,
        userId:        data.userId,
        connectedAt:   new Date(),
        isActive:      true
      },
      { upsert: true, new: true }
    );

    console.log('✅ [ML OAuth] Credenciais salvas no MongoDB');
  } catch (error) {
    console.error('❌ [ML OAuth] Erro ao salvar no MongoDB:', error.message);
    throw error;
  }
}

// ─── GET /api/ml/auth ────────────────────────────────────────────────────────
router.get('/auth', (req, res) => {
  const authUrl = mlAffiliate.getAuthUrl();
  console.log('🔗 [ML OAuth] Redirecionando para login ML...');
  res.redirect(authUrl);
});

// ─── GET /api/ml/callback ────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    console.error('❌ [ML OAuth] Erro retornado pelo ML:', error);
    return res.redirect(`${frontendUrl}/settings?ml_error=${error}`);
  }

  if (!code) {
    return res.redirect(`${frontendUrl}/settings?ml_error=no_code`);
  }

  try {
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    const tokenData = await mlAffiliate.exchangeCode(code);
    console.log('✅ [ML OAuth] Tokens obtidos! User ID:', tokenData.user_id);

    await saveMLCredentials({
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry:  Date.now() + (tokenData.expires_in * 1000),
      userId:       tokenData.user_id,
    });

    return res.redirect(`${frontendUrl}/settings?ml_connected=true`);

  } catch (err) {
    console.error('❌ [ML OAuth] Erro ao trocar código:', err.response?.data || err.message);
    return res.redirect(`${frontendUrl}/settings?ml_error=token_exchange_failed`);
  }
});

// ─── GET /api/ml/status ──────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const conn = getProductConnection();
    const Integration = IntegrationModel(conn);
    const config = await Integration.findOne({ provider: 'mercadolivre' });

    res.json({
      authenticated: mlAffiliate.isAuthenticated(),
      connectedAt:   config?.connectedAt || null,
      userId:        config?.userId || null,
      tokenExpiry:   config?.tokenExpiry || null,
    });
  } catch (error) {
    res.json({
      authenticated: mlAffiliate.isAuthenticated(),
      connectedAt:   null,
      userId:        null,
    });
  }
});

// ─── DELETE /api/ml/disconnect ───────────────────────────────────────────────
router.delete('/disconnect', async (req, res) => {
  try {
    const conn = getProductConnection();
    const Integration = IntegrationModel(conn);
    await Integration.deleteOne({ provider: 'mercadolivre' });

    mlAffiliate.disconnect();

    res.json({ success: true, message: 'Conta ML desconectada' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/ml/test-link ──────────────────────────────────────────────────
router.post('/test-link', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL é obrigatória' });

  try {
    const affiliateLink = await mlAffiliate.generateAffiliateLink(url);
    res.json({
      original:  url,
      affiliate: affiliateLink,
      success:   !!(affiliateLink && (affiliateLink.includes('meli.la') || affiliateLink.includes('/sec/')))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;