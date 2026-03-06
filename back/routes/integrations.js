// back/routes/integrations.js
const express  = require('express');
const supabase = require('../database/supabase');

module.exports = () => {
  const router = express.Router();

  // ─── Helper: extrai user_id do JWT ──────────────────────────────────────
  async function getUserId(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  }

  // ─── GET /api/integrations/:provider ────────────────────────────────────
  router.get('/:provider', async (req, res) => {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Não autenticado' });

    const { provider } = req.params;

    const { data, error } = await supabase
      .from('marketplace_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    if (error || !data) {
      return res.json({ provider, affiliateId: null, authenticated: false, hasCookies: false });
    }

    res.json({
      provider:      data.provider,
      affiliateId:   data.affiliate_id,
      authenticated: !!data.access_token,
      hasCookies:    !!data.ssid,
      connectedAt:   data.connected_at,
    });
  });

  // ─── POST /api/integrations/:provider ───────────────────────────────────
  router.post('/:provider', async (req, res) => {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Não autenticado' });

    const { provider }    = req.params;
    const { affiliateId } = req.body;

    if (provider !== 'mercadolivre' && !affiliateId) {
      return res.status(400).json({ message: 'ID do afiliado é obrigatório' });
    }

    const { data, error } = await supabase
      .from('marketplace_integrations')
      .upsert(
        {
          user_id:      userId,
          provider,
          affiliate_id: affiliateId,
          connected_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      )
      .select()
      .single();

    if (error) {
      console.error('❌ [Integrations] Erro ao salvar:', error.message);
      return res.status(500).json({ message: 'Erro ao salvar integração' });
    }

    console.log(`✅ [Integrations] userId=${userId} provider=${provider} salvo no Supabase`);
    res.json({ provider: data.provider, affiliateId: data.affiliate_id });
  });

  // ─── DELETE /api/integrations/:provider ─────────────────────────────────
  router.delete('/:provider', async (req, res) => {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ message: 'Não autenticado' });

    const { provider } = req.params;

    const { error } = await supabase
      .from('marketplace_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) return res.status(500).json({ message: 'Erro ao remover integração' });

    console.log(`🗑️ [Integrations] userId=${userId} provider=${provider} removido`);
    res.json({ success: true });
  });

  return router;
};