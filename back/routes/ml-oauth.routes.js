const express     = require('express');
const router      = express.Router();
const mlAffiliate = require('../services/MLAffiliateService');
const { getProductConnection } = require('../database/mongodb');
const IntegrationModel = require('../models/Integration');

// ✅ Ngrok exige este header para não mostrar a página de aviso
router.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// ─── Salva credenciais no MongoDB ───────────────────────────────────────────
async function saveMLCredentials(data) {
  try {
    const conn        = getProductConnection();
    const Integration = IntegrationModel(conn);

    await Integration.findOneAndUpdate(
      { provider: 'mercadolivre' },
      {
        provider:     'mercadolivre',
        accessToken:  data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiry:  data.tokenExpiry,
        userId:       data.userId,
        ssid:         data.ssid || '',
        csrf:         data.csrf || '',
        connectedAt:  new Date(),
        isActive:     true
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
  const redirectUrl = 'https://vantpromo.vercel.app/settings';

  if (error) {
    console.error('❌ [ML OAuth] Erro retornado pelo ML:', error);
    return res.redirect(`${redirectUrl}?ml_error=${encodeURIComponent(error)}`);
  }

  if (!code) return res.redirect(`${redirectUrl}?ml_error=no_code`);

  try {
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    const tokenData = await mlAffiliate.exchangeCode(code);
    
    await saveMLCredentials({
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry:  Date.now() + (tokenData.expires_in * 1000),
      userId:       tokenData.user_id,
      ssid:         '',
      csrf:         '',
    });

    return res.redirect(`${redirectUrl}?ml_connected=true&need_session=true`);
  } catch (err) {
    console.error('❌ [ML OAuth] Erro no callback:', err.message);
    return res.redirect(`${redirectUrl}?ml_error=token_exchange_failed`);
  }
});

// ─── POST /api/ml/session ────────────────────────────────────────────────────
router.post('/session', async (req, res) => {
  const { ssid, csrf } = req.body;
  if (!ssid) return res.status(400).json({ error: 'SSID é obrigatório' });

  try {
    const conn        = getProductConnection();
    const Integration = IntegrationModel(conn);
    
    const config = await Integration.findOneAndUpdate(
      { provider: 'mercadolivre' },
      { $set: { ssid, csrf, updatedAt: new Date() } },
      { new: true }
    );

    if (!config) return res.status(404).json({ error: 'Integração não encontrada.' });

    mlAffiliate.updateSession(ssid, csrf);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ml/status ──────────────────────────────────────────────────────
// ✅ AJUSTE AQUI: Garantir que o retorno seja exatamente o que o frontend espera
router.get('/status', async (req, res) => {
  try {
    const conn        = getProductConnection();
    const Integration = IntegrationModel(conn);
    const config      = await Integration.findOne({ provider: 'mercadolivre' });

    // Força o retorno de um objeto limpo
    const status = {
      authenticated: !!(config && config.accessToken),
      connectedAt:   config?.connectedAt || null,
      userId:        config?.userId      || null,
      hasCookies:    !!(config?.ssid),
      tokenExpiry:   config?.tokenExpiry || null,
    };

    console.log(`📊 [ML Status] Authenticated: ${status.authenticated} | HasCookies: ${status.hasCookies}`);
    res.json(status);
  } catch (error) {
    console.error('❌ [ML Status] Erro:', error.message);
    res.json({ authenticated: false, hasCookies: false });
  }
});

// ─── DELETE /api/ml/disconnect ───────────────────────────────────────────────
router.delete('/disconnect', async (req, res) => {
  try {
    const conn        = getProductConnection();
    const Integration = IntegrationModel(conn);
    await Integration.deleteMany({ provider: 'mercadolivre' });
    mlAffiliate.disconnect();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
