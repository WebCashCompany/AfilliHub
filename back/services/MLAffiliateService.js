const axios = require('axios');
const { chromium } = require('playwright');

class MLAffiliateService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.ssid = '';
    this.csrf = '';
    
    this.ML_CLIENT_ID = process.env.ML_CLIENT_ID || '1547036702834286';
    this.ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'VvfVOTiFVm55ULCSUm66ZYGCpaEu7SQA';
    
    // ✅ Usar variável de ambiente para flexibilidade (ngrok ou domínio real)
    this.ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || 'https://salvatore-crossbanded-aurorally.ngrok-free.dev/api/ml/callback';
    
    this.ML_AFFILIATE_TAG = process.env.ML_AFFILIATE_TAG || 'baga20231223204119';
    
    this._initFromDB();
  }

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

  getAuthUrl() {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.ML_CLIENT_ID,
      redirect_uri: this.ML_REDIRECT_URI
    });
    return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
  }

  /**
   * 🕵️ Captura cookies ssid e csrf via Playwright
   * Integrado diretamente no serviço para evitar arquivos extras
   */
  async captureSessionCookies(accessToken) {
    console.log('🕵️ [Playwright] Iniciando captura de cookies em background...');
    let browser;
    try {
      browser = await chromium.launch({ 
        headless: true, 
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled'
        ] 
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport:  { width: 1280, height: 720 }
      });
      
      const page = await context.newPage();

      console.log('⏳ [Playwright] Acessando ML base para injeção...');
      // Usamos 'domcontentloaded' e timeout maior para evitar o erro que você teve
      await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 🔥 INJEÇÃO AGRESSIVA DO TOKEN
      await page.evaluate((token) => {
        try {
          localStorage.setItem('access_token', token);
          sessionStorage.setItem('access_token', token);
          document.cookie = `access_token=${token}; domain=.mercadolivre.com.br; path=/`;
        } catch (e) {}
      }, accessToken);

      console.log('⏳ [Playwright] Recarregando para gerar SSID...');
      await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(5000); // Respiro para scripts do ML

      // Tenta ir para a página de afiliados para garantir o CSRF
      try {
        await page.goto('https://www.mercadolivre.com.br/affiliate-program/', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        await page.waitForTimeout(3000);
      } catch (e) {
        console.warn('⚠️ [Playwright] Timeout no affiliate-program, tentando capturar cookies assim mesmo.');
      }

      const cookies = await context.cookies(['https://www.mercadolivre.com.br']);
      const ssid = cookies.find(c => c.name.toLowerCase() === 'ssid')?.value;
      const csrf = cookies.find(c => ['_csrf_token', 'csrf_token', 'xsrf-token'].includes(c.name.toLowerCase()))?.value;

      await browser.close();
      
      console.log(`🍪 [Playwright] ssid: ${ssid ? '✅' : '❌'} | csrf: ${csrf ? '✅' : '❌'}`);
      return { ssid, csrf };
    } catch (error) {
      console.error('❌ [Playwright] Falha na captura:', error.message);
      if (browser) await browser.close();
      return { ssid: null, csrf: null };
    }
  }

  async exchangeCode(code) {
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.ML_CLIENT_ID,
        client_secret: this.ML_CLIENT_SECRET,
        code,
        redirect_uri: this.ML_REDIRECT_URI
      })
    );

    const tokenData = response.data;
    
    // 🔥 Captura os cookies logo após pegar o token
    const { ssid, csrf } = await this.captureSessionCookies(tokenData.access_token);

    this.accessToken = tokenData.access_token;
    this.refreshToken = tokenData.refresh_token;
    this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
    this.ssid = ssid || '';
    this.csrf = csrf || '';

    return { ...tokenData, ssid, csrf };
  }

  async generateAffiliateLink(productUrl) {
    if (!this.ssid || !this.accessToken) {
      console.warn('⚠️ [Affiliate] Sem SSID ou Token em memória. Tentando link direto.');
      return productUrl;
    }

    try {
      const response = await axios.post(
        'https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links',
        { url: productUrl, tag: this.ML_AFFILIATE_TAG },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Cookie': `ssid=${this.ssid}; _csrf_token=${this.csrf}`,
            'x-csrf-token': this.csrf,
            'Content-Type': 'application/json',
            'origin': 'https://www.mercadolivre.com.br'
          },
          timeout: 10000
        }
      );
      
      return response.data.short_url || response.data.url || productUrl;
    } catch (error) {
      console.error('❌ [Affiliate] Erro na API do ML:', error.message);
      return productUrl;
    }
  }

  isAuthenticated() {
    return !!this.accessToken && !!this.ssid;
  }

  updateCookies(ssid, csrf) {
    if (ssid) this.ssid = ssid;
    if (csrf) this.csrf = csrf;
    console.log('🍪 [MLAffiliateService] Cookies atualizados em memória');
  }

  disconnect() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.ssid = '';
    this.csrf = '';
    console.log('🗑️ [MLAffiliateService] Memória do serviço limpa com sucesso.');
  }
}

module.exports = new MLAffiliateService();
