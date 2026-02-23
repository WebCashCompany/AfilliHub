/**
 * ═══════════════════════════════════════════════════════════
 * ML AFFILIATE SERVICE
 * @version 3.0.0 - Lê credenciais do MongoDB, sem dependência de .env p/ cookies
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');

const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     || '1547036702834286';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'VvfVOTiFVm55ULCSUm66ZYGCpaEu7SQA';
const ML_REDIRECT_URI  = process.env.ML_REDIRECT_URI  || 'https://louisville-addresses-interstate-hydrocodone.trycloudflare.com/api/ml/callback';
const ML_AFFILIATE_TAG = process.env.ML_AFFILIATE_TAG || 'baga20231223204119';

class MLAffiliateService {
  constructor() {
    // Carrega do .env como fallback inicial
    this.accessToken  = process.env.ML_ACCESS_TOKEN  || null;
    this.refreshToken = process.env.ML_REFRESH_TOKEN || null;
    this.tokenExpiry  = null;
    this.ssid         = process.env.ML_COOKIE_SSID   || '';
    this.csrf         = process.env.ML_COOKIE_CSRF   || '';
    this.linkCache    = new Map();
    this._initialized = false;

    // Carrega do banco assincronamente na primeira oportunidade
    this._initFromDB();
  }

  // ─── Carrega credenciais do MongoDB ───────────────────────────────────────
  async _initFromDB() {
    try {
      // Import dinâmico para evitar dependência circular no bootstrap
      const { getProductConnection } = require('../database/mongodb');
      const IntegrationModel = require('../models/Integration');

      const conn = getProductConnection();
      const Integration = IntegrationModel(conn);

      const config = await Integration.findOne({ provider: 'mercadolivre', isActive: true });

      if (config) {
        if (config.accessToken)  this.accessToken  = config.accessToken;
        if (config.refreshToken) this.refreshToken = config.refreshToken;
        if (config.tokenExpiry)  this.tokenExpiry  = config.tokenExpiry;
        if (config.ssid)         this.ssid         = config.ssid;
        if (config.csrf)         this.csrf         = config.csrf;

        console.log('✅ [MLAffiliateService] Credenciais carregadas do MongoDB');
      } else {
        console.log('ℹ️  [MLAffiliateService] Sem credenciais no MongoDB, usando .env');
      }

      this._initialized = true;
    } catch (error) {
      // Banco pode não estar pronto ainda na inicialização — não é fatal
      this._initialized = true;
    }
  }

  // ─── Garante que tentou carregar do DB antes de usar ──────────────────────
  async _ensureInit() {
    if (!this._initialized) {
      await this._initFromDB();
    }
  }

  // ─── Atualiza cookies em memória (chamado pelo callback OAuth) ────────────
  updateCookies(ssid, csrf) {
    if (ssid) this.ssid = ssid;
    if (csrf)  this.csrf = csrf;
    console.log('🍪 [MLAffiliateService] Cookies atualizados em memória');
  }

  // ─── Desconecta (limpa estado em memória) ─────────────────────────────────
  disconnect() {
    this.accessToken  = null;
    this.refreshToken = null;
    this.tokenExpiry  = null;
    this.ssid         = '';
    this.csrf         = '';
    this.linkCache.clear();
    console.log('🔌 [MLAffiliateService] Desconectado');
  }

  // ─── OAuth ────────────────────────────────────────────────────────────────
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
        code,
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
    if (!this.refreshToken) throw new Error('Sem refresh token. Reconecte a conta ML em Configurações.');

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

    // Persiste o token renovado no MongoDB
    try {
      const { getProductConnection } = require('../database/mongodb');
      const IntegrationModel = require('../models/Integration');
      const conn = getProductConnection();
      const Integration = IntegrationModel(conn);

      await Integration.findOneAndUpdate(
        { provider: 'mercadolivre' },
        {
          accessToken:  this.accessToken,
          refreshToken: this.refreshToken,
          tokenExpiry:  this.tokenExpiry,
        }
      );
    } catch (e) {
      console.warn('⚠️  [MLAffiliateService] Não foi possível persistir token renovado:', e.message);
    }

    console.log('✅ [ML OAuth] Token renovado!');
    return response.data;
  }

  async ensureValidToken() {
    await this._ensureInit();
    if (!this.accessToken) throw new Error('ML não autenticado. Acesse Configurações > Mercado Livre para conectar.');
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) {
      await this.refreshAccessToken();
    }
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  // ─── Helpers de link ──────────────────────────────────────────────────────
  isAffiliateLink(link) {
    return link && typeof link === 'string' && (link.includes('meli.la') || link.includes('/sec/'));
  }

  extractAffiliateLink(data) {
    if (!data) return null;

    if (typeof data === 'string' && this.isAffiliateLink(data)) return data;

    const candidates = [
      data.short_url,
      data.url,
      data.link,
      data.affiliate_url,
      data.affiliateUrl,
    ];

    for (const candidate of candidates) {
      if (candidate && typeof candidate === 'string' && this.isAffiliateLink(candidate)) {
        return candidate;
      }
    }

    for (const value of Object.values(data)) {
      if (typeof value === 'string' && this.isAffiliateLink(value)) {
        return value;
      }
    }

    return null;
  }

  // ─── Gera link de afiliado ────────────────────────────────────────────────
  async generateAffiliateLink(productUrl) {
    await this._ensureInit();

    if (this.linkCache.has(productUrl)) {
      return this.linkCache.get(productUrl);
    }

    try {
      await this.ensureValidToken();

      const response = await axios.post(
        'https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links',
        { url: productUrl, tag: ML_AFFILIATE_TAG },
        {
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${this.accessToken}`,
            ...(this.ssid && {
              'Cookie':       `ssid=${this.ssid}; _csrf_token=${this.csrf}`,
              'x-csrf-token': this.csrf,
            }),
            'origin':        'https://produto.mercadolivre.com.br',
            'referer':       'https://www.mercadolivre.com.br/',
            'user-agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 8000
        }
      );

      const affiliateLink = this.extractAffiliateLink(response.data);

      if (affiliateLink) {
        this.linkCache.set(productUrl, affiliateLink);
        console.log(`✅ [Affiliate] Link gerado: ${affiliateLink}`);
        return affiliateLink;
      }

      console.warn(`⚠️  [Affiliate] Resposta sem meli.la:`, JSON.stringify(response.data));
      return null;

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
      return null;
    }
  }
}

const mlAffiliateService = new MLAffiliateService();
module.exports = mlAffiliateService;