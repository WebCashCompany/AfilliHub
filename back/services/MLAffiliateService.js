/**
 * ═══════════════════════════════════════════════════════════
 * ML AFFILIATE SERVICE
 * @version 4.0.0 - Usa endpoint oficial da API ML (sem ssid/csrf)
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');

const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     || '1547036702834286';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'VvfVOTiFVm55ULCSUm66ZYGCpaEu7SQA';
const ML_REDIRECT_URI  = process.env.ML_REDIRECT_URI  || 'https://salvatore-crossbanded-aurorally.ngrok-free.dev/api/ml/callback';
const ML_AFFILIATE_TAG = process.env.ML_AFFILIATE_TAG || 'baga20231223204119';

class MLAffiliateService {
  constructor() {
    this.accessToken  = process.env.ML_ACCESS_TOKEN  || null;
    this.refreshToken = process.env.ML_REFRESH_TOKEN || null;
    this.tokenExpiry  = null;
    this.userId       = null;
    this.linkCache    = new Map();
    this._initialized = false;

    this._initFromDB();
  }

  // ─── Carrega credenciais do MongoDB ───────────────────────────────────────
  async _initFromDB() {
    try {
      const { getProductConnection } = require('../database/mongodb');
      const IntegrationModel = require('../models/Integration');

      const conn = getProductConnection();
      const Integration = IntegrationModel(conn);

      const config = await Integration.findOne({ provider: 'mercadolivre', isActive: true });

      if (config) {
        if (config.accessToken)  this.accessToken  = config.accessToken;
        if (config.refreshToken) this.refreshToken = config.refreshToken;
        if (config.tokenExpiry)  this.tokenExpiry  = config.tokenExpiry;
        if (config.userId)       this.userId       = config.userId;

        console.log('✅ [MLAffiliateService] Credenciais carregadas do MongoDB');
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

  disconnect() {
    this.accessToken  = null;
    this.refreshToken = null;
    this.tokenExpiry  = null;
    this.userId       = null;
    this.linkCache.clear();
    console.log('🔌 [MLAffiliateService] Desconectado');
  }

  // ─── OAuth ────────────────────────────────────────────────────────────────
  getAuthUrl() {
    return `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}`;
  }

  async exchangeCode(code) {
    console.log('🔍 [DEBUG] Trocando code:', {
      client_id: ML_CLIENT_ID,
      redirect_uri: ML_REDIRECT_URI,
      code
    });

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
    this.userId       = response.data.user_id;

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

    // Persiste no MongoDB
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

  isAffiliateLink(link) {
    return link && typeof link === 'string' && (link.includes('meli.la') || link.includes('/sec/'));
  }

  // ─── Gera link de afiliado via API oficial do ML ──────────────────────────
  async generateAffiliateLink(productUrl, _retryCount = 0) {
    await this._ensureInit();

    if (this.linkCache.has(productUrl)) {
      return this.linkCache.get(productUrl);
    }

    try {
      await this.ensureValidToken();

      // Extrai o item ID da URL (ex: MLB123456789)
      const itemIdMatch = productUrl.match(/MLB[\-]?(\d+)/i);
      if (!itemIdMatch) {
        console.warn(`⚠️  [Affiliate] Não foi possível extrair item ID de: ${productUrl}`);
        return null;
      }

      const itemId = `MLB${itemIdMatch[1]}`;

      // Endpoint oficial da API do ML para afiliados
      const response = await axios.get(
        `https://api.mercadolibre.com/products/MLB${itemIdMatch[1]}/affiliate_link`,
        {
          params: {
            tag: ML_AFFILIATE_TAG,
            site_id: 'MLB',
          },
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
          timeout: 8000
        }
      );

      const affiliateLink = response.data?.link || response.data?.url || response.data?.short_url;

      if (affiliateLink && this.isAffiliateLink(affiliateLink)) {
        this.linkCache.set(productUrl, affiliateLink);
        console.log(`✅ [Affiliate] Link gerado: ${affiliateLink}`);
        return affiliateLink;
      }

      // Fallback: tenta endpoint alternativo
      return await this._generateAffiliateLinkFallback(productUrl, itemId);

    } catch (error) {
      // Se 401 e ainda não tentou refresh, tenta uma vez
      if (error.response?.status === 401 && _retryCount === 0) {
        try {
          await this.refreshAccessToken();
          return await this.generateAffiliateLink(productUrl, 1);
        } catch (e) {
          console.error('❌ [Affiliate] Falha ao renovar token:', e.message);
          return null;
        }
      }

      // Tenta fallback se o endpoint principal falhou
      if (_retryCount === 0) {
        return await this._generateAffiliateLinkFallback(productUrl, null);
      }

      console.error(`❌ [Affiliate] ${error.response?.status || ''} ${error.message}`);
      return null;
    }
  }

  // ─── Fallback: endpoint alternativo de criação de links ───────────────────
  async _generateAffiliateLinkFallback(productUrl, itemId) {
    try {
      // Tenta via endpoint de short links da API oficial
      const response = await axios.post(
        `https://api.mercadolibre.com/affiliates/MLB/links`,
        {
          tag:  ML_AFFILIATE_TAG,
          url:  productUrl,
          ...(itemId && { item_id: itemId }),
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type':  'application/json',
          },
          timeout: 8000
        }
      );

      const affiliateLink = response.data?.link || response.data?.url || response.data?.short_url;

      if (affiliateLink && this.isAffiliateLink(affiliateLink)) {
        this.linkCache.set(productUrl, affiliateLink);
        console.log(`✅ [Affiliate] Link gerado (fallback): ${affiliateLink}`);
        return affiliateLink;
      }

      console.warn(`⚠️  [Affiliate] Fallback sem link meli.la:`, JSON.stringify(response.data));
      return null;

    } catch (error) {
      console.error(`❌ [Affiliate] Fallback falhou: ${error.response?.status || ''} ${error.message}`);
      if (error.response?.data) {
        console.error(`❌ [Affiliate] Detalhe:`, JSON.stringify(error.response.data));
      }
      return null;
    }
  }
}

const mlAffiliateService = new MLAffiliateService();
module.exports = mlAffiliateService;