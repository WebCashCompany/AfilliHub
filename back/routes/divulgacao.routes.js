// back/routes/divulgacao.routes.js - ATUALIZADO PARA MULTI-SESSÃO
const express = require('express');
const router = express.Router();

module.exports = (whatsappService) => {
  // ═══════════════════════════════════════════════════════════
  // GERENCIAMENTO DE SESSÕES
  // ═══════════════════════════════════════════════════════════

  // Listar todas as sessões ativas
  router.get('/sessions', (req, res) => {
    try {
      const sessions = whatsappService.getAllSessions();
      res.json({
        success: true,
        sessions: sessions
      });
    } catch (error) {
      console.error('Erro ao listar sessões:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        sessions: []
      });
    }
  });

  // Criar/Conectar nova sessão
  router.post('/connect', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'sessionId é obrigatório'
        });
      }

      console.log(`\n🔌 Conectando sessão: ${sessionId}`);

      let session = whatsappService.getSession(sessionId);
      
      if (session && session.isReady) {
        return res.json({
          success: true,
          message: 'Sessão já está conectada!',
          session: session.getStatus()
        });
      }

      if (!session) {
        session = whatsappService.createSession(sessionId);
      }

      // Não esperar a conexão completa, apenas iniciar
      session.initialize().catch(err => {
        console.error(`Erro ao inicializar sessão ${sessionId}:`, err);
      });

      res.json({
        success: true,
        message: 'Sessão inicializada! Aguarde o QR Code...',
        session: session.getStatus()
      });

    } catch (error) {
      console.error('❌ Erro ao conectar sessão:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Desconectar sessão específica
  router.post('/disconnect', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'sessionId é obrigatório'
        });
      }

      await whatsappService.deleteSession(sessionId);
      
      res.json({
        success: true,
        message: `Sessão ${sessionId} desconectada com sucesso!`
      });
    } catch (error) {
      console.error('Erro ao desconectar sessão:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Status de sessão específica
  router.get('/status/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = whatsappService.getSession(sessionId);
      
      if (!session) {
        return res.json({
          success: true,
          session: {
            sessionId: sessionId,
            conectado: false,
            status: 'offline',
            clientReady: false
          }
        });
      }

      res.json({
        success: true,
        session: session.getStatus()
      });
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // GRUPOS E MENSAGENS
  // ═══════════════════════════════════════════════════════════

  // Listar grupos de uma sessão
  router.get('/groups/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = whatsappService.getSession(sessionId);
      
      if (!session || !session.isReady) {
        return res.status(400).json({
          success: false,
          error: 'Sessão não está conectada',
          grupos: []
        });
      }

      const grupos = await session.listarGrupos();
      
      res.json({
        success: true,
        grupos: grupos
      });
    } catch (error) {
      console.error('Erro ao listar grupos:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        grupos: []
      });
    }
  });

  // Enviar ofertas (usando sessão específica)
  router.post('/send-offers', async (req, res) => {
    try {
      const { sessionId, grupoId, ofertas } = req.body;

      if (!sessionId || !grupoId || !ofertas || ofertas.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'sessionId, grupoId e ofertas são obrigatórios'
        });
      }

      const session = whatsappService.getSession(sessionId);
      
      if (!session || !session.isReady) {
        return res.status(400).json({
          success: false,
          error: 'Sessão não está conectada'
        });
      }

      const result = await session.enviarOfertas(grupoId, ofertas);

      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar ofertas:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Enviar teste
  router.post('/send-test', async (req, res) => {
    try {
      const { sessionId, grupoId } = req.body;

      if (!sessionId || !grupoId) {
        return res.status(400).json({
          success: false,
          error: 'sessionId e grupoId são obrigatórios'
        });
      }

      const session = whatsappService.getSession(sessionId);
      
      if (!session || !session.isReady) {
        return res.status(400).json({
          success: false,
          error: 'Sessão não está conectada'
        });
      }

      const ofertas = [
        {
          nome: 'Produto Teste',
          mensagem: '🎯 *TESTE DE ENVIO*\n\nProduto: Produto Teste\nPreço: R$ 99,90\nDesconto: -50%\n\n🔗 Link: https://exemplo.com',
          imagem: null
        }
      ];

      const result = await session.enviarOfertas(grupoId, ofertas);

      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar teste:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};