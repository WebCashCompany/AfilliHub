const axios = require('axios');
const { chromium } = require('playwright');

/**
 * MLAffiliateService
 * Gerencia a autenticação OAuth com o Mercado Livre e a captura de cookies de sessão (SSID/CSRF)
 * via Playwright para geração de links de afiliados.
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
   * Captura cookies ssid e csrf via Playwright com estratégia de resiliência
   * @param {string} accessToken - Token de acesso obtido via OAuth
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

      // Configura um timeout global para a página
      page.setDefaultTimeout(60000);

      console.log('⏳ [Playwright] Acessando ML base para injeção...');
      // Estratégia 'commit': prossegue assim que a resposta do servidor é recebida, ignorando o carregamento de assets
      await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'commit', timeout: 60000 });

      // Injeção de tokens em múltiplos storages para garantir o reconhecimento da sessão
      await page.evaluate((token) => {
        try {
          localStorage.setItem('access_token', token);
          sessionStorage.setItem('access_token', token);
          document.cookie = `access_token=${token}; domain=.mercadolivre.com.br; path=/; Secure; SameSite=Lax`;
        } catch (e) {
          console.error('Erro na injeção de tokens:', e.message);
        }
      }, accessToken);

      console.log('⏳ [Playwright] Recarregando para validação da sessão...');
      // Recarrega e espera o DOM estar pronto, sem travar em scripts de terceiros
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Pequena pausa para execução de scripts assíncronos do ML
      await page.waitForTimeout(5000);

      console.log('⏳ [Playwright] Navegando para o painel de afiliados para capturar CSRF...');
      try {
        // Navega para a página de afiliados onde o CSRF é gerado obrigatoriamente
        await page.goto('https://www.mercadolivre.com.br/affiliate-program/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await page.waitForTimeout(3000);
      } catch (e) {
        console.warn('⚠️ [Playwright] Timeout parcial no affiliate-program, prosseguindo para captura de cookies.');
      }

      // Captura todos os cookies do domínio
      const cookies = await context.cookies(['https://www.mercadolivre.com.br']);
      const ssid = cookies.find(c => c.name.toLowerCase() === 'ssid')?.value;
      const csrf = cookies.find(c => ['_csrf_token', 'csrf_token', 'xsrf-token'].includes(c.name.toLowerCase()))?.value;

      await browser.close();
      
      if (ssid && csrf) {
        console.log('✅ [Playwright] Cookies capturados com sucesso.');
      } else {
        console.warn(`⚠️ [Playwright] Captura incompleta - SSID: ${ssid ? '✅' : '❌'} | CSRF: ${csrf ? '✅' : '❌'}`);
      }

      return { ssid: ssid || null, csrf: csrf || null };
    } catch (error) {
      console.error('❌ [Playwright] Erro crítico na captura:', error.message);
      if (browser) await browser.close();
      return { ssid: null, csrf: null };
    }
  }

  /**
   * Troca o código de autorização por tokens e captura cookies de sessão
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
      
      // Inicia a captura de cookies via Playwright
      const { ssid, csrf } = await this.captureSessionCookies(tokenData.access_token);

      // Atualiza o estado interno do serviço
      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
      this.ssid = ssid || '';
      this.csrf = csrf || '';

      return { ...tokenData, ssid, csrf };
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
    if (!this.ssid || !this.accessToken) {
      console.warn('⚠️ [Affiliate] Credenciais de sessão ausentes. Retornando URL original.');
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
      console.error('❌ [Affiliate] Erro ao gerar link via API ML:', error.message);
      return productUrl;
    }
  }

  /**
   * Verifica se o serviço possui credenciais ativas
   */
  isAuthenticated() {
    return !!this.accessToken && !!this.ssid;
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
