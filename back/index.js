// back/index.js
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { Server } = require('socket.io');

const { connectDB, getProductConnection, getWhatsAppConnection } = require('./database/mongodb');
const { getWhatsAppSessionModel }  = require('./database/models/WhatsAppSession');
const { getWhatsAppAuthModels }    = require('./database/models/WhatsAppAuthKeys');
const { getUserPreferencesModel }  = require('./database/models/UserPreferences');
const { getAutomationStateModel } = require('./database/models/AutomationState');

const supabase = require('./database/supabase');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// ─────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────
function isOriginAllowed(origin) {
  if (!origin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/vantpromo(-.+)?\.vercel\.app$/.test(origin)) return true;
  if (/^https:\/\/[a-zA-Z0-9-]+\.ngrok(-free)?\.app$/.test(origin)) return true;
  if (/^https:\/\/[a-zA-Z0-9-]+\.ngrok\.io$/.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) callback(null, true);
    else { console.warn(`🚫 CORS bloqueado: ${origin}`); callback(new Error(`CORS bloqueado: ${origin}`)); }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 'X-Requested-With', 'Content-Type',
    'Accept', 'Authorization', 'ngrok-skip-browser-warning',
  ],
  credentials:          true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) callback(null, true);
      else callback(new Error(`Socket CORS bloqueado: ${origin}`));
    },
    methods:        ['GET', 'POST'],
    credentials:    true,
    allowedHeaders: ['ngrok-skip-browser-warning'],
  },
  transports:   ['websocket', 'polling'],
  pingTimeout:  60000,
  pingInterval: 25000,
});

// ─── Verifica JWT via Supabase SDK (compatível com ECC P-256) ────────────────
async function getUserIdFromSocket(socket) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) return null;

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch (e) {
    return null;
  }
}

let whatsappService   = null;
let automationService = null;
let preferencesModel  = null;
let automationModel   = null; // ✅ NOVO: Referência para o modelo de automação

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║    🚀 AFFILIATE HUB PRO - API SERVER 🚀           ║');
console.log('╚════════════════════════════════════════════════════╝\n');

async function startServer() {
  try {
    await connectDB();

    const prodConnection = getProductConnection();
    const waConnection   = getWhatsAppConnection();

    const sessionModel = getWhatsAppSessionModel(waConnection);
    const authModels   = getWhatsAppAuthModels(waConnection);
    preferencesModel   = getUserPreferencesModel(prodConnection);
    automationModel = getAutomationStateModel(prodConnection);
 // ✅ NOVO: Inicializar modelo de automação

    // ─── Serviços ────────────────────────────────────────────────────
    const WhatsAppMultiSessionService = require('./services/WhatsAppMultiSessionService');
    whatsappService = new WhatsAppMultiSessionService(io, sessionModel, authModels);

    const AutomationService = require('./services/AutomationService');
    // ✅ NOVO: Passar o automationModel para o AutomationService
    automationService = new AutomationService(whatsappService, io, automationModel);

    // ✅ NOVO: Inicializar automações ativas do MongoDB
    // Isso garante que se o servidor reiniciar, as automações voltem a rodar!
    automationService.initializeActiveAutomations();

    // ─────────────────────────────────────────────────────────────────
    // SOCKET.IO EVENTS
    // ─────────────────────────────────────────────────────────────────
    io.on('connection', async (socket) => {
      const userId = await getUserIdFromSocket(socket); // ← async, sem jwt.verify

      if (userId) {
        socket.join(`user:${userId}`);
        console.log(`🔌 [SOCKET] userId=${userId} conectado (${socket.id})`);
        
        // ✅ NOVO: Enviar o estado atual da automação assim que o usuário conecta
        const state = await automationService?.getStatus(userId);
        if (state) {
          socket.emit('automation:state', { userId, ...state });
        }
      } else {
        console.warn(`⚠️ [SOCKET] Conexão sem token válido (${socket.id})`);
      }

      const sendSessionsToSocket = async (targetSocket, uid) => {
        if (!uid) {
          targetSocket.emit('sessions:list', { sessions: [] });
          return;
        }
        try {
          const sessions = await whatsappService.getAllSessions(uid);
          targetSocket.emit('sessions:list',          { sessions });
          targetSocket.emit('whatsapp:sessions-list', { sessions });
        } catch (error) {
          console.error('❌ [SOCKET] Erro ao enviar sessões:', error.message);
          targetSocket.emit('sessions:list', { sessions: [] });
        }
      };

      socket.on('sessions:get',              () => sendSessionsToSocket(socket, userId));
      socket.on('whatsapp:request-sessions', () => sendSessionsToSocket(socket, userId));

      socket.on('automation:request-state', async () => {
        if (!userId) return;
        const state = await automationService?.getStatus(userId); // ✅ Agora é async
        socket.emit('automation:state', { userId, ...(state || { active: false }) });
      });

      socket.on('preferences:request', async () => {
        if (!userId) return;
        try {
          const prefs = await preferencesModel.getPreferences(userId);
          socket.emit('preferences:response', { preferences: prefs.toPublic() });
        } catch (error) {
          console.error('❌ [SOCKET] Erro ao enviar preferências:', error.message);
        }
      });

      socket.on('disconnect', () => {
        console.log(`❌ [SOCKET] ${userId || 'anônimo'} desconectado (${socket.id})`);
      });
    });

    // ─────────────────────────────────────────────────────────────────
    // ROTAS
    // ─────────────────────────────────────────────────────────────────
    app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

    app.use('/api/products',     require('./routes/products.routes'));
    app.use('/api/scraping',     require('./routes/scraping.routes'));
    app.use('/api/divulgacao',   require('./routes/divulgacao.routes')(whatsappService));
    app.use('/api/sessions',     require('./routes/sessions.routes'));
    app.use('/api/preferences',  require('./routes/preferences.routes')(preferencesModel, io));
    app.use('/api/integrations', require('./routes/integrations')());
    app.use('/api/ml',           require('./routes/ml-oauth.routes'));
    app.use('/api/automation',   require('./routes/automation.routes')(automationService));

    server.listen(PORT, () => {
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║   ✅ Servidor rodando na porta ${PORT}              ║`);
      console.log('╚════════════════════════════════════════════════════╝\n');
    });

  } catch (error) {
    console.error('❌ Erro crítico ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  if (whatsappService) {
    for (const [, session] of whatsappService.sessions) {
      try { await session.softDisconnect(); } catch (e) {}
    }
  }
  process.exit(0);
});
