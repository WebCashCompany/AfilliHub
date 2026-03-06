// back/routes/automation.routes.js
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/requireAuth");

module.exports = (automationService) => {
  // ── POST /api/automation/start ────────────────────────────────────────────
  router.post("/start", requireAuth, async (req, res) => {
    try {
      const userId = req.userId; // ← vem do token, nunca do body

      const {
        sessionId,
        grupoIds,
        products,
        intervalMinutes,
        currentIndex = 0,
        totalSent = 0,
        categories = [], // ✅ NOVO: Receber categorias
        marketplaces = [], // ✅ NOVO: Receber marketplaces
      } = req.body;

      if (!sessionId) return res.status(400).json({ success: false, error: "sessionId é obrigatório" });
      if (!grupoIds?.length) return res.status(400).json({ success: false, error: "grupoIds é obrigatório" });
      if (!products?.length) return res.status(400).json({ success: false, error: "products é obrigatório" });
      if (!intervalMinutes || intervalMinutes < 1) {
        return res.status(400).json({ success: false, error: "intervalMinutes deve ser >= 1" });
      }

      const state = await automationService.start({
        userId,
        sessionId,
        grupoIds,
        products,
        intervalMinutes,
        currentIndex,
        totalSent,
        categories, // ✅ Passar categorias
        marketplaces, // ✅ Passar marketplaces
      });

      res.json({ success: true, state });
    } catch (error) {
      console.error("❌ [automation/start]", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/automation/stop ─────────────────────────────────────────────
  router.post("/stop", requireAuth, async (req, res) => {
    try {
      await automationService.stop(req.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/automation/pause ────────────────────────────────────────────
  router.post("/pause", requireAuth, async (req, res) => {
    try {
      await automationService.pause(req.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/automation/resume ───────────────────────────────────────────
  router.post("/resume", requireAuth, async (req, res) => {
    try {
      await automationService.resume(req.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── POST /api/automation/send-now ─────────────────────────────────────────
  router.post("/send-now", requireAuth, async (req, res) => {
    try {
      const result = await automationService.sendNow(req.userId);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── GET /api/automation/status ────────────────────────────────────────────
  router.get("/status", requireAuth, async (req, res) => {
    try {
      // ✅ AGORA É ASSÍNCRONO: pode precisar carregar do BD
      const state = await automationService.getStatus(req.userId);
      res.json({ success: true, active: !!state, state });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
