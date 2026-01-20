require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { connectDB } = require('./database/mongodb');

// ✅ CAMINHO CORRETO
const ScrapingService = require('./scraper/services/ScrapingService');

const app = express();

// ═══════════════════════════════════════════════════════════
// MIDDLEWARES
// ═══════════════════════════════════════════════════════════

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

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

// ✅ ROTA DE SCRAPING
app.post('/api/scraping/start', async (req, res) => {
  try {
    const { marketplaces, minDiscount, maxPrice, filters } = req.body;
    
    console.log('\n📦 Requisição de scraping recebida:', {
      marketplaces: Object.keys(marketplaces).filter(k => marketplaces[k].enabled),
      minDiscount,
      maxPrice,
      filters
    });

    const scrapingService = new ScrapingService();
    const results = { total: 0, byMarketplace: {} };

    // Processar cada marketplace
    for (const [mpName, mpConfig] of Object.entries(marketplaces)) {
      if (!mpConfig.enabled) continue;

      console.log(`\n🔄 Processando ${mpName}...`);

      const products = await scrapingService.collectFromMarketplace(mpName, {
        minDiscount,
        maxPrice,
        limit: mpConfig.quantity,
        categoria: filters?.categoria || null,
        palavraChave: filters?.palavraChave || null,
        frete_gratis: filters?.frete_gratis || false
      });

      // Determinar código do marketplace
      let mpCode = 'ML';
      if (mpName === 'shopee') mpCode = 'shopee';
      else if (mpName === 'magalu') mpCode = 'magalu';
      else if (mpName === 'amazon') mpCode = 'amazon';

      const saved = await scrapingService.saveProducts(products, mpCode);

      results.byMarketplace[mpName] = {
        collected: products.length,
        saved: saved.totalSaved || saved.inserted
      };
      
      results.total += (saved.totalSaved || saved.inserted);
    }

    console.log('\n✅ Scraping finalizado:', results);

    res.json({ 
      success: true, 
      data: results 
    });

  } catch (error) {
    console.error('❌ Erro no scraping:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════

(async () => {
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║     🚀 AFFILIATE HUB PRO - API SERVER 🚀         ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Conectar MongoDB
    console.log('🔌 Conectando ao MongoDB...');
    await connectDB();
    console.log('✅ MongoDB conectado!\n');

    // Iniciar servidor
    const PORT = process.env.PORT || 3001;
    
    app.listen(PORT, () => {
      console.log('╔════════════════════════════════════════════════════╗');
      console.log(`║  ✅ Servidor rodando na porta ${PORT}              ║`);
      console.log('╚════════════════════════════════════════════════════╝');
      console.log(`\n📡 API disponível em: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health\n`);
    });

  } catch (error) {
    console.error('\n❌ ERRO ao iniciar servidor:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();