/**
 * ═══════════════════════════════════════════════════════════
 * ML OAUTH ROUTES
 * @version 2.0.0 - OAuth oficial + captura de cookies headless + MongoDB
 * ═══════════════════════════════════════════════════════════
 * Registra no index.js:
 *   app.use('/api/ml', require('./routes/ml-oauth.routes'));
 */

const express  = require('express');
const router   = express.Router();
const mlAffiliate = require('../services/MLAffiliateService');
const { getProductConnection } = require('../database/mongodb');
const IntegrationModel = require('../models/Integration');

// ─── Captura cookies ssid e csrf via Playwright headless ────────────────────
async function captureMLCookies(accessToken) {
  let browser;
  try {
    const { chromium } = require('playwright');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    // Injeta o access token antes de carregar a página
    await context.addInitScript((token) => {
      window.__ml_access_token = token;
    }, accessToken);

    await page.goto('https://www.mercadolivre.com.br/', {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });

    // Injeta o token via localStorage e cookie para autenticar a sessão
    await page.evaluate((token) => {
      try {
        localStorage.setItem('access_token', token);
        document.cookie = `access_token=${token}; domain=.mercadolivre.com.br; path=/`;
      } catch (e) {}
    }, accessToken);

    // Aguarda a página processar
    await page.waitForTimeout(2000);

    // Navega para a área de afiliados para forçar a criação da sessão
    try {
      await page.goto('https://www.mercadolivre.com.br/affiliate-program/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await page.waitForTimeout(2000);
    } catch (e) {
      // Ignora erro de navegação, tenta pegar os cookies mesmo assim
    }

    const cookies = await context.cookies(['https://www.mercadolivre.com.br']);

    const ssidCookie = cookies.find(c => c.name === 'ssid' || c.name === 'SSID');
    const csrfCookie = cookies.find(c =>
      c.name === '_csrf_token' ||
      c.name === 'csrf_token' ||
      c.name === 'XSRF-TOKEN'
    );

    await browser.close();

    return {
      ssid: ssidCookie?.value || null,
      csrf: csrfCookie?.value || null
    };

  } catch (error) {
    console.error('⚠️  [ML OAuth] Falha ao capturar cookies:', error.message);
    try { if (browser) await browser.close(); } catch (e) {}
    return { ssid: null, csrf: null };
  }
}

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
        ssid:          data.ssid,
        csrf:          data.csrf,
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
// Redireciona para tela de login do ML
router.get('/auth', (req, res) => {
  const authUrl = mlAffiliate.getAuthUrl();
  console.log('🔗 [ML OAuth] Redirecionando para login ML...');
  res.redirect(authUrl);
});

// ─── GET /api/ml/callback ────────────────────────────────────────────────────
// ML redireciona aqui após login com ?code=XXXX
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    console.error('❌ [ML OAuth] Erro retornado pelo ML:', error);
    return res.redirect(`${frontendUrl}/ml/callback?error=${error}`);
  }

  if (!code) {
    return res.redirect(`${frontendUrl}/ml/callback?error=no_code`);
  }

  // ✅ Repassa o code para o frontend — ele chama POST /exchange-code
  res.redirect(`${frontendUrl}/ml/callback?code=${code}`);
});

// ─── POST /api/ml/exchange-code ──────────────────────────────────────────────
// Frontend chama após receber o code no callback
router.post('/exchange-code', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code obrigatório' });

  try {
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    const tokenData = await mlAffiliate.exchangeCode(code);
    console.log('✅ [ML OAuth] Tokens obtidos! User ID:', tokenData.user_id);

    console.log('🍪 [ML OAuth] Capturando cookies de sessão (headless)...');
    const { ssid, csrf } = await captureMLCookies(tokenData.access_token);

    if (ssid) {
      console.log('✅ [ML OAuth] Cookie ssid capturado');
    } else {
      console.warn('⚠️  [ML OAuth] Cookie ssid não capturado');
    }

    mlAffiliate.updateCookies(ssid, csrf);

    await saveMLCredentials({
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry:  Date.now() + (tokenData.expires_in * 1000),
      userId:       tokenData.user_id,
      ssid:         ssid || '',
      csrf:         csrf || '',
    });

    res.json({ success: true, userId: tokenData.user_id });

  } catch (err) {
    console.error('❌ [ML OAuth] Erro ao trocar código:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.message || err.message });
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