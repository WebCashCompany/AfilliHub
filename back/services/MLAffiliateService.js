const axios = require('axios');
const { chromium } = require('playwright');

/**
 * MLAffiliateService
 * Gerencia a autenticação OAuth com o Mercado Livre e a geração de links de afiliados.
 * ✅ Versão simplificada: Usa access_token e csrf_token para gerar links, sem depender do SSID.
 */
class MLAffiliateService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.ssid = ''; // Mantido para compatibilidade, mas não é mais obrigatório
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
   * Captura apenas o cookie csrf via Playwright (O SSID não é mais obrigatório)
   * @param {string} accessToken - Token de acesso obtido via OAuth
   */
  async captureSessionCookies(accessToken) {
    console.log('🕵️ [Playwright] Iniciando captura de CSRF em background...');
    let browser;
    try {
      browser = await chromium.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      });
      
      const page = await context.newPage();
      page.setDefaultTimeout(45000);

      // Injetar o token via script de inicialização
      await page.addInitScript((token) => {
        window.localStorage.setItem('access_token', token);
        window.sessionStorage.setItem('access_token', token);
      }, accessToken);

      console.log('⏳ [Playwright] Acessando ML para gerar CSRF...');
      await page.goto('https://www.mercadolivre.com.br/affiliate-program/', { waitUntil: 'domcontentloaded' });
      
      // Aguarda um pouco para que o CSRF seja gerado (o ML gera ele sem problemas)
      await page.waitForTimeout(5000);

      const cookies = await context.cookies(['https://www.mercadolivre.com.br']);
      const csrf = cookies.find(c => ['_csrf_token', 'csrf_token', 'xsrf-token', '_csrf'].includes(c.name.toLowerCase()))?.value;
      const ssid = cookies.find(c => c.name.toLowerCase() === 'ssid')?.value;

      await browser.close();
      
      if (csrf) {
        console.log('✅ [Playwright] CSRF capturado com sucesso.');
      } else {
        console.warn('❌ [Playwright] CSRF não encontrado nos cookies.');
      }

      return { ssid: ssid || null, csrf: csrf || null };
    } catch (error) {
      console.error('❌ [Playwright] Erro na captura de CSRF:', error.message);
      if (browser) await browser.close();
      return { ssid: null, csrf: null };
    }
  }

  /**
   * Troca o código de autorização por tokens e captura o CSRF
   * @param {string} code - Código de autorização do OAuth
   */
  async exchangeCode(code) {
    console.log('🔄 [ML OAuth] Iniciando troca de código por tokens...');
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
      console.log(`✅ [ML OAuth] Tokens obtidos para o usuário ${tokenData.user_id}.`);
      
      // Inicia a captura de CSRF via Playwright
      const { ssid, csrf } = await this.captureSessionCookies(tokenData.access_token);

      // Atualiza o estado interno do serviço
      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
      this.ssid = ssid || '';
      this.csrf = csrf || '';

      return { ...tokenData, ssid: this.ssid, csrf: this.csrf };
    } catch (error) {
      console.error('❌ [ML OAuth] Erro na troca de tokens:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Gera um link de afiliado para uma URL de produto
   * ✅ Versão simplificada: Usa apenas access_token e csrf_token
   * @param {string} productUrl - URL original do produto no Mercado Livre
   */
  async generateAffiliateLink(productUrl) {
    if (!this.accessToken) {
      console.warn('⚠️ [Affiliate] Sem Token de acesso. Retornando URL original.');
      return productUrl;
    }

    try {
      console.log(`🔗 [Affiliate] Gerando link para: ${productUrl.substring(0, 50)}...`);
      
      const headers = {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'origin': 'https://www.mercadolivre.com.br'
      };

      // ✅ O SEGREDO: Usamos apenas o CSRF no Header e no Cookie, sem depender do SSID
      if (this.csrf) {
        headers['Cookie'] = `_csrf_token=${this.csrf}`;
        headers['x-csrf-token'] = this.csrf;
      }

      // Se por acaso tivermos o SSID, adicionamos ele para reforçar, mas não é mais obrigatório
      if (this.ssid) {
        headers['Cookie'] += `; ssid=${this.ssid}`;
      }

      const response = await axios.post(
        'https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links',
        { url: productUrl, tag: this.ML_AFFILIATE_TAG },
        { headers: headers, timeout: 10000 }
      );
      
      const affiliateLink = response.data.short_url || response.data.url;
      
      if (affiliateLink) {
        console.log(`✅ [Affiliate] Link gerado com sucesso: ${affiliateLink}`);
        return affiliateLink;
      }
      
      return productUrl;
    } catch (error) {
      console.error('❌ [Affiliate] Erro na API do ML:', error.response?.data || error.message);
      return productUrl;
    }
  }

  /**
   * Verifica se o serviço possui credenciais ativas
   * ✅ Agora retorna true apenas com o access_token, sem travar no SSID
   */
  isAuthenticated() {
    return !!this.accessToken;
  }

  /**
   * Atualiza manualmente os cookies em memória
   */
  updateCookies(ssid, csrf) {
    if (ssid) this.ssid = ssid;
    if (csrf) this.csrf = csrf;
    console.log('🍪 [MLAffiliateService] Cookies de sessão atualizados em memória.');
  }

  /**
   * Limpa as credenciais em memória (Logout)
   */
  disconnect() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.ssid = '';
    this.csrf = '';
    console.log('🗑️ [MLAffiliateService] Sessão encerrada e memória limpa.');
  }
}

module.exports = new MLAffiliateService();
