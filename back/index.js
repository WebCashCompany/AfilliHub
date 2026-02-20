require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const axios = require('axios');
const { Server } = require('socket.io');
const { connectDB, getProductConnection } = require('./database/mongodb');
const { getWhatsAppSessionModel } = require('./database/models/WhatsAppSession');
const { getUserPreferencesModel } = require('./database/models/UserPreferences');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// ═══════════════════════════════════════════════════════════
// CORS - Libera todas as origens
// ═══════════════════════════════════════════════════════════
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

app.options('*', cors()); // Responde preflight em todas as rotas
app.use(express.json());

let whatsappService = null;
let sessionModel = null;
let preferencesModel = null;
let integrationModel = null;

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║    🚀 AFFILIATE HUB PRO - API SERVER 🚀          ║');
console.log('╚════════════════════════════════════════════════════╝\n');

async function startServer() {
  try {
    await connectDB();
    const connection = getProductConnection();

    sessionModel = getWhatsAppSessionModel(connection);
    console.log('✅ Modelo WhatsAppSession carregado');

    preferencesModel = getUserPreferencesModel(connection);
    console.log('✅ Modelo UserPreferences carregado');

    integrationModel = require('./models/Integration')(connection);
    console.log('✅ Modelo Integration carregado\n');

    const WhatsAppMultiSessionService = require('./services/WhatsAppMultiSessionService');
    whatsappService = new WhatsAppMultiSessionService(io, sessionModel);
    console.log('✅ WhatsApp Service inicializado\n');

    // ═══════════════════════════════════════════════════════════
    // SOCKET.IO EVENTS
    // ═══════════════════════════════════════════════════════════
    io.on('connection', (socket) => {
      console.log(`\n🔌 [SOCKET] Cliente conectado: ${socket.id}`);

      socket.on('whatsapp:request-sessions', async () => {
        try {
          const sessions = await whatsappService.getAllSessions();
          socket.emit('whatsapp:sessions-list', { sessions });
        } catch (error) {
          console.error('❌ [SOCKET] Erro ao enviar sessões:', error);
        }
      });

      socket.on('preferences:request', async (data) => {
        try {
          const userId = data?.userId || 'default';
          const prefs = await preferencesModel.getPreferences(userId);
          socket.emit('preferences:response', { preferences: prefs.toPublic() });
        } catch (error) {
          console.error('❌ [SOCKET] Erro ao enviar preferências:', error);
        }
      });

      socket.on('disconnect', () => {
        console.log(`❌ [SOCKET] Cliente desconectado: ${socket.id}`);
      });
    });

    // ═══════════════════════════════════════════════════════════
    // ROTAS DA API
    // ═══════════════════════════════════════════════════════════
    console.log('📂 Carregando rotas...\n');

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

    console.log('✅ Todas as rotas registradas com sucesso');

    // ═══════════════════════════════════════════════════════════
    // INICIALIZAÇÃO DO SERVIDOR
    // ═══════════════════════════════════════════════════════════
    server.listen(PORT, () => {
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║   ✅ Servidor a rodar na porta ${PORT}              ║`);
      console.log('╚════════════════════════════════════════════════════╝\n');
    });

  } catch (error) {
    console.error('❌ Erro crítico ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();

// ═══════════════════════════════════════════════════════════
// ENCERRAMENTO GRACIOSO
// ═══════════════════════════════════════════════════════════
process.on('SIGINT', async () => {
  console.log('\n\n🛑 A encerrar servidor...');
  if (whatsappService) {
    for (const [sessionId, session] of whatsappService.sessions) {
      try {
        await session.softDisconnect();
        console.log(`✅ ${sessionId} desconectado.`);
      } catch (e) {
        console.error(`Erro ao desligar ${sessionId}`);
      }
    }
  }
  process.exit(0);
});