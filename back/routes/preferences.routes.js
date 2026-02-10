// back/routes/preferences.routes.js
const express = require('express');
const router = express.Router();

module.exports = (preferencesModel, io) => {
  
  // ═══════════════════════════════════════════════════════════
  // GET - Buscar preferências
  // ═══════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const userId = req.query.userId || 'default';
      const prefs = await preferencesModel.getPreferences(userId);
      
      res.json({
        success: true,
        preferences: prefs.toPublic()
      });
    } catch (error) {
      console.error('❌ Erro ao buscar preferências:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // ═══════════════════════════════════════════════════════════
  // PUT - Atualizar preferências
  // ═══════════════════════════════════════════════════════════
  router.put('/', async (req, res) => {
    try {
      const userId = req.body.userId || 'default';
      const updates = req.body.preferences || {};
      
      console.log(`💾 Atualizando preferências do usuário: ${userId}`);
      console.log('📝 Updates:', JSON.stringify(updates, null, 2));
      
      const prefs = await preferencesModel.updatePreferences(userId, updates);
      
      // 🔥 BROADCAST para todos os clientes conectados
      io.emit('preferences:updated', {
        userId,
        preferences: prefs.toPublic()
      });
      
      console.log(`✅ Preferências atualizadas e sincronizadas para todos os dispositivos`);
      
      res.json({
        success: true,
        preferences: prefs.toPublic()
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar preferências:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // ═══════════════════════════════════════════════════════════
  // PATCH - Atualizar parcialmente (merge)
  // ═══════════════════════════════════════════════════════════
  router.patch('/', async (req, res) => {
    try {
      const userId = req.body.userId || 'default';
      const updates = req.body.updates || {};
      
      console.log(`🔄 Atualizando preferências (parcial): ${userId}`);
      
      const prefs = await preferencesModel.updatePreferences(userId, updates);
      
      // 🔥 BROADCAST
      io.emit('preferences:updated', {
        userId,
        preferences: prefs.toPublic()
      });
      
      res.json({
        success: true,
        preferences: prefs.toPublic()
      });
    } catch (error) {
      console.error('❌ Erro ao atualizar preferências:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // ═══════════════════════════════════════════════════════════
  // DELETE - Resetar preferências
  // ═══════════════════════════════════════════════════════════
  router.delete('/', async (req, res) => {
    try {
      const userId = req.query.userId || 'default';
      
      console.log(`🗑️ Resetando preferências do usuário: ${userId}`);
      
      await preferencesModel.deleteOne({ userId });
      const newPrefs = await preferencesModel.create({ userId });
      
      // 🔥 BROADCAST
      io.emit('preferences:updated', {
        userId,
        preferences: newPrefs.toPublic()
      });
      
      res.json({
        success: true,
        message: 'Preferências resetadas',
        preferences: newPrefs.toPublic()
      });
    } catch (error) {
      console.error('❌ Erro ao resetar preferências:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  return router;
};