const express     = require('express');
const router      = express.Router();
const mlAffiliate = require('../services/MLAffiliateService');
const supabase    = require('../database/supabase');

router.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// ─── Helper: extrai user_id do JWT do Supabase ──────────────────────────────
async function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// ─── Helper: upsert na tabela marketplace_integrations ──────────────────────
async function upsertIntegration(userId, provider, fields) {
  const { error } = await supabase
    .from('marketplace_integrations')
    .upsert(
      { user_id: userId, provider, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,provider' }
    );
  if (error) throw error;
}

// ─── GET /api/ml/auth ────────────────────────────────────────────────────────
// Exige JWT — extrai userId e embute no state do OAuth
router.get('/auth-url', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });

  console.log(`🔗 [ML OAuth] Gerando URL para userId=${userId}...`);
  const url = mlAffiliate.getAuthUrl(userId);
  res.json({ url });
});

// ─── GET /api/ml/callback ────────────────────────────────────────────────────
// ML redireciona aqui após autorização — recupera userId do state
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const redirectUrl = 'https://vantpromo.vercel.app/settings';

  if (error) {
    console.error('❌ [ML OAuth] Erro retornado pelo ML:', error);
    return res.redirect(`${redirectUrl}?ml_error=${encodeURIComponent(error)}`);
  }

  if (!code)  return res.redirect(`${redirectUrl}?ml_error=no_code`);
  if (!state) return res.redirect(`${redirectUrl}?ml_error=no_state`);

  // Recupera o userId que foi embutido no state durante /auth
  let userId;
  try {
    userId = Buffer.from(state, 'base64').toString('utf8');
  } catch {
    return res.redirect(`${redirectUrl}?ml_error=invalid_state`);
  }

  try {
    console.log('🔄 [ML OAuth] Trocando código por tokens...');
    const tokenData = await mlAffiliate.exchangeCode(code);

    await upsertIntegration(userId, 'mercadolivre', {
      ml_user_id:    String(tokenData.user_id),
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expiry:  new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      connected_at:  new Date().toISOString(),
    });

    console.log(`✅ [ML OAuth] userId=${userId} autenticado e salvo no Supabase`);
    return res.redirect(`${redirectUrl}?ml_connected=true&need_session=true`);
  } catch (err) {
    console.error('❌ [ML Callback]', err.message);
    return res.redirect(`${redirectUrl}?ml_error=token_exchange_failed`);
  }
});

// ─── POST /api/ml/session ────────────────────────────────────────────────────
router.post('/session', async (req, res) => {
  const { ssid, csrf } = req.body;
  if (!ssid) return res.status(400).json({ error: 'SSID é obrigatório' });

  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });

  try {
    await upsertIntegration(userId, 'mercadolivre', {
      ssid,
      csrf_token:  csrf || '',
      has_cookies: true,
    });

    mlAffiliate.updateSession(ssid, csrf);
    console.log(`🍪 [ML Session] userId=${userId} sessão salva`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ [ML Session]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ml/status ──────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.json({ authenticated: false, hasCookies: false });

  try {
    const { data, error } = await supabase
      .from('marketplace_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'mercadolivre')
      .single();

    if (error || !data) {
      return res.json({ authenticated: false, hasCookies: false });
    }

    // Carrega credenciais no serviço para uso imediato (scraping, geração de links)
    await mlAffiliate.initFromSupabase(userId);

    console.log(`📊 [ML Status] userId=${userId} authenticated=${!!data.access_token} hasCookies=${!!data.ssid}`);
    res.json({
      authenticated: !!data.access_token,
      connectedAt:   data.connected_at,
      userId:        data.ml_user_id,
      hasCookies:    !!data.ssid,
      tokenExpiry:   data.token_expiry,
    });
  } catch (err) {
    console.error('❌ [ML Status]', err.message);
    res.json({ authenticated: false, hasCookies: false });
  }
});

// ─── DELETE /api/ml/disconnect ───────────────────────────────────────────────
router.delete('/disconnect', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const { error } = await supabase
      .from('marketplace_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'mercadolivre');

    if (error) throw error;

    mlAffiliate.disconnect();
    console.log(`🗑️ [ML Disconnect] userId=${userId} desconectado`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ [ML Disconnect]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;