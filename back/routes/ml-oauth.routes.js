const express     = require('express');
const router      = express.Router();
const mlAffiliate = require('../services/MLAffiliateService');
const { getProductConnection } = require('../database/mongodb');
const IntegrationModel = require('../models/Integration');

// ✅ Ngrok exige este header para não mostrar a página de aviso
router.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true'); //
  next();
});

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
      viewport:  { width: 1280, height: 720 }
    });

    const page = await context.newPage();
    await page.addInitScript((token) => { window.__ml_access_token = token; }, accessToken);

    await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    await page.evaluate((token) => {
      localStorage.setItem('access_token', token);
      document.cookie = `access_token=${token}; domain=.mercadolivre.com.br; path=/`;
    }, accessToken);

    await page.waitForTimeout(2000);

    try {
      await page.goto('https://www.mercadolivre.com.br/affiliate-program/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await page.waitForTimeout(3000);
    } catch (e) {
      console.warn('⚠️ [captureMLCookies] Erro no carregamento da página de afiliados.');
    }

    const cookies = await context.cookies(['https://www.mercadolivre.com.br']);
    const ssidCookie = cookies.find(c => c.name.toLowerCase() === 'ssid');
    const csrfCookie = cookies.find(c => ['_csrf_token', 'csrf_token', 'xsrf-token'].includes(c.name.toLowerCase()));

    await browser.close();
    return { ssid: ssidCookie?.value || null, csrf: csrfCookie?.value || null };
  } catch (error) {
    console.error('⚠️ [ML OAuth] Falha no Playwright:', error.message);
    if (browser) await browser.close();
    return { ssid: null, csrf: null };
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
  const frontendUrl = process.env.FRONTEND_URL || 'https://vantpromo.vercel.app'; //

  if (error) return res.redirect(`${frontendUrl}/settings?ml_error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect(`${frontendUrl}/settings?ml_error=no_code`);

  try {
    const tokenData = await mlAffiliate.exchangeCode(code);
    const { ssid, csrf } = await captureMLCookies(tokenData.access_token); //

    mlAffiliate.updateCookies(ssid, csrf);

    const conn = getProductConnection();
    const Integration = IntegrationModel(conn);

    await Integration.findOneAndUpdate(
      { provider: 'mercadolivre' },
      {
        provider: 'mercadolivre',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiry: Date.now() + (tokenData.expires_in * 1000),
        userId: tokenData.user_id,
        ssid: ssid || '',
        csrf: csrf || '',
        connectedAt: new Date(),
        isActive: true
      },
      { upsert: true }
    );

    return res.redirect(`${frontendUrl}/settings?ml_connected=true`);
  } catch (err) {
    console.error('❌ [ML OAuth] Erro:', err.message);
    return res.redirect(`${frontendUrl}/settings?ml_error=auth_failed`);
  }
});

module.exports = router;