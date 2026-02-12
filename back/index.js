require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { connectDB, getProductConnection } = require('./database/mongodb');
const { getWhatsAppSessionModel } = require('./database/models/WhatsAppSession');
const { getUserPreferencesModel } = require('./database/models/UserPreferences');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174", "http://localhost:8080"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174", "http://localhost:8080"],
  credentials: true
}));
app.use(express.json());

let whatsappService = null;
let sessionModel = null;
let preferencesModel = null;
let integrationModel = null; // Modelo para Magalu/Outros

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║    🚀 AFFILIATE HUB PRO - API SERVER 🚀          ║');
console.log('╚════════════════════════════════════════════════════╝\n');

async function startServer() {
  try {
    // ═══════════════════════════════════════════════════════════
    // CONECTAR MONGODB
    // ═══════════════════════════════════════════════════════════
    await connectDB();
    const connection = getProductConnection();
    
    sessionModel = getWhatsAppSessionModel(connection);
    console.log('✅ Modelo WhatsAppSession carregado');
    
    preferencesModel = getUserPreferencesModel(connection);
    console.log('✅ Modelo UserPreferences carregado');

    // Inicializa o modelo de Integrações (Magalu) com a conexão ativa
    integrationModel = require('./models/Integration')(connection);
    console.log('✅ Modelo Integration carregado\n');

    // ═══════════════════════════════════════════════════════════
    // INICIALIZAR WHATSAPP SERVICE
    // ═══════════════════════════════════════════════════════════
    const WhatsAppMultiSessionService = require('./services/WhatsAppMultiSessionService');
    whatsappService = new WhatsAppMultiSessionService(io, sessionModel);
    console.log('✅ WhatsApp Service inicializado (com restauração automática)\n');

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

    // Rota de Health Check
    app.get('/api/health', async (req, res) => {
      const activeSessions = await whatsappService.getActiveSessions();
      res.json({ status: 'OK', whatsapp: { active: activeSessions.length } });
    });

    // Rotas de Produtos e Scraping
    app.use('/api/products', require('./routes/products.routes'));
    app.use('/api/scraping', require('./routes/scraping.routes'));
    
    // Rota de Divulgação (precisa do whatsappService)
    app.use('/api/divulgacao', require('./routes/divulgacao.routes')(whatsappService));
    
    // Sessões e Preferências
    app.use('/api/sessions', require('./routes/sessions.routes'));
    app.use('/api/preferences', require('./routes/preferences.routes')(preferencesModel, io));

    // 🆕 Nova Rota de Integrações (Injetando o modelo Magalu)
    app.use('/api/integrations', require('./routes/integrations')(integrationModel));

    console.log('✅ Todas as rotas registadas com sucesso');

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
// ENCERRAMENTO GRACIOSO (Graceful Shutdown)
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