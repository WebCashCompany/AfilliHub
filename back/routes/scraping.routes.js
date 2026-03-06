// backend/routes/scraping.routes.js - VERSÃO PREMIUM (NÍVEL 2)
const express = require('express');
const router = express.Router();
const ScrapingService = require('../scraper/services/ScrapingService');
const mlAffiliate = require('../services/MLAffiliateService');
const { getProductConnection } = require('../database/mongodb');
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
  console.log(`📡 SSE: ${data.progress}% | ${data.itemsCollected}/${data.totalItems} itens | Status: ${data.status}`);
  
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
    const { marketplaces, minDiscount, maxPrice } = req.body;

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║        🚀 RECEBENDO REQUISIÇÃO DE SCRAPING         ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));

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
      lastProducts: [],
      liveProducts: []
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
      // ✅ INJEÇÃO CRÍTICA ANTES DO SCRAPING COMEÇAR
      const mlConfigParams = enabledMarketplaces.find(([name]) => name === 'mercadolivre' || name === 'ML');
      if (mlConfigParams) {
        try {
          const conn = getProductConnection();
          const IntegrationModel = require('../models/Integration')(conn);
          const config = await IntegrationModel.findOne({ provider: 'mercadolivre', isActive: true });
          
          if (config && config.ssid) {
            mlAffiliate.updateCookies(config.ssid, config.csrf);
            mlAffiliate.accessToken = config.accessToken;
            console.log('🍪 [Scraping Route] Credenciais Mercado Livre carregadas em memória!');
          }
        } catch (dbErr) {
          console.error('❌ [Scraping Route] Erro ao carregar sessão do ML do banco:', dbErr.message);
        }
      }

      const scrapingService = new ScrapingService();
      let totalCollected = 0;
      let processedItems = 0;
      const allLastProducts = [];

      for (const [marketplaceName, mpConfig] of enabledMarketplaces) {
        if (!mpConfig.enabled) continue;

        const session = activeScrapingSessions.get(sessionId);
        if (!session) break;

        session.currentMarketplace = marketplaceName;
        
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🔄 PROCESSANDO: ${marketplaceName.toUpperCase()}`);
        console.log(`${'═'.repeat(60)}`);
        
        sendSSE(sessionId, {
          progress: Math.round((processedItems / totalItems) * 100),
          currentMarketplace: marketplaceName,
          itemsCollected: totalCollected,
          totalItems,
          status: 'running',
          lastProducts: allLastProducts.slice(-3),
          liveProducts: session.liveProducts || []
        });

        try {
          const options = {
            minDiscount:  mpConfig.minDiscount  ?? minDiscount ?? 30,
            limit:        mpConfig.quantity,
            maxPrice:     mpConfig.maxPrice      ?? maxPrice ?? null,
            searchTerm:   mpConfig.searchTerm    || null,
            categoria:    mpConfig.categoria     || null,
            categoryKey:  mpConfig.categoryKey   || null,

            onProductCollected: (product, current, total) => {
              const session = activeScrapingSessions.get(sessionId);
              if (!session) return;

              // ✅ CORREÇÃO PREMIUM: Se for uma mensagem de status, envia para o frontend
              if (product._isStatusMessage) {
                sendSSE(sessionId, {
                  progress: session.progress,
                  currentMarketplace: marketplaceName,
                  itemsCollected: session.itemsCollected,
                  totalItems,
                  status: 'collecting',
                  message: product.message,
                  messageType: product.type || 'info'
                });
                return;
              }

              const preview = {
                name: product.nome || 'Produto',
                image: product.imagem || '',
                price: parsePriceToCents(product.preco_para || 0),
                oldPrice: parsePriceToCents(product.preco_de || 0),
                discount: parseInt(product.desconto) || 0,
                status: 'processing'
              };

              session.liveProducts = session.liveProducts || [];
              session.liveProducts.push(preview);
              
              if (session.liveProducts.length > 10) {
                session.liveProducts.shift();
              }

              const itemsInMarketplace = current;
              const globalProgress = Math.min(
                Math.round(((processedItems + itemsInMarketplace) / totalItems) * 100), 
                100
              );

              session.progress = globalProgress;
              session.itemsCollected = totalCollected + itemsInMarketplace;

              sendSSE(sessionId, {
                progress: globalProgress,
                currentMarketplace: marketplaceName,
                itemsCollected: totalCollected + itemsInMarketplace,
                totalItems,
                status: 'collecting',
                liveProducts: session.liveProducts,
                currentProduct: preview
              });
            }
          };

          if (marketplaceName === 'magalu') {
            if (mpConfig.categoryKey) {
              options.categoryKey = mpConfig.categoryKey;
            } else if (mpConfig.categoria) {
              options.categoryKey = mpConfig.categoria;
            }
          }

          const products = await scrapingService.collectFromMarketplace(
            marketplaceName,
            options
          );

          const hasProducts = products && Array.isArray(products) && products.length > 0;
          
          if (hasProducts) {
            session.liveProducts = session.liveProducts.map(p => ({
              ...p,
              status: 'saved'
            }));

            const formattedProducts = products.slice(0, 5).map(p => ({
              name: p.nome || 'Produto',
              image: p.imagem || '',
              price: parsePriceToCents(p.preco_para || 0),
              oldPrice: parsePriceToCents(p.preco_de || 0),
              discount: parseInt(p.desconto) || 0,
              status: 'saved'
            }));

            allLastProducts.push(...formattedProducts);
            session.lastProducts = allLastProducts.slice(-5);

            const marketplaceCode = getMarketplaceCode(marketplaceName);
            const result = await scrapingService.saveProducts(products, marketplaceCode);
            
            const saved = result.inserted + result.betterOffers;
            totalCollected += saved;
            processedItems += mpConfig.quantity;

            const newProgress = Math.min(Math.round((processedItems / totalItems) * 100), 100);
            
            session.progress = newProgress;
            session.itemsCollected = totalCollected;

            sendSSE(sessionId, {
              progress: newProgress,
              currentMarketplace: marketplaceName,
              itemsCollected: totalCollected,
              totalItems,
              status: 'running',
              lastProducts: session.lastProducts,
              liveProducts: session.liveProducts,
              lastMarketplaceResult: {
                marketplace: marketplaceName,
                collected: saved,
                total: products.length,
              }
            });
          } else {
            processedItems += mpConfig.quantity;
            const newProgress = Math.min(Math.round((processedItems / totalItems) * 100), 100);
            session.progress = newProgress;
            sendSSE(sessionId, {
              progress: newProgress,
              currentMarketplace: marketplaceName,
              itemsCollected: totalCollected,
              totalItems,
              status: 'running',
              message: `⚠️ Nenhum produto coletado em ${marketplaceName.toUpperCase()}.`
            });
          }

          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`❌ Erro no marketplace ${marketplaceName}:`, error);
          processedItems += mpConfig.quantity;
        }
      }

      const session = activeScrapingSessions.get(sessionId);
      if (session) {
        session.status = 'completed';
        session.progress = 100;
        sendSSE(sessionId, {
          progress: 100,
          currentMarketplace: null,
          itemsCollected: totalCollected,
          totalItems,
          status: 'completed',
          message: `✅ Scraping concluído! ${totalCollected} produtos salvos.`
        });

        setTimeout(() => {
          activeScrapingSessions.delete(sessionId);
          sseClients.delete(sessionId);
        }, 5 * 60 * 1000);
      }
    })();

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
  res.setHeader('ngrok-skip-browser-warning', 'true');

  res.flushHeaders();

  if (!sseClients.has(sessionId)) sseClients.set(sessionId, []);
  sseClients.get(sessionId).push(res);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 25000);

  const session = activeScrapingSessions.get(sessionId);
  if (session) {
    res.write(`data: ${JSON.stringify(session)}\n\n`);
  }

  req.on('close', () => {
    clearInterval(keepAlive);
    const clients = sseClients.get(sessionId) || [];
    const index = clients.indexOf(res);
    if (index > -1) clients.splice(index, 1);
  });
});

router.get('/status', (req, res) => {
  const sessions = Array.from(activeScrapingSessions.entries());
  if (sessions.length === 0) {
    return res.json({ success: true, data: { status: 'idle', progress: 0 } });
  }
  const [sessionId, session] = sessions[sessions.length - 1];
  res.json({ success: true, data: { sessionId, ...session } });
});

function getMarketplaceCode(marketplaceName) {
  const codes = { 'mercadolivre': 'ML', 'amazon': 'AMAZON', 'magalu': 'MAGALU', 'shopee': 'shopee' };
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
