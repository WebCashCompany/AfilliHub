/**
 * ML AFFILIATE SERVICE - Versão Corrigida
 */
const axios = require('axios');

// Priorize sempre o .env. Se não existir, use os valores que você passou.
const ML_CLIENT_ID     = process.env.ML_CLIENT_ID     || '1547036702834286';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'VvfVOTiFVm55ULCSUm66ZYGCpaEu7SQA';
// IMPORTANTE: Esta URL deve ser IDÊNTICA à cadastrada no painel do desenvolvedor do ML
const ML_REDIRECT_URI  = process.env.ML_REDIRECT_URI  || 'https://salvatore-crossbanded-aurorally.ngrok-free.dev/api/ml/callback';
const ML_AFFILIATE_TAG = process.env.ML_AFFILIATE_TAG || 'baga20231223204119';

class MLAffiliateService {
  constructor() {
    this.accessToken  = null;
    this.refreshToken = null;
    this.tokenExpiry  = null;
    this.ssid         = '';
    this.csrf         = '';
    this.linkCache    = new Map();
    this._initialized = false;
    this._initPromise = this._initFromDB(); // Armazena a promessa de inicialização
  }

  async _initFromDB() {
    try {
      const { getProductConnection } = require('../database/mongodb');
      const IntegrationModel         = require('../models/Integration');

      const conn        = getProductConnection();
      const Integration = IntegrationModel(conn);

      const config = await Integration.findOne({ provider: 'mercadolivre', isActive: true });

      if (config) {
        this.accessToken  = config.accessToken  || null;
        this.refreshToken = config.refreshToken || null;
        this.tokenExpiry  = config.tokenExpiry  || null;
        this.ssid         = config.ssid         || '';
        this.csrf         = config.csrf         || '';

        console.log('✅ [MLAffiliateService] Credenciais carregadas do MongoDB');
      } else {
        console.log('ℹ️ [MLAffiliateService] Sem config no DB, usando variáveis de ambiente.');
      }
      this._initialized = true;
    } catch (error) {
      console.error('❌ [MLAffiliateService] Erro ao carregar do MongoDB:', error.message);
      this._initialized = true; // Marca como inicializado para não travar o fluxo, mas loga o erro
    }
  }

  async _ensureInit() {
    if (!this._initialized) {
      await this._initPromise;
    }
  }

  // Corrigido: Agora usa encodeURIComponent para garantir que a URL não quebre
  getAuthUrl() {
    const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}`;
    console.log(`🔗 [ML OAuth] URL gerada: ${url}`);
    return url;
  }

  async exchangeCode(code) {
    console.log('⏳ [ML OAuth] Trocando código por token...');
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', ML_CLIENT_ID);
        params.append('client_secret', ML_CLIENT_SECRET);
        params.append('code', code);
        params.append('redirect_uri', ML_REDIRECT_URI);

        const response = await axios.post(
          'https://api.mercadolibre.com/oauth/token',
          params,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        this.accessToken  = response.data.access_token;
        this.refreshToken = response.data.refresh_token;
        this.tokenExpiry  = Date.now() + (response.data.expires_in * 1000);

        // PERSISTÊNCIA APÓS LOGIN
        await this._saveToDB();

        console.log('✅ [ML OAuth] Login realizado com sucesso!');
        return response.data;
    } catch (error) {
        console.error('❌ [ML OAuth] Erro no exchangeCode:', error.response?.data || error.message);
        throw error;
    }
  }

  async _saveToDB() {
    try {
        const { getProductConnection } = require('../database/mongodb');
        const IntegrationModel         = require('../models/Integration');
        const conn = getProductConnection();
        const Integration = IntegrationModel(conn);

        await Integration.findOneAndUpdate(
            { provider: 'mercadolivre' },
            {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                tokenExpiry: this.tokenExpiry,
                ssid: this.ssid,
                csrf: this.csrf,
                isActive: true,
                updatedAt: new Date()
            },
            { upsert: true }
        );
        console.log('💾 [MLAffiliateService] Dados persistidos no MongoDB');
    } catch (e) {
        console.error('⚠️ Erro ao salvar no DB:', e.message);
    }
  }

  // ... (restante dos métodos de geração de link permanecem os mesmos)
}

const mlAffiliateService = new MLAffiliateService();
module.exports = mlAffiliateService;