const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/**
 * ═══════════════════════════════════════════════════════════════
 * GERENCIADOR DE MÚLTIPLAS SESSÕES - MERCADO LIVRE
 * ═══════════════════════════════════════════════════════════════
 */

class MLSessionManager {
  constructor() {
    this.sessionsDir = path.join(process.cwd(), 'sessions', 'mercadolivre');
    this.metadataPath = path.join(this.sessionsDir, 'accounts.json');
    
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
    
    this.loadMetadata();
  }

  loadMetadata() {
    if (fs.existsSync(this.metadataPath)) {
      try {
        const data = fs.readFileSync(this.metadataPath, 'utf-8');
        this.accounts = JSON.parse(data);
      } catch (error) {
        this.accounts = [];
      }
    } else {
      this.accounts = [];
      this.saveMetadata();
    }
  }

  saveMetadata() {
    try {
      fs.writeFileSync(
        this.metadataPath, 
        JSON.stringify(this.accounts, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('❌ Erro ao salvar metadata:', error.message);
    }
  }

  listAccounts() {
    return this.accounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      email: acc.email,
      isActive: acc.isActive,
      createdAt: acc.createdAt,
      lastValidated: acc.lastValidated,
      status: acc.status
    }));
  }

  getAccount(accountId) {
    return this.accounts.find(acc => acc.id === accountId);
  }

  getActiveAccount() {
    return this.accounts.find(acc => acc.isActive === true);
  }

  setActiveAccount(accountId) {
    this.accounts.forEach(acc => {
      acc.isActive = false;
    });

    const account = this.accounts.find(acc => acc.id === accountId);
    if (account) {
      account.isActive = true;
      this.saveMetadata();
      return true;
    }
    return false;
  }

  generateAccountId(name) {
    const timestamp = Date.now();
    const normalized = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-');
    
    return `ml-${normalized}-${timestamp}`;
  }

  async createAccount(accountName) {
    console.log(`\n🔐 Configurando conta: ${accountName}`);
    
    const accountId = this.generateAccountId(accountName);
    const sessionPath = path.join(this.sessionsDir, `${accountId}.json`);

    let browser;
    try {
      browser = await chromium.launch({ 
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ]
      });
      
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      const page = await context.newPage();
      
      console.log('🌐 Abrindo Mercado Livre...');
      await page.goto('https://www.mercadolivre.com.br/', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      console.log('⏳ Aguardando login do usuário...');
      
      let userEmail = null;
      let isLoggedIn = false;
      
      const checkInterval = setInterval(async () => {
        try {
          const loggedIn = await page.evaluate(() => {
            const userMenu = document.querySelector('[data-testid="user-menu"]') || 
                           document.querySelector('.nav-menu-user') ||
                           document.querySelector('.user-menu');
            return !!userMenu;
          });

          if (loggedIn && !isLoggedIn) {
            isLoggedIn = true;
            console.log('✅ Login detectado!');
            
            userEmail = await page.evaluate(() => {
              const emailEl = document.querySelector('[data-testid="user-email"]') ||
                            document.querySelector('.user-email') ||
                            document.querySelector('.nav-menu-user-email');
              return emailEl ? emailEl.innerText : null;
            });
          }
        } catch (error) {
          // Ignora erros
        }
      }, 5000);

      await new Promise((resolve) => {
        let timeout = setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 120000); // 2 minutos

        browser.on('disconnected', () => {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        });
      });

      clearInterval(checkInterval);

      if (isLoggedIn) {
        console.log('💾 Salvando sessão...');
        await context.storageState({ path: sessionPath });

        const newAccount = {
          id: accountId,
          name: accountName,
          email: userEmail || 'Email não detectado',
          sessionFile: `${accountId}.json`,
          createdAt: new Date().toISOString(),
          lastValidated: new Date().toISOString(),
          isActive: this.accounts.length === 0,
          status: 'valid'
        };

        this.accounts.push(newAccount);
        this.saveMetadata();

        console.log('✅ Conta configurada com sucesso!');
        return {
          success: true,
          account: newAccount
        };
      } else {
        console.log('⚠️  Login não detectado');
        return {
          success: false,
          error: 'Login não foi realizado'
        };
      }

    } catch (error) {
      console.error('❌ Erro ao criar conta:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      try {
        if (browser) await browser.close();
      } catch (e) {}
    }
  }

  async validateSession(accountId) {
    const account = this.getAccount(accountId);
    if (!account) {
      return { valid: false, error: 'Conta não encontrada' };
    }

    const sessionPath = path.join(this.sessionsDir, account.sessionFile);
    
    if (!fs.existsSync(sessionPath)) {
      account.status = 'expired';
      this.saveMetadata();
      return { valid: false, error: 'Arquivo de sessão não encontrado' };
    }

    try {
      const browser = await chromium.launch({ headless: true });
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      
      const context = await browser.newContext({
        storageState: sessionData,
        viewport: { width: 1280, height: 720 }
      });
      
      const page = await context.newPage();
      
      await page.goto('https://afiliados.mercadolivre.com.br/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      await page.waitForTimeout(3000);

      const isLoggedIn = await page.evaluate(() => {
        const isLoginPage = window.location.href.includes('login') || 
                          window.location.href.includes('auth');
        
        const hasPanel = document.querySelector('.dashboard') ||
                        document.querySelector('[data-testid="dashboard"]') ||
                        document.querySelector('.affiliate-panel');
        
        return !isLoginPage && hasPanel;
      });

      await browser.close();

      if (isLoggedIn) {
        account.status = 'valid';
        account.lastValidated = new Date().toISOString();
        this.saveMetadata();
        return { valid: true };
      } else {
        account.status = 'expired';
        this.saveMetadata();
        return { valid: false, error: 'Sessão expirada' };
      }

    } catch (error) {
      account.status = 'error';
      this.saveMetadata();
      return { valid: false, error: error.message };
    }
  }

  async reauthenticateAccount(accountId) {
    const account = this.getAccount(accountId);
    if (!account) {
      return { success: false, error: 'Conta não encontrada' };
    }

    const sessionPath = path.join(this.sessionsDir, account.sessionFile);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }

    return await this.createAccountSession(account.id, account.name);
  }

  async createAccountSession(accountId, accountName) {
    const sessionPath = path.join(this.sessionsDir, `${accountId}.json`);

    let browser;
    try {
      browser = await chromium.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      const page = await context.newPage();
      
      await page.goto('https://www.mercadolivre.com.br/', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      let isLoggedIn = false;
      const checkInterval = setInterval(async () => {
        try {
          const loggedIn = await page.evaluate(() => {
            const userMenu = document.querySelector('[data-testid="user-menu"]');
            return !!userMenu;
          });

          if (loggedIn && !isLoggedIn) {
            isLoggedIn = true;
          }
        } catch (error) {}
      }, 5000);

      await new Promise((resolve) => {
        let timeout = setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 120000);

        browser.on('disconnected', () => {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        });
      });

      clearInterval(checkInterval);

      if (isLoggedIn) {
        await context.storageState({ path: sessionPath });

        const account = this.getAccount(accountId);
        account.lastValidated = new Date().toISOString();
        account.status = 'valid';
        this.saveMetadata();

        return { success: true };
      } else {
        return { success: false, error: 'Login não realizado' };
      }

    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      try {
        if (browser) await browser.close();
      } catch (e) {}
    }
  }

  deleteAccount(accountId) {
    const account = this.getAccount(accountId);
    if (!account) {
      return { success: false, error: 'Conta não encontrada' };
    }

    const sessionPath = path.join(this.sessionsDir, account.sessionFile);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }

    this.accounts = this.accounts.filter(acc => acc.id !== accountId);
    
    if (account.isActive && this.accounts.length > 0) {
      this.accounts[0].isActive = true;
    }

    this.saveMetadata();

    return { success: true };
  }

  getActiveSessionPath() {
    const activeAccount = this.getActiveAccount();
    if (!activeAccount) {
      return null;
    }

    return path.join(this.sessionsDir, activeAccount.sessionFile);
  }

  getSessionPath(accountId) {
    const account = this.getAccount(accountId);
    if (!account) {
      return null;
    }

    return path.join(this.sessionsDir, account.sessionFile);
  }
}

module.exports = MLSessionManager;