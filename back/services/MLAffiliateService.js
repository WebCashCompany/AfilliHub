/**
 * ═══════════════════════════════════════════════════════════
 * ML AFFILIATE SERVICE
 * @version 3.1.0 - ssid/csrf via Playwright + MongoDB
 *                  Adaptado para ngrok (redirect URI dinâmico via .env)
 * ═══════════════════════════════════════════════════════════
 *
 * ✅ Variáveis necessárias no .env:
 *    ML_CLIENT_ID=1547036702834286
 *    ML_CLIENT_SECRET=VvfVOTiFVm55ULCSUm66ZYGCpaEu7SQA
 *    ML_REDIRECT_URI=https://xxxx-xx-xx.ngrok-free.app/api/ml/callback
 *    ML_AFFILIATE_TAG=baga20231223204119
 *    FRONTEND_URL=https://vantpromo.vercel.app
 *
 * ⚠️  IMPORTANTE: Cada vez que o ngrok reiniciar, a URL muda.
 *    Atualize ML_REDIRECT_URI no .env E no painel do app em:
 *    https://developers.mercadolibre.com.br → Seu App → Redirect URI
 */

const axios = require('axios');

const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     || '1547036702834286';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'VvfVOTiFVm55ULCSUm66ZYGCpaEu7SQA';
const ML_REDIRECT_URI  = process.env.ML_REDIRECT_URI  || 'http://localhost:3000/api/ml/callback';
const ML_AFFILIATE_TAG = process.env.ML_AFFILIATE_TAG || 'baga20231223204119';

class MLAffiliateService {
  constructor() {
    this.accessToken  = process.env.ML_ACCESS_TOKEN  || null;
    this.refreshToken = process.env.ML_REFRESH_TOKEN || null;
    this.tokenExpiry  = null;
    this.ssid         = process.env.ML_COOKIE_SSID   || '';
    this.csrf         = process.env.ML_COOKIE_CSRF   || '';
    this.linkCache    = new Map();
    this._initialized = false;

    this._initFromDB();
  }

  // ─── Carrega credenciais do MongoDB ───────────────────────────────────────
  async _initFromDB() {
    try {
      const { getProductConnection } = require('../database/mongodb');
      const IntegrationModel         = require('../models/Integration');

      const conn        = getProductConnection();
      const Integration = IntegrationModel(conn);

      const config = await Integration.findOne({ provider: 'mercadolivre', isActive: true });

      if (config) {
        if (config.accessToken)  this.accessToken  = config.accessToken;
        if (config.refreshToken) this.refreshToken = config.refreshToken;
        if (config.tokenExpiry)  this.tokenExpiry  = config.tokenExpiry;
        if (config.ssid)         this.ssid         = config.ssid;
        if (config.csrf)         this.csrf         = config.csrf;

        console.log('✅ [MLAffiliateService] Credenciais carregadas do MongoDB');

        if (this.ssid) {
          console.log('🍪 [MLAffiliateService] ssid presente — geração de links habilitada');
        } else {
          console.warn('⚠️  [MLAffiliateService] ssid ausente — reconecte a conta ML em Configurações');
        }
      } else {
        console.log('ℹ️  [MLAffiliateService] Sem credenciais no MongoDB, usando .env');
      }

      this._initialized = true;
    } catch (error) {
      this._initialized = true;
    }
  }

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
    this._initialized = false;
    console.log('🔌 [MLAffiliateService] Desconectado');
  }

  // ─── OAuth ────────────────────────────────────────────────────────────────
  getAuthUrl() {
    const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}`;
    console.log(`🔗 [ML OAuth] Redirect URI em uso: ${ML_REDIRECT_URI}`);
    return url;
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

    console.log('✅ [ML OAuth] Token obtido! User ID:', response.data.user_id);
    return response.data;
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('Sem refresh token. Reconecte a conta ML em Configurações.');
    }

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

    try {
      const { getProductConnection } = require('../database/mongodb');
      const IntegrationModel         = require('../models/Integration');
      const conn                     = getProductConnection();
      const Integration              = IntegrationModel(conn);

      await Integration.findOneAndUpdate(
        { provider: 'mercadolivre' },
        {
          accessToken:  this.accessToken,
          refreshToken: this.refreshToken,
          tokenExpiry:  this.tokenExpiry,
        }
      );
      console.log('💾 [ML OAuth] Token renovado persistido no MongoDB');
    } catch (e) {
      console.warn('⚠️  [MLAffiliateService] Não foi possível persistir token renovado:', e.message);
    }

    console.log('✅ [ML OAuth] Token renovado!');
    return response.data;
  }

  async ensureValidToken() {
    await this._ensureInit();
    if (!this.accessToken) {
      throw new Error('ML não autenticado. Acesse Configurações > Mercado Livre para conectar.');
    }
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) {
      await this.refreshAccessToken();
    }
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  // ─── Verifica se é um link afiliado válido do ML ──────────────────────────
  // ✅ Aceita QUALQUER formato que a API do ML retorne:
  //    - meli.la/xxxxx       → formato atual
  //    - mercado.livre/xxxxx → formato antigo
  //    - /sec/xxxxx          → formato legado
  isAffiliateLink(link) {
    if (!link || typeof link !== 'string') return false;
    return (
      link.includes('meli.la')       ||
      link.includes('mercado.livre') ||
      link.includes('/sec/')
    );
  }

  // ─── Extrai link afiliado de qualquer formato de resposta da API ──────────
  extractAffiliateLink(data) {
    if (!data) return null;

    // Resposta é string direta
    if (typeof data === 'string' && this.isAffiliateLink(data)) return data;

    // Campos conhecidos em ordem de prioridade
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

    // Busca em qualquer campo string da resposta
    for (const value of Object.values(data)) {
      if (typeof value === 'string' && this.isAffiliateLink(value)) {
        return value;
      }
    }

    return null;
  }

  // ─── Gera link de afiliado via endpoint interno do ML (requer ssid) ───────
  async generateAffiliateLink(productUrl) {
    await this._ensureInit();

    if (this.linkCache.has(productUrl)) {
      return this.linkCache.get(productUrl);
    }

    try {
      await this.ensureValidToken();

      const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'origin':        'https://produto.mercadolivre.com.br',
        'referer':       'https://www.mercadolivre.com.br/',
        'user-agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      };

      if (this.ssid) {
        headers['Cookie']       = `ssid=${this.ssid}; _csrf_token=${this.csrf}`;
        headers['x-csrf-token'] = this.csrf;
      } else {
        console.warn('⚠️  [Affiliate] Tentando gerar link SEM ssid — reconecte a conta ML.');
      }

      const response = await axios.post(
        'https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links',
        { url: productUrl, tag: ML_AFFILIATE_TAG },
        { headers, timeout: 8000 }
      );

      const affiliateLink = this.extractAffiliateLink(response.data);

      if (affiliateLink) {
        this.linkCache.set(productUrl, affiliateLink);
        console.log(`✅ [Affiliate] Link gerado: ${affiliateLink}`);
        return affiliateLink;
      }

      console.warn(`⚠️  [Affiliate] API não retornou link afiliado:`, JSON.stringify(response.data));
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
      if (error.response?.data) {
        console.error(`❌ [Affiliate] Detalhe:`, JSON.stringify(error.response.data));
      }
      return null;
    }
  }
}

const mlAffiliateService = new MLAffiliateService();
module.exports = mlAffiliateService;