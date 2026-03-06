const axios    = require('axios');
const supabase = require('../database/supabase');

/**
 * MLAffiliateService
 * Gerencia autenticação OAuth com o Mercado Livre e geração de links de afiliados.
 * ✅ Credenciais por usuário via Supabase (sem MongoDB)
 */
class MLAffiliateService {
  constructor() {
    this.accessToken  = null;
    this.refreshToken = null;
    this.tokenExpiry  = null;
    this.ssid = '';
    this.csrf = '';

    this.ML_CLIENT_ID     = process.env.ML_CLIENT_ID;
    this.ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
    this.ML_REDIRECT_URI  = process.env.ML_REDIRECT_URI;
    this.ML_AFFILIATE_TAG = process.env.ML_AFFILIATE_TAG;
  }

  // ─── Carrega credenciais do usuário específico ───────────────────────────
  async initFromSupabase(userId) {
    try {
      const { data, error } = await supabase
        .from('marketplace_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'mercadolivre')
        .single();

      if (error || !data) return;

      this.accessToken  = data.access_token  || null;
      this.refreshToken = data.refresh_token || null;
      this.tokenExpiry  = data.token_expiry  || null;
      this.ssid         = data.ssid          || '';
      this.csrf         = data.csrf_token    || '';

      console.log(`✅ [MLAffiliateService] Credenciais carregadas para userId=${userId}`);
    } catch (err) {
      console.warn('⚠️ [MLAffiliateService] Falha ao carregar credenciais:', err.message);
    }
  }

  // ─── URL de autorização com userId embutido no state ────────────────────
  getAuthUrl(userId) {
    const state  = Buffer.from(userId).toString('base64');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     this.ML_CLIENT_ID,
      redirect_uri:  this.ML_REDIRECT_URI,
      state,
    });
    return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
  }

  // ─── Troca code por tokens ───────────────────────────────────────────────
  async exchangeCode(code) {
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    try {
      const response = await axios.post(
        'https://api.mercadolibre.com/oauth/token',
        new URLSearchParams({
          grant_type:    'authorization_code',
          client_id:     this.ML_CLIENT_ID,
          client_secret: this.ML_CLIENT_SECRET,
          code,
          redirect_uri:  this.ML_REDIRECT_URI,
        }),
        { timeout: 15000 }
      );

      const tokenData   = response.data;
      this.accessToken  = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token;
      this.tokenExpiry  = Date.now() + tokenData.expires_in * 1000;

      return tokenData;
    } catch (error) {
      console.error('❌ [ML OAuth] Erro na troca de tokens:', error.response?.data || error.message);
      throw error;
    }
  }

  // ─── Gera link de afiliado ───────────────────────────────────────────────
  async generateAffiliateLink(productUrl) {
    if (!this.accessToken || !this.ssid) {
      console.warn('⚠️ [Affiliate] SSID ou Token ausentes. Retornando link original.');
      return productUrl;
    }

    try {
      const response = await axios.post(
        'https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links',
        { url: productUrl, tag: this.ML_AFFILIATE_TAG },
        {
          headers: {
            Authorization:  `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            Accept:         'application/json',
            origin:         'https://www.mercadolivre.com.br',
            Cookie:         `ssid=${this.ssid}; _csrf_token=${this.csrf}`,
            'x-csrf-token': this.csrf,
          },
          timeout: 10000,
        }
      );

      const affiliateLink = response.data.short_url || response.data.url;

      if (affiliateLink && !affiliateLink.includes('tracking_id=')) {
        console.log(`✅ [Affiliate] Link meli.la gerado: ${affiliateLink}`);
        return affiliateLink;
      }

      console.warn('⚠️ [Affiliate] API devolveu link comum. SSID pode estar expirado.');
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
    console.log('🍪 [MLAffiliateService] Sessão atualizada.');
  }

  disconnect() {
    this.accessToken  = null;
    this.refreshToken = null;
    this.tokenExpiry  = null;
    this.ssid = '';
    this.csrf = '';
  }
}

module.exports = new MLAffiliateService();