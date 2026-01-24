// backend/routes/scraping.routes.js - FIX DEFINITIVO

const express = require('express');
const router = express.Router();
const ScrapingService = require('../scraper/services/ScrapingService');
const { v4: uuidv4 } = require('uuid');

const activeScrapingSessions = new Map();
const sseClients = new Map();

function sendSSE(sessionId, data) {
  const clients = sseClients.get(sessionId) || [];
  
  if (clients.length === 0) {
    console.log(`⚠️ Nenhum cliente SSE conectado`);
    return;
  }
  
  const message = `data: ${JSON.stringify(data)}\n\n`;
  console.log(`📡 SSE: ${data.progress}% | ${data.itemsCollected}/${data.totalItems} itens`);
  
  clients.forEach((client) => {
    try {
      client.write(message);
    } catch (error) {
      console.error(`❌ Erro SSE:`, error.message);
    }
  });
}

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

    activeScrapingSessions.set(sessionId, {
      status: 'running',
      progress: 0,
      currentMarketplace: null,
      itemsCollected: 0,
      totalItems,
      startedAt: new Date(),
      lastProducts: []
    });

    console.log('✅ Scraping iniciado - Session ID:', sessionId);
    
    res.json({
      success: true,
      data: {
        sessionId,
        message: 'Scraping iniciado com sucesso',
        totalItems,
      }
    });

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
          lastProducts: allLastProducts.slice(-3)
        });

        try {
          const options = {
            minDiscount: mpConfig.filters?.minDiscount || minDiscount || 30,
            limit: mpConfig.quantity,
            maxPrice: mpConfig.filters?.maxPrice || maxPrice,
            filters: mpConfig.filters || {}
          };

          console.log(`\n📦 Iniciando coleta: ${marketplaceName}`);

          const products = await scrapingService.collectFromMarketplace(
            marketplaceName,
            options
          );

          console.log(`\n✅ Coleta finalizada!`);
          console.log(`   Produtos retornados: ${products ? products.length : 0}`);
          console.log(`   Tipo: ${typeof products}`);
          console.log(`   É array? ${Array.isArray(products)}`);

          // ✅ VALIDAÇÃO CRÍTICA
          const hasProducts = products && Array.isArray(products) && products.length > 0;
          
          console.log(`   Tem produtos válidos? ${hasProducts}`);

          if (hasProducts) {
            console.log(`\n🎯 ENTRANDO NO PROCESSAMENTO!`);
            
            const formattedProducts = products.slice(0, 5).map(p => ({
              name: p.nome || 'Produto',
              image: p.imagem || '',
              price: parsePriceToCents(p.preco_para || 0),
              oldPrice: parsePriceToCents(p.preco_de || 0),
              discount: parseInt(p.desconto) || 0
            }));

            allLastProducts.push(...formattedProducts);
            session.lastProducts = allLastProducts.slice(-5);

            console.log(`💾 Salvando ${products.length} produtos...`);

            const marketplaceCode = getMarketplaceCode(marketplaceName);
            const result = await scrapingService.saveProducts(products, marketplaceCode);
            
            const saved = result.inserted + result.betterOffers;
            totalCollected += saved;
            processedItems += mpConfig.quantity;

            const newProgress = Math.min(Math.round((processedItems / totalItems) * 100), 100);
            
            // ✅ ATUALIZAR SESSÃO
            session.progress = newProgress;
            session.itemsCollected = totalCollected;

            console.log(`\n🔄 SESSION ATUALIZADA!`);
            console.log(`   Progress: ${session.progress}%`);
            console.log(`   Items: ${session.itemsCollected}/${session.totalItems}`);
            console.log(`   Last Products: ${session.lastProducts.length}`);

            console.log(`\n📤 Enviando SSE...`);

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

            console.log(`✅ SSE Enviado!\n`);
          } else {
            console.log(`\n⚠️ NÃO TEM PRODUTOS VÁLIDOS, pulando...`);
            processedItems += mpConfig.quantity;
            
            // ✅ ATUALIZAR PROGRESSO MESMO SEM PRODUTOS
            const newProgress = Math.min(Math.round((processedItems / totalItems) * 100), 100);
            session.progress = newProgress;
            
            sendSSE(sessionId, {
              progress: newProgress,
              currentMarketplace: marketplaceName,
              itemsCollected: totalCollected,
              totalItems,
              status: 'running',
              lastProducts: session.lastProducts
            });
          }

          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`❌ Erro no marketplace ${marketplaceName}:`, error);
          processedItems += mpConfig.quantity;
        }
      }

      // ✅ FINALIZAR
      const session = activeScrapingSessions.get(sessionId);
      if (session) {
        session.status = 'completed';
        session.progress = 100;
        session.completedAt = new Date();

        console.log(`\n🎉 FINALIZANDO: ${totalCollected} produtos coletados`);

        sendSSE(sessionId, {
          progress: 100,
          currentMarketplace: null,
          itemsCollected: totalCollected,
          totalItems,
          status: 'completed',
          lastProducts: session.lastProducts,
          message: `✅ Scraping concluído! ${totalCollected} produtos coletados.`
        });

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

router.get('/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  console.log('📡 SSE conectando:', sessionId.substring(0, 8));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders();

  if (!sseClients.has(sessionId)) {
    sseClients.set(sessionId, []);
  }
  sseClients.get(sessionId).push(res);

  console.log(`✅ Cliente conectado (total: ${sseClients.get(sessionId).length})`);

  const session = activeScrapingSessions.get(sessionId);
  
  if (session) {
    const initialData = {
      progress: session.progress,
      currentMarketplace: session.currentMarketplace,
      itemsCollected: session.itemsCollected,
      totalItems: session.totalItems,
      status: session.status,
      lastProducts: session.lastProducts || []
    };
    
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({
      progress: 0,
      status: 'idle',
      itemsCollected: 0,
      totalItems: 0
    })}\n\n`);
  }

  req.on('close', () => {
    const clients = sseClients.get(sessionId) || [];
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
  });
});

router.get('/status', (req, res) => {
  const sessions = Array.from(activeScrapingSessions.entries());
  
  if (sessions.length === 0) {
    return res.json({
      success: true,
      data: {
        status: 'idle',
        progress: 0,
        itemsCollected: 0,
        totalItems: 0,
        currentMarketplace: null,
        lastProducts: []
      }
    });
  }

  const runningSessions = sessions.filter(([_, s]) => s.status === 'running');
  const targetSession = runningSessions.length > 0 
    ? runningSessions[runningSessions.length - 1]
    : sessions[sessions.length - 1];
  
  const [sessionId, session] = targetSession;
  
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