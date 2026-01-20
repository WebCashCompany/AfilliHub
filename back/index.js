require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { connectDB } = require('./database/mongodb');

const app = express();

// ═══════════════════════════════════════════════════════════
// MIDDLEWARES
// ═══════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ═══════════════════════════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Online',
    timestamp: new Date().toISOString()
  });
});

// ──────────────────────────────────────────────────────────
// 🔥 ROTAS DE PRODUTOS (AGORA EXISTEM)
// ──────────────────────────────────────────────────────────
const productRoutes = require('./routes/products.routes');
app.use('/api/products', productRoutes);

// ──────────────────────────────────────────────────────────
// SCRAPING (SSE)
// ──────────────────────────────────────────────────────────
const scrapingRoutes = require('./routes/scraping.routes');
app.use('/api/scraping', scrapingRoutes);

// ═══════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════

(async () => {
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║     🚀 AFFILIATE HUB PRO - API SERVER 🚀         ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('🔌 Conectando ao MongoDB...');
    await connectDB();
    console.log('✅ MongoDB conectado!\n');

    const PORT = process.env.PORT || 3001;

    app.listen(PORT, () => {
      console.log('╔════════════════════════════════════════════════════╗');
      console.log(`║  ✅ Servidor rodando na porta ${PORT}              ║`);
      console.log('╚════════════════════════════════════════════════════╝');
      console.log(`\n📡 API disponível em: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📦 Produtos: http://localhost:${PORT}/api/products`);
      console.log(`🚀 Scraping SSE: http://localhost:${PORT}/api/scraping/start`);
      console.log(`🌐 CORS: Habilitado para todas as origens\n`);
    });

  } catch (error) {
    console.error('\n❌ ERRO ao iniciar servidor:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
