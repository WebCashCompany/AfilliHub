const express = require('express');

module.exports = (IntegrationModel) => {
  const router = express.Router();

  // GET /api/integrations/:provider
  // Busca a configuração atual de um marketplace específico
  router.get('/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      const config = await IntegrationModel.findOne({ provider });
      
      if (!config) {
        // Retorna estrutura vazia padrão para não quebrar o frontend
        return res.json({ 
          provider,
          affiliateId: null, 
          authenticated: false,
          hasCookies: false 
        });
      }
      
      res.json(config);
    } catch (error) {
      console.error(`❌ [Integrations] Erro ao buscar ${req.params.provider}:`, error);
      res.status(500).json({ message: 'Erro interno ao buscar configuração' });
    }
  });

  // POST /api/integrations/:provider
  // Usado principalmente para Magalu/Amazon onde o ID é inserido manualmente
  router.post('/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      const { affiliateId, isActive } = req.body;
      
      if (provider !== 'mercadolivre' && !affiliateId) {
        return res.status(400).json({ message: 'ID do afiliado é obrigatório para este provedor' });
      }

      // Atualiza apenas os campos fornecidos (evita sobrescrever tokens de ML com null)
      const updateData = { 
        provider,
        updatedAt: Date.now() 
      };

      if (affiliateId !== undefined) updateData.affiliateId = affiliateId;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (!updateData.connectedAt && provider !== 'mercadolivre') {
        updateData.connectedAt = Date.now();
      }

      const config = await IntegrationModel.findOneAndUpdate(
        { provider },
        { $set: updateData },
        { upsert: true, new: true }
      );
      
      console.log(`✅ [Integrations] Configuração de ${provider} atualizada.`);
      res.json(config);
    } catch (error) {
      console.error('❌ [Integrations] Erro ao salvar:', error);
      res.status(500).json({ message: 'Erro interno ao salvar' });
    }
  });

  // DELETE /api/integrations/:provider
  // Remove a integração completamente
  router.delete('/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      await IntegrationModel.deleteOne({ provider });
      console.log(`🗑️ [Integrations] ${provider} removido.`);
      res.json({ success: true, message: `Integração ${provider} removida.` });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao remover integração' });
    }
  });

  return router;
};