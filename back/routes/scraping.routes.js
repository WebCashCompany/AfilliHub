// backend/routes/scraping.routes.js
const express = require('express');
const router = express.Router();
const ScrapingService = require('../scraper/services/ScrapingService');
const mlAffiliate = require('../services/MLAffiliateService');
const { getProductConnection } = require('../database/mongodb');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════════
// SUPABASE ADMIN CLIENT — apenas para verificar tokens
// ═══════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE: Autenticação obrigatória
// ═══════════════════════════════════════════════════════════

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token de autenticação ausente.' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Token inválido ou expirado.' });
    }

    req.userId = user.id;
    next();
  } catch (err) {
    console.error('❌ Erro no middleware de auth:', err);
    res.status(500).json({ success: false, error: 'Erro interno de autenticação.' });
  }
}

router.use(requireAuth);

// ═══════════════════════════════════════════════════════════
// ESTADO DAS SESSÕES (em memória, isolado por userId)
// ═══════════════════════════════════════════════════════════

const activeScrapingSessions = new Map();
const sseClients = new Map();

function sendSSE(sessionId, data) {
  const clients = sseClients.get(sessionId) || [];
  if (clients.length === 0) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  console.log(`📡 SSE: ${data.progress}% | ${data.itemsCollected}/${data.totalItems} | ${data.status}`);

  clients.forEach((client) => {
    try { client.write(message); } catch (error) { console.error('❌ Erro SSE:', error.message); }
  });
}

// ═══════════════════════════════════════════════════════════
// POST /api/scraping/start
// ═══════════════════════════════════════════════════════════

router.post('/start', async (req, res) => {
  try {
    const { userId } = req; // ← vem do middleware requireAuth
    const { marketplaces, minDiscount, maxPrice } = req.body;

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║        🚀 RECEBENDO REQUISIÇÃO DE SCRAPING         ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(`👤 userId: ${userId}`);
    console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));

    if (!marketplaces || typeof marketplaces !== 'object') {
      return res.status(400).json({ success: false, error: 'Configuração de marketplaces inválida' });
    }

    const sessionId = uuidv4();
    const enabledMarketplaces = Object.entries(marketplaces).filter(([_, cfg]) => cfg.enabled);
    const totalItems = enabledMarketplaces.reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);

    activeScrapingSessions.set(sessionId, {
      userId, // ← armazena junto com a sessão
      status: 'running',
      progress: 0,
      currentMarketplace: null,
      itemsCollected: 0,
      totalItems,
      startedAt: new Date(),
      lastProducts: [],
      liveProducts: []
    });

    console.log('✅ Sessão criada:', sessionId);

    res.json({
      success: true,
      data: { sessionId, message: 'Scraping iniciado com sucesso', totalItems }
    });

    // ─── EXECUÇÃO ASSÍNCRONA ──────────────────────────────
    (async () => {
      // Carrega credenciais do ML se necessário
      const mlConfigParams = enabledMarketplaces.find(([name]) => name === 'mercadolivre' || name === 'ML');
      if (mlConfigParams) {
        try {
          const conn = getProductConnection();
          const IntegrationModel = require('../models/Integration')(conn);
          const config = await IntegrationModel.findOne({ provider: 'mercadolivre', isActive: true });
          if (config && config.ssid) {
            mlAffiliate.updateCookies(config.ssid, config.csrf);
            mlAffiliate.accessToken = config.accessToken;
            console.log('🍪 Credenciais ML carregadas!');
          }
        } catch (dbErr) {
          console.error('❌ Erro ao carregar sessão ML:', dbErr.message);
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
              if (session.liveProducts.length > 10) session.liveProducts.shift();

              const globalProgress = Math.min(
                Math.round(((processedItems + current) / totalItems) * 100), 100
              );

              session.progress = globalProgress;
              session.itemsCollected = totalCollected + current;

              sendSSE(sessionId, {
                progress: globalProgress,
                currentMarketplace: marketplaceName,
                itemsCollected: totalCollected + current,
                totalItems,
                status: 'collecting',
                liveProducts: session.liveProducts,
                currentProduct: preview
              });
            }
          };

          if (marketplaceName === 'magalu') {
            if (mpConfig.categoryKey) options.categoryKey = mpConfig.categoryKey;
            else if (mpConfig.categoria) options.categoryKey = mpConfig.categoria;
          }

          const products = await scrapingService.collectFromMarketplace(marketplaceName, options);
          const hasProducts = products && Array.isArray(products) && products.length > 0;

          if (hasProducts) {
            session.liveProducts = session.liveProducts.map(p => ({ ...p, status: 'saved' }));

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

            // ⚠️ CRÍTICO: passa userId para saveProducts
            const result = await scrapingService.saveProducts(products, marketplaceCode, userId);

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
              lastMarketplaceResult: { marketplace: marketplaceName, collected: saved, total: products.length }
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

// ═══════════════════════════════════════════════════════════
// GET /api/scraping/progress/:sessionId — SSE
// ═══════════════════════════════════════════════════════════

router.get('/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { userId } = req;

  // Garante que só o dono da sessão recebe o SSE
  const session = activeScrapingSessions.get(sessionId);
  if (session && session.userId !== userId) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
  res.flushHeaders();

  if (!sseClients.has(sessionId)) sseClients.set(sessionId, []);
  sseClients.get(sessionId).push(res);

  const keepAlive = setInterval(() => { res.write(': keepalive\n\n'); }, 25000);

  if (session) res.write(`data: ${JSON.stringify(session)}\n\n`);

  req.on('close', () => {
    clearInterval(keepAlive);
    const clients = sseClients.get(sessionId) || [];
    const index = clients.indexOf(res);
    if (index > -1) clients.splice(index, 1);
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/scraping/status — status da sessão do usuário
// ═══════════════════════════════════════════════════════════

router.get('/status', (req, res) => {
  const { userId } = req;

  // Retorna apenas a sessão ativa do usuário autenticado
  const userSession = Array.from(activeScrapingSessions.entries())
    .filter(([_, session]) => session.userId === userId)
    .pop();

  if (!userSession) {
    return res.json({ success: true, data: { status: 'idle', progress: 0 } });
  }

  const [sessionId, session] = userSession;
  res.json({ success: true, data: { sessionId, ...session } });
});

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getMarketplaceCode(marketplaceName) {
  const codes = { mercadolivre: 'ML', amazon: 'AMAZON', magalu: 'MAGALU', shopee: 'shopee' };
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