// back/middleware/requireAuth.js
//
// Valida o JWT do Supabase usando o SDK oficial (@supabase/supabase-js).
// Necessário porque o projeto usa ECC (P-256) como algoritmo de assinatura,
// que não é suportado diretamente pelo jsonwebtoken sem a chave pública.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL             = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env!');
}

// Cliente admin — usa service_role para verificar tokens de qualquer usuário
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken:  false,
    persistSession:    false,
    detectSessionInUrl: false,
  }
});

/**
 * Middleware obrigatório.
 * Injeta req.userId (= auth.uid() do Supabase) após validar o Bearer token.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token de autenticação ausente' });
    }

    const token = authHeader.split(' ')[1];

    // Verifica o token via Supabase — funciona com HS256 e ECC (P-256)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }

    req.userId    = user.id;
    req.userEmail = user.email || null;
    req.userRole  = user.user_metadata?.role || user.role || null;

    next();
  } catch (err) {
    console.error('[requireAuth] Erro inesperado:', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno de autenticação' });
  }
}

/**
 * Middleware opcional — não rejeita se não houver token.
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);

    if (user) {
      req.userId    = user.id;
      req.userEmail = user.email || null;
      req.userRole  = user.user_metadata?.role || null;
    }
  } catch (_) {}
  next();
}

module.exports = { requireAuth, optionalAuth };