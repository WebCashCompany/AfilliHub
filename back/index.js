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

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║     🚀 AFFILIATE HUB PRO - API SERVER 🚀         ║');
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
    console.log('✅ Modelo UserPreferences carregado\n');

    // ═══════════════════════════════════════════════════════════
    // INICIALIZAR WHATSAPP SERVICE (COM PERSISTÊNCIA)
    // ═══════════════════════════════════════════════════════════
    const WhatsAppMultiSessionService = require('./services/WhatsAppMultiSessionService');
    whatsappService = new WhatsAppMultiSessionService(io, sessionModel);
    console.log('✅ WhatsApp Service inicializado (com restauração automática)\n');

    // ═══════════════════════════════════════════════════════════
    // SOCKET.IO EVENTS
    // ═══════════════════════════════════════════════════════════
    io.on('connection', (socket) => {
      console.log(`\n🔌 [SOCKET] Cliente conectado: ${socket.id}`);
      console.log(`👥 [SOCKET] Total de clientes conectados: ${io.engine.clientsCount}`);

      // Enviar lista de sessões ao conectar
      socket.on('whatsapp:request-sessions', async () => {
        try {
          const sessions = await whatsappService.getAllSessions();
          console.log(`📤 [SOCKET] Enviando ${sessions.length} sessões para ${socket.id}`);
          socket.emit('whatsapp:sessions-list', { sessions });
        } catch (error) {
          console.error('❌ [SOCKET] Erro ao enviar lista de sessões:', error);
        }
      });

      // Solicitar preferências
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
        console.log(`👥 [SOCKET] Clientes restantes: ${io.engine.clientsCount}`);
      });
    });

    // ═══════════════════════════════════════════════════════════
    // HEALTH CHECK
    // ═══════════════════════════════════════════════════════════
    app.get('/api/health', async (req, res) => {
      try {
        const activeSessions = await whatsappService.getActiveSessions();
        
        res.json({ 
          status: 'OK', 
          message: 'Servidor rodando',
          timestamp: new Date().toISOString(),
          whatsapp: {
            activeSessions: activeSessions.length,
            totalSessions: whatsappService.sessions.size
          },
          socketConnections: io.engine.clientsCount,
          database: 'Connected'
        });
      } catch (error) {
        res.status(500).json({
          status: 'ERROR',
          error: error.message
        });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // DEBUG ENDPOINT
    // ═══════════════════════════════════════════════════════════
    app.get('/api/test-sessions', async (req, res) => {
      try {
        const fromMemory = Array.from(whatsappService.sessions.values()).map(s => s.getStatus());
        const fromDatabase = await whatsappService.getAllSessions();
        
        res.json({
          success: true,
          memory: { count: fromMemory.length, sessions: fromMemory },
          database: { count: fromDatabase.length, sessions: fromDatabase },
          socketClients: io.engine.clientsCount
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════
    // ROTAS
    // ═══════════════════════════════════════════════════════════
    console.log('📂 Carregando rotas...\n');

    const productsRoutes = require('./routes/products.routes');
    app.use('/api/products', productsRoutes);
    console.log('✅ Rotas /api/products registradas');

    const scrapingRoutes = require('./routes/scraping.routes');
    app.use('/api/scraping', scrapingRoutes);
    console.log('✅ Rotas /api/scraping registradas');

    const divulgacaoRoutes = require('./routes/divulgacao.routes')(whatsappService);
    app.use('/api/divulgacao', divulgacaoRoutes);
    console.log('✅ Rotas /api/divulgacao registradas');

    const sessionsRoutes = require('./routes/sessions.routes');
    app.use('/api/sessions', sessionsRoutes);
    console.log('✅ Rotas /api/sessions registradas');

    const preferencesRoutes = require('./routes/preferences.routes')(preferencesModel, io);
    app.use('/api/preferences', preferencesRoutes);
    console.log('✅ Rotas /api/preferences registradas\n');

    // ═══════════════════════════════════════════════════════════
    // START SERVER
    // ═══════════════════════════════════════════════════════════
    server.listen(PORT, () => {
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║  ✅ Servidor rodando na porta ${PORT}              ║`);
      console.log('╚════════════════════════════════════════════════════╝\n');
      console.log(`📡 API disponível em: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📦 Produtos: http://localhost:${PORT}/api/products`);
      console.log(`🔍 Scraping: http://localhost:${PORT}/api/scraping`);
      console.log(`📱 Divulgação: http://localhost:${PORT}/api/divulgacao`);
      console.log(`🔐 Sessões: http://localhost:${PORT}/api/sessions`);
      console.log(`⚙️  Preferências: http://localhost:${PORT}/api/preferences`);
      console.log(`🌐 CORS: Habilitado (porta 8080)`);
      console.log(`⚡ Socket.IO: Ativo`);
      console.log(`💾 MongoDB: Conectado\n`);
      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║  🤖 WhatsApp Bot: Persistência Total Ativada      ║');
      console.log('║  💡 Sessões nunca expiram até exclusão manual     ║');
      console.log('║  🔄 Sincronização cross-device em tempo real      ║');
      console.log('║  💾 Preferências salvas permanentemente           ║');
      console.log('╚════════════════════════════════════════════════════╝\n');
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();

// ═══════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Encerrando servidor graciosamente...');
  
  if (whatsappService) {
    console.log('🔌 Desconectando sessões do WhatsApp (preservando dados)...');
    
    for (const [sessionId, session] of whatsappService.sessions) {
      try {
        // Apenas desconectar, NÃO deletar
        await session.softDisconnect();
        console.log(`✅ ${sessionId} desconectado (dados preservados)`);
      } catch (error) {
        console.error(`❌ Erro ao desconectar ${sessionId}:`, error.message);
      }
    }
  }
  
  console.log('✅ Servidor encerrado com sucesso');
  process.exit(0);
});