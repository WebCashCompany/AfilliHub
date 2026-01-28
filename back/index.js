// back/index.js - COM MONGODB E SINCRONIZAÇÃO EM TEMPO REAL

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { connectDB, getProductConnection } = require('./database/mongodb');
const { getWhatsAppSessionModel } = require('./database/models/WhatsAppSession');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Configurar Socket.IO com CORS
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:8080"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middlewares
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8080"
  ],
  credentials: true
}));
app.use(express.json());

// Variáveis globais
let whatsappService = null;
let sessionModel = null;

// Banner inicial
console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║     🚀 AFFILIATE HUB PRO - API SERVER 🚀         ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Inicializar servidor
async function startServer() {
  try {
    // Conectar MongoDB
    await connectDB();
    
    // Obter modelo de sessões
    const connection = getProductConnection();
    sessionModel = getWhatsAppSessionModel(connection);
    console.log('✅ Modelo WhatsAppSession carregado\n');

    // Inicializar WhatsApp Service com Socket.IO e MongoDB
    const WhatsAppMultiSessionService = require('./services/WhatsAppMultiSessionService');
    whatsappService = new WhatsAppMultiSessionService(io, sessionModel);
    console.log('✅ WhatsApp Service inicializado\n');

    // Socket.IO - Gerenciar conexões em tempo real
    io.on('connection', (socket) => {
      console.log(`🔌 Cliente conectado via Socket.IO: ${socket.id}`);

      socket.on('whatsapp:request-sessions', async () => {
        try {
          const sessions = await whatsappService.getAllSessions();
          socket.emit('whatsapp:sessions-list', { sessions });
        } catch (error) {
          console.error('Erro ao enviar lista de sessões:', error);
        }
      });

      socket.on('disconnect', () => {
        console.log(`🔌 Cliente desconectado: ${socket.id}`);
      });
    });

    // Health Check
    app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'OK', 
        message: 'Servidor rodando',
        whatsapp: {
          activeSessions: whatsappService.getActiveSessions().length,
          totalSessions: whatsappService.sessions.size
        },
        socketConnections: io.engine.clientsCount
      });
    });

    // Rotas de Produtos
    const productsRoutes = require('./routes/products.routes');
    app.use('/api/products', productsRoutes);

    // Rotas de Scraping
    const scrapingRoutes = require('./routes/scraping.routes');
    app.use('/api/scraping', scrapingRoutes);

    // Rotas de Divulgação
    console.log('📂 Carregando rotas de divulgação...');
    const divulgacaoRoutes = require('./routes/divulgacao.routes')(whatsappService);
    app.use('/api/divulgacao', divulgacaoRoutes);
    console.log('✅ Rotas /api/divulgacao registradas com sucesso!');

    server.listen(PORT, () => {
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log(`║  ✅ Servidor rodando na porta ${PORT}              ║`);
      console.log('╚════════════════════════════════════════════════════╝\n');
      
      console.log(`📡 API disponível em: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📦 Produtos: http://localhost:${PORT}/api/products`);
      console.log(`🔍 Scraping: http://localhost:${PORT}/api/scraping`);
      console.log(`📱 Divulgação: http://localhost:${PORT}/api/divulgacao`);
      console.log(`🌐 CORS: Habilitado (porta 8080)`);
      console.log(`⚡ Socket.IO: Ativo`);
      console.log(`💾 MongoDB: Conectado\n`);
      
      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║  🤖 WhatsApp Bot: Sistema Multi-Sessão Ativo      ║');
      console.log('║  💡 Conecte múltiplos números simultaneamente     ║');
      console.log('║  🔄 Sincronização em tempo real entre usuários    ║');
      console.log('╚════════════════════════════════════════════════════╝\n');
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Iniciar
startServer();

// Tratamento de encerramento
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Encerrando servidor...');
  
  if (whatsappService) {
    console.log('🔌 Desconectando sessões do WhatsApp...');
    for (const [sessionId, session] of whatsappService.sessions) {
      try {
        await session.disconnect();
      } catch (error) {
        console.error(`Erro ao desconectar ${sessionId}:`, error);
      }
    }
  }
  
  process.exit(0);
});