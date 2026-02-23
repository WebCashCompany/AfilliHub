/**
 * ═══════════════════════════════════════════════════════════
 * ML AFFILIATE SERVICE
 * Geração de links via API interna do ML (sem Playwright!)
 * ═══════════════════════════════════════════════════════════
 * Coloca em: back/services/MLAffiliateService.js
 */

const axios = require('axios');

const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     || '1547036702834286';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'VvfVOTiFVm55ULCSUm66ZYGCpaEu7SQA';
const ML_REDIRECT_URI  = process.env.ML_REDIRECT_URI  || 'https://afilli-hub.vercel.app/api/integrations/ml/callback';
const ML_AFFILIATE_TAG = process.env.ML_AFFILIATE_TAG || 'baga20231223204119';

class MLAffiliateService {
  constructor() {
    this.accessToken  = process.env.ML_ACCESS_TOKEN  || null;
    this.refreshToken = process.env.ML_REFRESH_TOKEN || null;
    this.tokenExpiry  = null;
    this.linkCache    = new Map();
  }

  getAuthUrl() {
    return `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}`;
  }

  async exchangeCode(code) {
    const response = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        code:          code,
        redirect_uri:  ML_REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    this.accessToken  = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
    this.tokenExpiry  = Date.now() + (response.data.expires_in * 1000);
    console.log('✅ [ML OAuth] Token obtido!');
    return response.data;
  }

  async refreshAccessToken() {
    if (!this.refreshToken) throw new Error('Sem refresh token. Faça login novamente.');

    const response = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        refresh_token: this.refreshToken
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    this.accessToken  = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
    this.tokenExpiry  = Date.now() + (response.data.expires_in * 1000);
    console.log('✅ [ML OAuth] Token renovado!');
    return response.data;
  }

  async ensureValidToken() {
    if (!this.accessToken) throw new Error('Não autenticado. Acesse GET /api/ml/auth para autenticar.');
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) {
      await this.refreshAccessToken();
    }
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  // ─── GERA LINK AFILIADO VIA API INTERNA DO ML ─────────────
  async generateAffiliateLink(productUrl) {
    if (this.linkCache.has(productUrl)) {
      return this.linkCache.get(productUrl);
    }

    try {
      await this.ensureValidToken();

      const ssid = process.env.ML_COOKIE_SSID || '';
      const csrf = process.env.ML_COOKIE_CSRF || '';

      const response = await axios.post(
        'https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links',
        { url: productUrl, tag: ML_AFFILIATE_TAG },
        {
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${this.accessToken}`,
            'Cookie':        `ssid=${ssid}; _csrf_token=${csrf}`,
            'x-csrf-token':  csrf,
            'origin':        'https://produto.mercadolivre.com.br',
            'referer':       'https://www.mercadolivre.com.br/',
            'user-agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 8000
        }
      );

      const data = response.data;
      let affiliateLink = data?.short_url || data?.link || data?.url || null;
      if (typeof data === 'string' && data.includes('/sec/')) affiliateLink = data;

      if (affiliateLink && affiliateLink.includes('/sec/')) {
        this.linkCache.set(productUrl, affiliateLink);
        console.log(`✅ [Affiliate] Link gerado via API`);
        return affiliateLink;
      }

      console.warn(`⚠️  [Affiliate] Resposta inesperada:`, JSON.stringify(data).substring(0, 200));
      return productUrl;

    } catch (error) {
      if (error.response?.status === 401 && this.refreshToken) {
        try {
          await this.refreshAccessToken();
          return await this.generateAffiliateLink(productUrl);
        } catch (e) {
          console.error('❌ [Affiliate] Falha ao renovar token:', e.message);
        }
      }
      console.error(`❌ [Affiliate] ${error.response?.status || ''} ${error.message}`);
      return productUrl;
    }
  }
}

const mlAffiliateService = new MLAffiliateService();
module.exports = mlAffiliateService;