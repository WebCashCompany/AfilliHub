// back/routes/divulgacao.routes.js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

module.exports = (whatsappService) => {
  const router = express.Router();

  // Todas as rotas exigem autenticação — req.userId estará disponível
  router.use(requireAuth);

  // ═══════════════════════════════════════════════════════════
  // SESSÕES
  // ═══════════════════════════════════════════════════════════

  router.get('/sessions', async (req, res) => {
    try {
      const sessions = await whatsappService.getAllSessions(req.userId);
      res.json({ success: true, sessions });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message, sessions: [] });
    }
  });

  router.post('/connect', async (req, res) => {
    try {
      const { sessionId } = req.body;
      const userId = req.userId;

      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId é obrigatório' });
      }

      let session = whatsappService.getSession(userId, sessionId);

      if (session?.isReady) {
        return res.json({ success: true, message: 'Sessão já conectada!', session: session.getStatus() });
      }

      if (!session) {
        session = whatsappService.createSession(userId, sessionId);
      }

      session.initialize().catch(err => {
        console.error(`Erro ao inicializar sessão ${sessionId}:`, err);
      });

      res.json({
        success: true,
        message: 'Sessão inicializada! Aguarde o QR Code...',
        session: session.getStatus()
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/disconnect', async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId é obrigatório' });
      }
      await whatsappService.deleteSession(req.userId, sessionId);
      res.json({ success: true, message: `Sessão ${sessionId} desconectada!` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/status/:sessionId', (req, res) => {
    try {
      const session = whatsappService.getSession(req.userId, req.params.sessionId);
      if (!session) {
        return res.json({
          success: true,
          session: { sessionId: req.params.sessionId, conectado: false, status: 'offline', clientReady: false }
        });
      }
      res.json({ success: true, session: session.getStatus() });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // GRUPOS E MENSAGENS
  // ═══════════════════════════════════════════════════════════

  router.get('/groups/:sessionId', async (req, res) => {
    try {
      const session = whatsappService.getSession(req.userId, req.params.sessionId);
      if (!session?.isReady) {
        return res.status(400).json({ success: false, error: 'Sessão não está conectada', grupos: [] });
      }
      const grupos = await session.listarGrupos();
      res.json({ success: true, grupos });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message, grupos: [] });
    }
  });

  router.post('/send-offers', async (req, res) => {
    try {
      const { sessionId, grupoId, ofertas } = req.body;
      if (!sessionId || !grupoId || !ofertas?.length) {
        return res.status(400).json({ success: false, error: 'sessionId, grupoId e ofertas são obrigatórios' });
      }
      const session = whatsappService.getSession(req.userId, sessionId);
      if (!session?.isReady) {
        return res.status(400).json({ success: false, error: 'Sessão não está conectada' });
      }
      const result = await session.enviarOfertas(grupoId, ofertas);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/send-test', async (req, res) => {
    try {
      const { sessionId, grupoId } = req.body;
      if (!sessionId || !grupoId) {
        return res.status(400).json({ success: false, error: 'sessionId e grupoId são obrigatórios' });
      }
      const session = whatsappService.getSession(req.userId, sessionId);
      if (!session?.isReady) {
        return res.status(400).json({ success: false, error: 'Sessão não está conectada' });
      }
      const result = await session.enviarOfertas(grupoId, [{
        nome:     'Produto Teste',
        mensagem: '🎯 *TESTE DE ENVIO*\n\nProduto: Produto Teste\nPreço: R$ 99,90\nDesconto: -50%\n\n🔗 Link: https://exemplo.com',
        imagem:   null
      }]);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};