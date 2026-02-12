const express = require('express');

module.exports = (IntegrationModel) => {
  const router = express.Router();

  // GET /api/integrations/:provider
  router.get('/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      const config = await IntegrationModel.findOne({ provider });
      
      if (!config) {
        return res.json({ affiliateId: null });
      }
      
      res.json(config);
    } catch (error) {
      console.error(`❌ Erro ao buscar integração ${req.params.provider}:`, error);
      res.status(500).json({ message: 'Erro interno ao buscar configuração' });
    }
  });

  // POST /api/integrations/:provider
  router.post('/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      const { affiliateId } = req.body;
      
      if (!affiliateId) {
          return res.status(400).json({ message: 'ID do afiliado é obrigatório' });
      }

      const config = await IntegrationModel.findOneAndUpdate(
        { provider },
        { 
          provider, 
          affiliateId, 
          updatedAt: Date.now() 
        },
        { upsert: true, new: true }
      );
      
      res.json(config);
    } catch (error) {
      console.error('❌ Erro ao salvar integração:', error);
      res.status(500).json({ message: 'Erro interno ao salvar' });
    }
  });

  return router;
};