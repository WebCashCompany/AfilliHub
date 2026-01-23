// back/index.js - COMPLETO COM LOGS DE DEBUG

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./database/mongodb');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Importe o serviço MAS NÃO INICIALIZE
const whatsappService = require('./services/WhatsAppService');

// Banner inicial
console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║     🚀 AFFILIATE HUB PRO - API SERVER 🚀         ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Conectar MongoDB
connectDB();

// ═══════════════════════════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════════════════════════

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Servidor rodando',
    whatsappBot: whatsappService.getStatus()
  });
});

// Rotas de Produtos
const productsRoutes = require('./routes/products.routes');
app.use('/api/products', productsRoutes);

// Rotas de Scraping
const scrapingRoutes = require('./routes/scraping.routes');
app.use('/api/scraping', scrapingRoutes);

// ✅ ROTAS DE DIVULGAÇÃO (WHATSAPP BOT) - COM DEBUG
console.log('📂 Carregando rotas de divulgação...');
try {
  const divulgacaoRoutes = require('./routes/divulgacao.routes');
  console.log('✅ Arquivo divulgacao.routes carregado');
  
  app.use('/api/divulgacao', divulgacaoRoutes);
  console.log('✅ Rotas /api/divulgacao registradas com sucesso!');
} catch (error) {
  console.error('❌ ERRO ao carregar divulgacao.routes:', error.message);
  console.error(error.stack);
}

// ═══════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log(`║  ✅ Servidor rodando na porta ${PORT}              ║`);
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  console.log(`📡 API disponível em: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📦 Produtos: http://localhost:${PORT}/api/products`);
  console.log(`🔍 Scraping: http://localhost:${PORT}/api/scraping`);
  console.log(`📱 Divulgação: http://localhost:${PORT}/api/divulgacao`);
  console.log(`🌐 CORS: Habilitado\n`);
  
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  🤖 WhatsApp Bot: Aguardando conexão manual       ║');
  console.log('║  💡 Use o botão "Conectar Bot" no frontend        ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
});