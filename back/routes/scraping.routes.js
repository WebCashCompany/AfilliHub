// backend/routes/scraping.routes.js

/**
 * ═══════════════════════════════════════════════════════════
 * ROTAS DE SCRAPING COM SSE (Server-Sent Events)
 * ═══════════════════════════════════════════════════════════
 * 
 * ✅ SSE para progresso em tempo real
 * ✅ Gerenciamento de sessões
 * ✅ Endpoint de status
 */

const express = require('express');
const router = express.Router();
const ScrapingService = require('../scraper/services/ScrapingService');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════════
// GERENCIAMENTO DE SESSÕES E CLIENTES SSE
// ═══════════════════════════════════════════════════════════

const activeScrapingSessions = new Map();
const sseClients = new Map(); // sessionId -> array de response objects

// Helper para enviar evento SSE
function sendSSE(sessionId, data) {
  const clients = sseClients.get(sessionId) || [];
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
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

    // Validação básica
    if (!marketplaces || typeof marketplaces !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Configuração de marketplaces inválida'
      });
    }

    // Gerar ID único para esta sessão
    const sessionId = uuidv4();

    // Calcular total de itens
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
    });

    // ✅ ENVIAR RESPOSTA IMEDIATA (não aguardar scraping)
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

      for (const [marketplaceName, mpConfig] of enabledMarketplaces) {
        if (!mpConfig.enabled) continue;

        const session = activeScrapingSessions.get(sessionId);
        if (!session) break; // Sessão cancelada

        // Atualizar marketplace atual
        session.currentMarketplace = marketplaceName;
        sendSSE(sessionId, {
          progress: Math.round((processedItems / totalItems) * 100),
          currentMarketplace: marketplaceName,
          itemsCollected: totalCollected,
          totalItems,
          status: 'running'
        });

        try {
          // Coletar produtos deste marketplace
          const products = await scrapingService.collectFromMarketplace(
            marketplaceName,
            {
              minDiscount: mpConfig.filters?.minDiscount || minDiscount || 30,
              limit: mpConfig.quantity,
              categoria: mpConfig.filters?.categoria,
              maxPrice: mpConfig.filters?.maxPrice || maxPrice,
            }
          );

          // Salvar produtos
          if (products && products.length > 0) {
            const marketplaceCode = getMarketplaceCode(marketplaceName);
            const result = await scrapingService.saveProducts(products, marketplaceCode);
            
            const saved = result.inserted + result.betterOffers;
            totalCollected += saved;
            processedItems += mpConfig.quantity;

            // Atualizar progresso
            const newProgress = Math.min(Math.round((processedItems / totalItems) * 100), 100);
            
            session.progress = newProgress;
            session.itemsCollected = totalCollected;

            sendSSE(sessionId, {
              progress: newProgress,
              currentMarketplace: marketplaceName,
              itemsCollected: totalCollected,
              totalItems,
              status: 'running',
              lastMarketplaceResult: {
                marketplace: marketplaceName,
                collected: saved,
                total: products.length,
              }
            });
          } else {
            processedItems += mpConfig.quantity;
          }

          // Delay entre marketplaces
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
          message: `✅ Scraping concluído! ${totalCollected} produtos coletados.`
        });

        // Manter sessão por 5 minutos antes de limpar
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

  // Headers SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Adicionar cliente à lista
  if (!sseClients.has(sessionId)) {
    sseClients.set(sessionId, []);
  }
  sseClients.get(sessionId).push(res);

  // Enviar estado inicial
  const session = activeScrapingSessions.get(sessionId);
  if (session) {
    res.write(`data: ${JSON.stringify({
      progress: session.progress,
      currentMarketplace: session.currentMarketplace,
      itemsCollected: session.itemsCollected,
      totalItems: session.totalItems,
      status: session.status
    })}\n\n`);
  }

  // Cleanup ao desconectar
  req.on('close', () => {
    const clients = sseClients.get(sessionId) || [];
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 📊 GET /api/scraping/status - OBTER STATUS (fallback polling)
// ═══════════════════════════════════════════════════════════

router.get('/status', (req, res) => {
  // Retorna a sessão mais recente
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

module.exports = router;