// back/index.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { Server } = require('socket.io');

const { connectDB, getProductConnection, getWhatsAppConnection } = require('./database/mongodb');
const { getWhatsAppSessionModel }  = require('./database/models/WhatsAppSession');
const { getWhatsAppAuthModels }    = require('./database/models/WhatsAppAuthKeys');
const { getUserPreferencesModel }  = require('./database/models/UserPreferences');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// ✅ CORREÇÃO DE CORS BLINDADA PARA O NGROK/VERCEL
const corsOptions = {
  origin: [
    'https://vantpromo.vercel.app', 
    'http://localhost:5173', 
    'http://localhost:3000',
    '*' // Mantém o asterisco como fallback de segurança
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'ngrok-skip-browser-warning'],
  credentials: true,
  optionsSuccessStatus: 200 // Vital para navegadores e ngrok não travarem no preflight
};

// Aplica o CORS em todas as requisições e força a resposta rápida no preflight (OPTIONS)
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// ✅ SOCKET.IO: Configuração com ngrok-skip-browser-warning
const io = new Server(server, {
  cors: { 
    origin: '*', 
    methods: ['GET', 'POST'], 
    credentials: false,
    allowedHeaders: ['ngrok-skip-browser-warning']
  },
  transports:     ['websocket', 'polling'],
  pingTimeout:    60000,
  pingInterval:   25000
});

let whatsappService  = null;
let sessionModel     = null;
let preferencesModel = null;
let integrationModel = null;

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║    🚀 AFFILIATE HUB PRO - API SERVER 🚀          ║');
console.log('╚════════════════════════════════════════════════════╝\n');

async function startServer() {
  try {
    await connectDB();

    const prodConnection = getProductConnection();
    const waConnection   = getWhatsAppConnection();

    sessionModel     = getWhatsAppSessionModel(waConnection);
    const authModels = getWhatsAppAuthModels(waConnection);
    preferencesModel = getUserPreferencesModel(prodConnection);
    integrationModel = require('./models/Integration')(prodConnection);

    const WhatsAppMultiSessionService = require('./services/WhatsAppMultiSessionService');
    whatsappService = new WhatsAppMultiSessionService(io, sessionModel, authModels);

    // ─────────────────────────────────────────────────────
    // SOCKET.IO EVENTS
    // ─────────────────────────────────────────────────────
    io.on('connection', (socket) => {
      console.log(`🔌 [SOCKET] Cliente conectado: ${socket.id}`);

      const sendSessionsToSocket = async (targetSocket) => {
        try {
          const sessions = await whatsappService.getAllSessions();
          targetSocket.emit('sessions:list',            { sessions });
          targetSocket.emit('whatsapp:sessions-list',   { sessions });
        } catch (error) {
          console.error('❌ [SOCKET] Erro ao enviar sessões:', error.message);
          targetSocket.emit('sessions:list',          { sessions: [] });
          targetSocket.emit('whatsapp:sessions-list', { sessions: [] });
        }
      };

      socket.on('sessions:get', () => {
        console.log(`📋 [SOCKET] sessions:get recebido de ${socket.id}`);
        sendSessionsToSocket(socket);
      });

      socket.on('whatsapp:request-sessions', () => {
        console.log(`📋 [SOCKET] whatsapp:request-sessions recebido de ${socket.id}`);
        sendSessionsToSocket(socket);
      });

      socket.on('preferences:request', async (data) => {
        try {
          const userId = data?.userId || 'default';
          const prefs  = await preferencesModel.getPreferences(userId);
          socket.emit('preferences:response', { preferences: prefs.toPublic() });
        } catch (error) {
          console.error('❌ [SOCKET] Erro ao enviar preferências:', error.message);
        }
      });

      socket.on('disconnect', () => {
        console.log(`❌ [SOCKET] Cliente desconectado: ${socket.id}`);
      });
    });

    // ─────────────────────────────────────────────────────
    // ROTAS
    // ─────────────────────────────────────────────────────
    app.get('/api/health', async (req, res) => {
      const activeSessions = await whatsappService.getActiveSessions();
      res.json({ status: 'OK', whatsapp: { active: activeSessions.length } });
    });

    app.use('/api/products',     require('./routes/products.routes'));
    app.use('/api/scraping',     require('./routes/scraping.routes'));
    app.use('/api/divulgacao',   require('./routes/divulgacao.routes')(whatsappService));
    app.use('/api/sessions',     require('./routes/sessions.routes'));
    app.use('/api/preferences',  require('./routes/preferences.routes')(preferencesModel, io));
    app.use('/api/integrations', require('./routes/integrations')(integrationModel));
    app.use('/api/ml',           require('./routes/ml-oauth.routes'));

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
    for (const [sessionId, session] of whatsappService.sessions) {
      try {
        await session.softDisconnect();
        console.log(`✅ ${sessionId} desconectado.`);
      } catch (e) {
        console.error(`Erro ao desligar ${sessionId}:`, e.message);
      }
    }
  }
  process.exit(0);
});