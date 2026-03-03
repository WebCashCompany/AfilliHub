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
   * Captura cookies ssid e csrf via Playwright com estratégia de Furtividade Avançada
   * @param {string} accessToken - Token de acesso obtido via OAuth
   */
  async captureSessionCookies(accessToken) {
    console.log('🕵️ [Playwright] Iniciando captura de cookies em background (Advanced Stealth Mode)...');
    let browser;
    try {
      browser = await chromium.launch({ 
        headless: true, // Mantemos true para o servidor, mas com flags de furtividade
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certificate-errors',
          '--ignore-certificate-errors-spki-list',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        ] 
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport:  { width: 1280, height: 720 },
        extraHTTPHeaders: {
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      
      const page = await context.newPage();
      page.setDefaultTimeout(60000);

      // 🔥 O SEGREDO 1: Remover a propriedade 'webdriver' para evitar detecção de bot
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      // 🔥 O SEGREDO 2: Injetar o token via script de inicialização
      await page.addInitScript((token) => {
        window.localStorage.setItem('access_token', token);
        window.sessionStorage.setItem('access_token', token);
      }, accessToken);

      console.log('⏳ [Playwright] Acessando ML para injeção de cookies nativos...');
      // Navega para a home para estabelecer o domínio
      await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'domcontentloaded' });

      // Injeta o cookie de access_token via JavaScript para garantir o domínio correto
      await page.evaluate((token) => {
        const domain = ".mercadolivre.com.br";
        document.cookie = `access_token=${token}; domain=${domain}; path=/; Secure; SameSite=Lax`;
      }, accessToken);

      console.log('⏳ [Playwright] Forçando geração de SSID via página de Afiliados...');
      // Navega para a página de afiliados que obriga o ML a validar a sessão e gerar o SSID
      await page.goto('https://www.mercadolivre.com.br/affiliate-program/', { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      // Aguarda um pouco para que os scripts de segurança do ML validem a sessão e gravem o SSID
      await page.waitForTimeout(10000);

      // Captura todos os cookies do domínio
      const cookies = await context.cookies(['https://www.mercadolivre.com.br']);
      
      // Busca o SSID (pode estar em maiúsculo ou minúsculo)
      const ssid = cookies.find(c => c.name.toLowerCase() === 'ssid')?.value;
      
      // Busca o CSRF (o ML usa vários nomes, tentamos os mais comuns)
      const csrf = cookies.find(c => 
        ['_csrf_token', 'csrf_token', 'xsrf-token', '_csrf'].includes(c.name.toLowerCase())
      )?.value;

      await browser.close();
      
      if (ssid) {
        console.log('✅ [Playwright] SSID capturado com sucesso.');
      } else {
        console.warn('❌ [Playwright] SSID não encontrado nos cookies.');
        // Log dos cookies encontrados para depuração (apenas nomes)
        console.log('Cookies encontrados:', cookies.map(c => c.name).join(', '));
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
