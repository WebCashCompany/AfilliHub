// backend/routes/scraping.routes.js - SSE COM PRODUTOS EM TEMPO REAL

const express = require('express');
const router = express.Router();
const ScrapingService = require('../scraper/services/ScrapingService');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════════
// GERENCIAMENTO DE SESSÕES E CLIENTES SSE
// ═══════════════════════════════════════════════════════════

const activeScrapingSessions = new Map();
const sseClients = new Map();

// Helper para enviar evento SSE
function sendSSE(sessionId, data) {
  const clients = sseClients.get(sessionId) || [];
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  console.log(`📡 Enviando SSE para ${clients.length} cliente(s):`, {
    progress: data.progress,
    items: data.itemsCollected,
    lastProducts: data.lastProducts?.length || 0
  });
  
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      console.error('❌ Erro ao enviar SSE:', error);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// 🚀 POST /api/scraping/start - INICIAR SCRAPING
// ═══════════════════════════════════════════════════════════

router.post('/start', async (req, res) => {
  try {
    const { marketplaces, minDiscount, maxPrice, filters } = req.body;

    if (!marketplaces || typeof marketplaces !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Configuração de marketplaces inválida'
      });
    }

    const sessionId = uuidv4();
    const enabledMarketplaces = Object.entries(marketplaces)
      .filter(([_, cfg]) => cfg.enabled);
    
    const totalItems = enabledMarketplaces
      .reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);

    // Inicializar sessão
    activeScrapingSessions.set(sessionId, {
      status: 'running',
      progress: 0,
      currentMarketplace: null,
      itemsCollected: 0,
      totalItems,
      startedAt: new Date(),
      lastProducts: []
    });

    // ✅ ENVIAR RESPOSTA IMEDIATA
    res.json({
      success: true,
      data: {
        sessionId,
        message: 'Scraping iniciado com sucesso',
        totalItems,
      }
    });

    // ✅ PROCESSAR SCRAPING EM BACKGROUND
    (async () => {
      const scrapingService = new ScrapingService();
      let totalCollected = 0;
      let processedItems = 0;
      const allLastProducts = [];

      for (const [marketplaceName, mpConfig] of enabledMarketplaces) {
        if (!mpConfig.enabled) continue;

        const session = activeScrapingSessions.get(sessionId);
        if (!session) break;

        session.currentMarketplace = marketplaceName;
        
        sendSSE(sessionId, {
          progress: Math.round((processedItems / totalItems) * 100),
          currentMarketplace: marketplaceName,
          itemsCollected: totalCollected,
          totalItems,
          status: 'running',
          lastProducts: allLastProducts.slice(-3) // Últimos 3 produtos
        });

        try {
          const options = {
            minDiscount: mpConfig.filters?.minDiscount || minDiscount || 30,
            limit: mpConfig.quantity,
            maxPrice: mpConfig.filters?.maxPrice || maxPrice,
            filters: mpConfig.filters || {}
          };

          console.log(`\n📦 Coletando ${marketplaceName}...`);

          // Coletar produtos
          const products = await scrapingService.collectFromMarketplace(
            marketplaceName,
            options
          );

          if (products && products.length > 0) {
            // ✅ ADICIONAR PRODUTOS À LISTA DE "ÚLTIMOS"
            const formattedProducts = products.slice(0, 5).map(p => ({
              name: p.nome || 'Produto',
              image: p.imagem || '',
              price: parsePriceToCents(p.preco_para || 0),
              oldPrice: parsePriceToCents(p.preco_de || 0),
              discount: parseInt(p.desconto) || 0
            }));

            allLastProducts.push(...formattedProducts);
            session.lastProducts = allLastProducts.slice(-5); // Mantém últimos 5

            // Salvar no banco
            const marketplaceCode = getMarketplaceCode(marketplaceName);
            const result = await scrapingService.saveProducts(products, marketplaceCode);
            
            const saved = result.inserted + result.betterOffers;
            totalCollected += saved;
            processedItems += mpConfig.quantity;

            const newProgress = Math.min(Math.round((processedItems / totalItems) * 100), 100);
            
            session.progress = newProgress;
            session.itemsCollected = totalCollected;

            // ✅ ENVIAR UPDATE COM PRODUTOS
            sendSSE(sessionId, {
              progress: newProgress,
              currentMarketplace: marketplaceName,
              itemsCollected: totalCollected,
              totalItems,
              status: 'running',
              lastProducts: session.lastProducts,
              lastMarketplaceResult: {
                marketplace: marketplaceName,
                collected: saved,
                total: products.length,
              }
            });
          } else {
            processedItems += mpConfig.quantity;
          }

          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`❌ Erro no marketplace ${marketplaceName}:`, error);
          processedItems += mpConfig.quantity;
        }
      }

      // ✅ FINALIZAR SESSÃO
      const session = activeScrapingSessions.get(sessionId);
      if (session) {
        session.status = 'completed';
        session.progress = 100;
        session.completedAt = new Date();

        sendSSE(sessionId, {
          progress: 100,
          currentMarketplace: null,
          itemsCollected: totalCollected,
          totalItems,
          status: 'completed',
          lastProducts: session.lastProducts,
          message: `✅ Scraping concluído! ${totalCollected} produtos coletados.`
        });

        // Limpar após 5 minutos
        setTimeout(() => {
          activeScrapingSessions.delete(sessionId);
          sseClients.delete(sessionId);
        }, 5 * 60 * 1000);
      }
    })();

  } catch (error) {
    console.error('❌ Erro ao iniciar scraping:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// 📡 GET /api/scraping/progress/:sessionId - SSE ENDPOINT
// ═══════════════════════════════════════════════════════════

router.get('/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Adicionar cliente
  if (!sseClients.has(sessionId)) {
    sseClients.set(sessionId, []);
  }
  sseClients.get(sessionId).push(res);

  console.log(`📡 Cliente SSE conectado para sessão ${sessionId}`);

  // Enviar estado inicial
  const session = activeScrapingSessions.get(sessionId);
  if (session) {
    res.write(`data: ${JSON.stringify({
      progress: session.progress,
      currentMarketplace: session.currentMarketplace,
      itemsCollected: session.itemsCollected,
      totalItems: session.totalItems,
      status: session.status,
      lastProducts: session.lastProducts || []
    })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({
      progress: 0,
      status: 'idle',
      itemsCollected: 0,
      totalItems: 0
    })}\n\n`);
  }

  // Cleanup ao desconectar
  req.on('close', () => {
    const clients = sseClients.get(sessionId) || [];
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
      console.log(`📡 Cliente SSE desconectado de ${sessionId}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 📊 GET /api/scraping/status - OBTER STATUS
// ═══════════════════════════════════════════════════════════

router.get('/status', (req, res) => {
  const sessions = Array.from(activeScrapingSessions.entries());
  
  if (sessions.length === 0) {
    return res.json({
      success: true,
      data: {
        status: 'idle',
        progress: 0,
        itemsCollected: 0,
        totalItems: 0
      }
    });
  }

  const [sessionId, session] = sessions[sessions.length - 1];
  
  res.json({
    success: true,
    data: {
      sessionId,
      status: session.status,
      progress: session.progress,
      currentMarketplace: session.currentMarketplace,
      itemsCollected: session.itemsCollected,
      totalItems: session.totalItems,
      lastProducts: session.lastProducts || []
    }
  });
});

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function getMarketplaceCode(marketplaceName) {
  const codes = {
    'mercadolivre': 'ML',
    'amazon': 'AMAZON',
    'magalu': 'MAGALU',
    'shopee': 'shopee',
  };
  return codes[marketplaceName] || marketplaceName.toUpperCase();
}

function parsePriceToCents(price) {
  if (typeof price === 'number') return Math.round(price * 100);
  if (typeof price === 'string') {
    const cleaned = price.replace(/[^\d,]/g, '').replace(',', '.');
    return Math.round(parseFloat(cleaned) * 100);
  }
  return 0;
}

module.exports = router;