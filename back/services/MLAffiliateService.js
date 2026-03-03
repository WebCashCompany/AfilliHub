const axios = require('axios');

/**
 * MLAffiliateService
 * Gerencia a autenticação OAuth com o Mercado Livre e a geração de links de afiliados.
 * ✅ Versão Final: Focada em usar SSID e CSRF fornecidos para garantir o link meli.la
 */
class MLAffiliateService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.ssid = '';
    this.csrf = '';
    
    this.ML_CLIENT_ID = process.env.ML_CLIENT_ID || '1547036702834286';
    this.ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'VvfVOTiFVm55ULCSUm66ZYGCpaEu7SQA';
    this.ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || 'https://salvatore-crossbanded-aurorally.ngrok-free.dev/api/ml/callback';
    this.ML_AFFILIATE_TAG = process.env.ML_AFFILIATE_TAG || 'baga20231223204119';
    
    this._initFromDB();
  }

  /**
   * Inicializa as credenciais a partir do MongoDB
   */
  async _initFromDB() {
    try {
      const { getProductConnection } = require('../database/mongodb');
      const IntegrationModel = require('../models/Integration');
      const conn = getProductConnection();
      const Integration = IntegrationModel(conn);

      const config = await Integration.findOne({ provider: 'mercadolivre' });
      if (config) {
        this.accessToken = config.accessToken;
        this.refreshToken = config.refreshToken;
        this.tokenExpiry = config.tokenExpiry;
        this.ssid = config.ssid || '';
        this.csrf = config.csrf || '';
        console.log('✅ [MLAffiliateService] Credenciais carregadas do MongoDB');
      }
    } catch (error) {
      console.warn('⚠️ [MLAffiliateService] Falha ao carregar credenciais do banco.');
    }
  }

  /**
   * Retorna a URL de autorização do Mercado Livre
   */
  getAuthUrl() {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.ML_CLIENT_ID,
      redirect_uri: this.ML_REDIRECT_URI
    });
    return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
  }

  /**
   * Troca o código de autorização por tokens
   */
  async exchangeCode(code) {
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    try {
      const response = await axios.post('https://api.mercadolibre.com/oauth/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.ML_CLIENT_ID,
          client_secret: this.ML_CLIENT_SECRET,
          code,
          redirect_uri: this.ML_REDIRECT_URI
        }),
        { timeout: 15000 }
      );

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);

      return tokenData;
    } catch (error) {
      console.error('❌ [ML OAuth] Erro na troca de tokens:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Gera um link de afiliado para uma URL de produto
   * @param {string} productUrl - URL original do produto no Mercado Livre
   */
  async generateAffiliateLink(productUrl) {
    if (!this.accessToken || !this.ssid) {
      console.warn('⚠️ [Affiliate] SSID ou Token ausentes. A API do ML vai ignorar a afiliação.');
      return productUrl;
    }

    try {
      const headers = {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'origin': 'https://www.mercadolivre.com.br',
        'Cookie': `ssid=${this.ssid}; _csrf_token=${this.csrf}`,
        'x-csrf-token': this.csrf
      };

      const response = await axios.post(
        'https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links',
        { url: productUrl, tag: this.ML_AFFILIATE_TAG },
        { headers: headers, timeout: 10000 }
      );
      
      const affiliateLink = response.data.short_url || response.data.url;
      
      if (affiliateLink && !affiliateLink.includes('tracking_id=')) {
        console.log(`✅ [Affiliate] Link meli.la gerado: ${affiliateLink}`);
        return affiliateLink;
      }
      
      console.warn('⚠️ [Affiliate] API devolveu link comum. Verifique se o SSID ainda é válido.');
      return productUrl;
    } catch (error) {
      console.error('❌ [Affiliate] Erro na API do ML:', error.response?.data || error.message);
      return productUrl;
    }
  }

  isAuthenticated() {
    return !!this.accessToken && !!this.ssid;
  }

  updateSession(ssid, csrf) {
    this.ssid = ssid;
    this.csrf = csrf;
    console.log('🍪 [MLAffiliateService] Sessão atualizada manualmente.');
  }

  disconnect() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.ssid = '';
    this.csrf = '';
  }
}

module.exports = new MLAffiliateService();
