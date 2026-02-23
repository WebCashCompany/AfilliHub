/**
 * ═══════════════════════════════════════════════════════════
 * ML OAUTH ROUTES
 * ═══════════════════════════════════════════════════════════
 * Coloca em: back/routes/ml-oauth.routes.js
 * 
 * Registra no index.js:
 *   app.use('/api/ml', require('./routes/ml-oauth.routes'));
 */

const express = require('express');
const router  = express.Router();
const mlAffiliate = require('../services/MLAffiliateService');

// GET /api/ml/auth
// Redireciona para a tela de login do ML
router.get('/auth', (req, res) => {
  const authUrl = mlAffiliate.getAuthUrl();
  console.log('🔗 [ML OAuth] Redirecionando para:', authUrl);
  res.redirect(authUrl);
});

// GET /api/ml/callback
// ML redireciona aqui após o login com ?code=XXXX
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('❌ [ML OAuth] Erro retornado pelo ML:', error);
    return res.status(400).json({ success: false, error });
  }

  if (!code) {
    return res.status(400).json({ success: false, error: 'Code não recebido' });
  }

  try {
    const tokenData = await mlAffiliate.exchangeCode(code);
    console.log('✅ [ML OAuth] Autenticado! User ID:', tokenData.user_id);

    // Salva tokens no .env em memória (reinicializa com os valores corretos)
    process.env.ML_ACCESS_TOKEN  = tokenData.access_token;
    process.env.ML_REFRESH_TOKEN = tokenData.refresh_token;

    res.json({
      success:      true,
      message:      'Mercado Livre autenticado com sucesso!',
      user_id:      tokenData.user_id,
      expires_in:   tokenData.expires_in,
      token_type:   tokenData.token_type
    });

  } catch (err) {
    console.error('❌ [ML OAuth] Erro ao trocar código:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error:   err.response?.data?.message || err.message
    });
  }
});

// GET /api/ml/status
// Verifica se está autenticado
router.get('/status', (req, res) => {
  res.json({
    authenticated: mlAffiliate.isAuthenticated(),
    message: mlAffiliate.isAuthenticated()
      ? '✅ Mercado Livre autenticado'
      : '❌ Não autenticado. Acesse GET /api/ml/auth'
  });
});

// POST /api/ml/test-link
// Testa a geração de link de afiliado
router.post('/test-link', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL é obrigatória' });
  }

  try {
    const affiliateLink = await mlAffiliate.generateAffiliateLink(url);
    res.json({
      original:  url,
      affiliate: affiliateLink,
      success:   affiliateLink.includes('/sec/')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;