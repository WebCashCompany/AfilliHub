// back/index.js - CORS CORRIGIDO PARA PORTA 8080

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { connectDB } = require('./database/mongodb');

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

// Inicializar serviço WhatsApp Multi-Sessão com Socket.IO
const WhatsAppMultiSessionService = require('./services/WhatsAppMultiSessionService');
const whatsappService = new WhatsAppMultiSessionService(io);

// Banner inicial
console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║     🚀 AFFILIATE HUB PRO - API SERVER 🚀         ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Conectar MongoDB
connectDB();

// Socket.IO - Gerenciar conexões em tempo real
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado via Socket.IO: ${socket.id}`);

  socket.emit('sessions:list', {
    sessions: whatsappService.getAllSessions()
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });

  socket.on('sessions:get', () => {
    socket.emit('sessions:list', {
      sessions: whatsappService.getAllSessions()
    });
  });
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Servidor rodando',
    whatsapp: {
      activeSessions: whatsappService.getActiveSessions().length,
      totalSessions: whatsappService.getAllSessions().length
    }
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
try {
  const divulgacaoRoutes = require('./routes/divulgacao.routes')(whatsappService);
  console.log('✅ Arquivo divulgacao.routes carregado');
  
  app.use('/api/divulgacao', divulgacaoRoutes);
  console.log('✅ Rotas /api/divulgacao registradas com sucesso!');
} catch (error) {
  console.error('❌ ERRO ao carregar divulgacao.routes:', error.message);
  console.error(error.stack);
}

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
  console.log(`⚡ Socket.IO: Ativo\n`);
  
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  🤖 WhatsApp Bot: Sistema Multi-Sessão Ativo      ║');
  console.log('║  💡 Conecte múltiplos números simultaneamente     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
});