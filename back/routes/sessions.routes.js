const express = require('express');
const router = express.Router();
const MLSessionManager = require('../services/ml-session-manager');

const mlManager = new MLSessionManager();

/**
 * ═══════════════════════════════════════════════════════════════
 * API DE GERENCIAMENTO DE SESSÕES - MERCADO LIVRE
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * GET /api/sessions/ml
 * Lista todas as contas do Mercado Livre
 */
router.get('/ml', async (req, res) => {
  try {
    const accounts = mlManager.listAccounts();
    
    res.json({
      success: true,
      marketplace: 'mercadolivre',
      accounts: accounts,
      total: accounts.length,
      hasActive: accounts.some(acc => acc.isActive)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions/ml/:accountId
 * Busca detalhes de uma conta específica
 */
router.get('/ml/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = mlManager.getAccount(accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Conta não encontrada'
      });
    }

    res.json({
      success: true,
      account: account
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/ml/create
 * Cria uma nova conta (abre navegador para login)
 * Body: { name: "Nome da Conta" }
 */
router.post('/ml/create', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Nome da conta é obrigatório'
      });
    }

    console.log(`\n🚀 [API] Criando nova conta: ${name}`);

    // Retorna imediatamente
    res.json({
      success: true,
      message: 'Navegador sendo aberto... Faça login no Mercado Livre.',
      processing: true
    });

    // Processa em background
    try {
      const result = await mlManager.createAccount(name);
      console.log('✅ [API] Resultado da criação:', result);
    } catch (error) {
      console.error('❌ [API] Erro ao criar conta:', error);
    }
    
  } catch (error) {
    console.error('❌ [API] Erro na rota de criação:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/ml/:accountId/validate
 * Valida se uma sessão ainda está ativa
 */
router.post('/ml/:accountId/validate', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    console.log(`\n🔍 [API] Validando conta: ${accountId}`);
    const result = await mlManager.validateSession(accountId);
    
    res.json({
      success: true,
      accountId: accountId,
      validation: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/ml/:accountId/reauth
 * Reautentica uma conta (abre navegador novamente)
 */
router.post('/ml/:accountId/reauth', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    console.log(`\n🔄 [API] Reautenticando conta: ${accountId}`);

    // Retorna imediatamente
    res.json({
      success: true,
      message: 'Navegador sendo aberto... Faça login novamente.',
      processing: true
    });

    // Processa em background
    try {
      const result = await mlManager.reauthenticateAccount(accountId);
      console.log('✅ [API] Resultado da reautenticação:', result);
    } catch (error) {
      console.error('❌ [API] Erro ao reautenticar:', error);
    }
    
  } catch (error) {
    console.error('❌ [API] Erro na rota de reautenticação:', error);
  }
});

/**
 * PUT /api/sessions/ml/:accountId/activate
 * Define uma conta como ativa (padrão para scraping)
 */
router.put('/ml/:accountId/activate', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    console.log(`\n✅ [API] Ativando conta: ${accountId}`);
    const success = mlManager.setActiveAccount(accountId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Conta definida como ativa',
        accountId: accountId
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Conta não encontrada'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/sessions/ml/:accountId
 * Remove uma conta
 */
router.delete('/ml/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    console.log(`\n🗑️  [API] Removendo conta: ${accountId}`);
    const result = mlManager.deleteAccount(accountId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Conta removida com sucesso'
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions/ml/active/path
 * Retorna o caminho da sessão ativa (para uso no scraper)
 */
router.get('/ml/active/path', async (req, res) => {
  try {
    const sessionPath = mlManager.getActiveSessionPath();
    
    if (sessionPath) {
      res.json({
        success: true,
        sessionPath: sessionPath,
        exists: require('fs').existsSync(sessionPath)
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Nenhuma conta ativa configurada'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions/status
 * Retorna status geral de todas as conexões
 */
router.get('/status', async (req, res) => {
  try {
    const mlAccounts = mlManager.listAccounts();
    
    const status = {
      mercadolivre: {
        connected: mlAccounts.length > 0,
        accounts: mlAccounts.length,
        activeAccount: mlAccounts.find(acc => acc.isActive) || null,
        validAccounts: mlAccounts.filter(acc => acc.status === 'valid').length,
        expiredAccounts: mlAccounts.filter(acc => acc.status === 'expired').length
      },
      // Preparado para outros marketplaces
      amazon: {
        connected: false,
        accounts: 0,
        message: 'Não implementado'
      },
      magalu: {
        connected: false,
        accounts: 0,        message: 'Não implementado'
      },
      shopee: {
        connected: false,
        accounts: 0,
        message: 'Não implementado'
      }
    };

    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;