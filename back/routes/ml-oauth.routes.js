/**
 * ═══════════════════════════════════════════════════════════
 * ML OAUTH ROUTES
 * @version 2.2.4 - Integrated Playwright Capture
 * ═══════════════════════════════════════════════════════════
 */

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
        ssid:         data.ssid,
        csrf:         data.csrf,
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
    console.log('🔄 [ML OAuth] Trocando código por tokens e capturando cookies...');
    // 🔥 exchangeCode agora faz a troca do token E a captura do Playwright internamente
    const tokenData = await mlAffiliate.exchangeCode(code);
    
    console.log('✅ [ML OAuth] Tokens e Cookies obtidos! User ID:', tokenData.user_id);
    
    if (!tokenData.ssid) {
      console.warn('⚠️  [ML OAuth] ssid não capturado — links afiliados podem não funcionar corretamente');
    }

    await saveMLCredentials({
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry:  Date.now() + (tokenData.expires_in * 1000),
      userId:       tokenData.user_id,
      ssid:         tokenData.ssid || '',
      csrf:         tokenData.csrf || '',
    });

    return res.redirect(`${redirectUrl}?ml_connected=true`);
  } catch (err) {
    console.error('❌ [ML OAuth] Erro no callback:', err.message);
    return res.redirect(`${redirectUrl}?ml_error=token_exchange_failed`);
  }
});

// ─── POST /api/ml/exchange-code ──────────────────────────────────────────────
router.post('/exchange-code', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code obrigatório' });

  try {
    console.log('🔄 [ML OAuth] Trocando código por tokens e capturando cookies...');
    const tokenData = await mlAffiliate.exchangeCode(code);
    
    await saveMLCredentials({
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry:  Date.now() + (tokenData.expires_in * 1000),
      userId:       tokenData.user_id,
      ssid:         tokenData.ssid || '',
      csrf:         tokenData.csrf || '',
    });

    res.json({
      success:    true,
      userId:     tokenData.user_id,
      hasCookies: !!tokenData.ssid
    });

  } catch (err) {
    console.error('❌ [ML OAuth] Erro ao trocar código:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error:   err.response?.data?.message || err.message
    });
  }
});

// ─── GET /api/ml/status ──────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const conn        = getProductConnection();
    const Integration = IntegrationModel(conn);
    const config      = await Integration.findOne({ provider: 'mercadolivre' });

    res.json({
      authenticated: mlAffiliate.isAuthenticated(),
      connectedAt:   config?.connectedAt || null,
      userId:        config?.userId      || null,
      hasCookies:    !!(config?.ssid),
      tokenExpiry:   config?.tokenExpiry || null,
    });
  } catch (error) {
    res.json({
      authenticated: mlAffiliate.isAuthenticated(),
      connectedAt:   null,
      userId:        null,
      hasCookies:    false,
    });
  }
});

// ─── DELETE /api/ml/disconnect ───────────────────────────────────────────────
router.delete('/disconnect', async (req, res) => {
  try {
    const conn        = getProductConnection();
    const Integration = IntegrationModel(conn);
    
    await Integration.deleteMany({ provider: 'mercadolivre' });

    if (typeof mlAffiliate.disconnect === 'function') {
      mlAffiliate.disconnect();
    } else {
      mlAffiliate.accessToken = null;
      mlAffiliate.ssid = '';
    }

    res.json({ success: true, message: 'Conta ML desconectada com sucesso' });
  } catch (error) {
    console.error('❌ [ML OAuth] Erro ao desconectar:', error.message);
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
      success:   !!affiliateLink,
      message:   affiliateLink
        ? `✅ Link afiliado gerado: ${affiliateLink}`
        : '❌ API não retornou link afiliado — verifique se o ssid está presente'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
