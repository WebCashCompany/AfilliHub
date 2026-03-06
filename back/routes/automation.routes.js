// back/routes/automation.routes.js
const express = require('express');
const router = express.Router();

/**
 * Rotas de Automação — Backend-Driven
 * ─────────────────────────────────────────────────────────────────────────────
 * O envio é gerenciado pelo AutomationService no servidor.
 * O frontend apenas inicia/para/pausa e escuta eventos via Socket.IO.
 */
module.exports = (automationService) => {

  // ── POST /api/automation/start ────────────────────────────────────────────
  // Inicia um job de automação no servidor
  router.post('/start', async (req, res) => {
    try {
      const {
        userId = 'default',
        sessionId,
        grupoIds,         // array de IDs de grupos WhatsApp
        products,         // array de produtos com _mensagem pré-formatada
        intervalMinutes,
        currentIndex = 0,
        totalSent = 0,
      } = req.body;

      if (!sessionId)           return res.status(400).json({ success: false, error: 'sessionId é obrigatório' });
      if (!grupoIds?.length)    return res.status(400).json({ success: false, error: 'grupoIds é obrigatório' });
      if (!products?.length)    return res.status(400).json({ success: false, error: 'products é obrigatório' });
      if (!intervalMinutes || intervalMinutes < 1) {
        return res.status(400).json({ success: false, error: 'intervalMinutes deve ser >= 1' });
      }

      const state = automationService.start({
        userId,
        sessionId,
        grupoIds,
        products,
        intervalMinutes,
        currentIndex,
        totalSent,
      });

      res.json({ success: true, state });
    } catch (error) {
      console.error('❌ [automation/start]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/automation/stop ─────────────────────────────────────────────
  router.post('/stop', (req, res) => {
    try {
      const { userId = 'default' } = req.body;
      automationService.stop(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/automation/pause ────────────────────────────────────────────
  router.post('/pause', (req, res) => {
    try {
      const { userId = 'default' } = req.body;
      automationService.pause(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/automation/resume ───────────────────────────────────────────
  router.post('/resume', (req, res) => {
    try {
      const { userId = 'default' } = req.body;
      automationService.resume(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/automation/send-now ─────────────────────────────────────────
  router.post('/send-now', async (req, res) => {
    try {
      const { userId = 'default' } = req.body;
      const result = await automationService.sendNow(userId);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── GET /api/automation/status ────────────────────────────────────────────
  router.get('/status', (req, res) => {
    try {
      const userId = req.query.userId || 'default';
      const state = automationService.getStatus(userId);
      res.json({ success: true, active: !!state, state });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};