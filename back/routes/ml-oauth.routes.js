/**
 * ═══════════════════════════════════════════════════════════
 * ML OAUTH ROUTES
 * @version 2.2.2 - Playwright captura ssid/csrf e mata conta zumbi
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

// ─── Captura cookies ssid e csrf via Playwright ────────────────────
async function captureMLCookies(accessToken) {
  let browser;
  try {
    const { chromium } = require('playwright');

    // 🔥 HEADLESS FALSE: O navegador vai abrir na sua tela para você ver o que o ML está fazendo
    browser = await chromium.launch({
      headless: false, 
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled', // Tática anti-bot
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport:  { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    await context.addInitScript((token) => {
      window.__ml_access_token = token;
    }, accessToken);

    console.log('⏳ [Playwright] Navegando para o Mercado Livre...');
    await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded', timeout: 20000 });

    await page.evaluate((token) => {
      try {
        localStorage.setItem('access_token', token);
        document.cookie = `access_token=${token}; domain=.mercadolivre.com.br; path=/`;
      } catch (e) {}
    }, accessToken);

    // Dá um tempo maior pro ML respirar e validar o token
    await page.waitForTimeout(3000); 

    console.log('⏳ [Playwright] Tentando acessar a página de Afiliados...');
    try {
      await page.goto('https://www.mercadolivre.com.br/affiliate-program/', {
        waitUntil: 'domcontentloaded',
        timeout: 20000
      });
      await page.waitForTimeout(4000); // Espera o carregamento completo
    } catch (e) {
      console.warn('⚠️  [captureMLCookies] affiliate-program não carregou (não fatal):', e.message);
    }

    const cookies = await context.cookies(['https://www.mercadolivre.com.br']);
    
    // Captura o cookie independente se for maiúsculo ou minúsculo
    const ssidCookie = cookies.find(c => c.name.toLowerCase() === 'ssid');
    const csrfCookie = cookies.find(c => ['_csrf_token', 'csrf_token', 'xsrf-token'].includes(c.name.toLowerCase()));

    await browser.close();

    console.log(`🍪 [captureMLCookies] ssid: ${ssidCookie ? '✅ CAPTURADO' : '❌ FALHOU'}`);
    console.log(`🍪 [captureMLCookies] csrf: ${csrfCookie ? '✅ CAPTURADO' : '❌ FALHOU'}`);

    return {
      ssid: ssidCookie?.value || null,
      csrf: csrfCookie?.value || null
    };

  } catch (error) {
    console.error('⚠️  [ML OAuth] Falha no Playwright:', error.message);
    try { if (browser) await browser.close(); } catch (e) {}
    return { ssid: null, csrf: null };
  }
}

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
  
  // 🔥 URL CHUMBADA: Se der 404 depois disso, o servidor local não foi reiniciado.
  const redirectUrl = 'https://vantpromo.vercel.app/settings';

  if (error) {
    console.error('❌ [ML OAuth] Erro retornado pelo ML:', error);
    return res.redirect(`${redirectUrl}?ml_error=${encodeURIComponent(error)}`);
  }

  if (!code) return res.redirect(`${redirectUrl}?ml_error=no_code`);

  try {
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    const tokenData = await mlAffiliate.exchangeCode(code);
    console.log('✅ [ML OAuth] Tokens obtidos! User ID:', tokenData.user_id);
    
    console.log('🍪 [ML OAuth] Capturando cookies via Playwright...');
    const { ssid, csrf } = await captureMLCookies(tokenData.access_token);

    if (!ssid) {
      console.warn('⚠️  [ML OAuth] ssid não capturado — links afiliados podem não funcionar corretamente');
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
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    const tokenData = await mlAffiliate.exchangeCode(code);
    
    console.log('🍪 [ML OAuth] Capturando cookies via Playwright...');
    const { ssid, csrf } = await captureMLCookies(tokenData.access_token);

    mlAffiliate.updateCookies(ssid, csrf);

    await saveMLCredentials({
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry:  Date.now() + (tokenData.expires_in * 1000),
      userId:       tokenData.user_id,
      ssid:         ssid || '',
      csrf:         csrf || '',
    });

    res.json({
      success:    true,
      userId:     tokenData.user_id,
      hasCookies: !!ssid
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

// ─── DELETE /api/ml/disconnect (🔥 CORRIGIDO PRA MATAR A CONTA ZUMBI) ────────
router.delete('/disconnect', async (req, res) => {
  try {
    const conn        = getProductConnection();
    const Integration = IntegrationModel(conn);
    
    // 1. Apaga do banco DEFINITIVAMENTE
    await Integration.deleteMany({ provider: 'mercadolivre' });

    // 2. Limpa a memória do Node
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