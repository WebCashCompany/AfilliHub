// back/routes/preferences.routes.js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

module.exports = (preferencesModel, io) => {
  const router = express.Router();

  // Todas as rotas exigem autenticação — chega de userId='default'
  router.use(requireAuth);

  // GET /api/preferences
  router.get('/', async (req, res) => {
    try {
      const prefs = await preferencesModel.getPreferences(req.userId);
      res.json({ success: true, preferences: prefs.toPublic() });
    } catch (error) {
      console.error('❌ [Preferences] Erro ao buscar:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PATCH /api/preferences
  router.patch('/', async (req, res) => {
    try {
      const { updates } = req.body;

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ success: false, error: 'updates é obrigatório' });
      }

      // Garante que o userId do token não pode ser sobrescrito pelo body
      delete updates.userId;

      const prefs = await preferencesModel.updatePreferences(req.userId, updates);

      // Notifica outros dispositivos do mesmo usuário via Socket.IO
      io.to(`user:${req.userId}`).emit('preferences:updated', {
        userId:      req.userId,
        preferences: prefs.toPublic()
      });

      res.json({ success: true, preferences: prefs.toPublic() });
    } catch (error) {
      console.error('❌ [Preferences] Erro ao atualizar:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE /api/preferences  (reset para padrão)
  router.delete('/', async (req, res) => {
    try {
      await preferencesModel.deleteOne({ userId: req.userId });
      const prefs = await preferencesModel.getPreferences(req.userId);
      res.json({ success: true, preferences: prefs.toPublic() });
    } catch (error) {
      console.error('❌ [Preferences] Erro ao resetar:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};