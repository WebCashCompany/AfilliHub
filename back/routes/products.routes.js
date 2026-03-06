/**
 * ═══════════════════════════════════════════════════════════════════════
 * PRODUCTS ROUTES — COM AUTENTICAÇÃO E ISOLAMENTO POR USUÁRIO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Toda rota exige JWT válido do Supabase.
 * Todas as queries incluem { userId } — um usuário NUNCA vê/altera
 * dados de outro, mesmo que tenha o ID do produto.
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { getProductConnection } = require('../database/mongodb');
const { getProductModel } = require('../database/models/Products');

// ═══════════════════════════════════════════════════════════
// SUPABASE ADMIN CLIENT (apenas para verificar tokens)
// ═══════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role — nunca expor no frontend
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

    // Valida o JWT com o Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Token inválido ou expirado.' });
    }

    // Disponibiliza o userId em todas as rotas
    req.userId = user.id;
    next();
  } catch (err) {
    console.error('❌ Erro no middleware de auth:', err);
    res.status(500).json({ success: false, error: 'Erro interno de autenticação.' });
  }
}

// Aplica autenticação em TODAS as rotas deste router
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE: Transformação de Imagens WEBP → JPG
// ═══════════════════════════════════════════════════════════

function transformImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:image')) return url;
  if (url.match(/\.(jpg|jpeg|png)(\?|$)/i)) return url;

  if (url.includes('mlstatic.com') || url.includes('mluploads.com')) {
    const baseUrl = url.split('?')[0];
    return (baseUrl.includes('.webp') ? baseUrl.replace(/\.webp/gi, '.jpg') : baseUrl) + '?quality=75';
  }
  if (url.includes('magazineluiza.com')) {
    const baseUrl = url.split('?')[0];
    return baseUrl.includes('.webp') ? baseUrl.replace(/\.webp/gi, '.jpg') : baseUrl;
  }

  const baseUrl = url.split('?')[0];
  return baseUrl.includes('.webp') ? baseUrl.replace(/\.webp/gi, '.jpg') : url;
}

function transformProductImages(products) {
  if (!Array.isArray(products)) return products;
  return products.map(p => p?.imagem ? { ...p, imagem: transformImageUrl(p.imagem) } : p);
}

function imageTransformerMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    if (data && typeof data === 'object') {
      if (Array.isArray(data)) return originalJson(transformProductImages(data));
      if (data.data?.items && Array.isArray(data.data.items))
        return originalJson({ ...data, data: { ...data.data, items: transformProductImages(data.data.items) } });
      if (data.data && Array.isArray(data.data))
        return originalJson({ ...data, data: transformProductImages(data.data) });
      if (data.data?.imagem)
        return originalJson({ ...data, data: { ...data.data, imagem: transformImageUrl(data.data.imagem) } });
    }
    return originalJson(data);
  };
  next();
}

router.use(imageTransformerMiddleware);

// ═══════════════════════════════════════════════════════════
// GET /api/products — Listar produtos DO usuário autenticado
// ═══════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const { userId } = req;
    const { marketplace, limit, skip } = req.query;

    console.log(`\n📦 GET /api/products — userId: ${userId}`);

    const conn = getProductConnection();
    const marketplaces = marketplace ? [marketplace] : ['ML', 'shopee', 'amazon', 'magalu'];
    let allProducts = [];

    for (const mp of marketplaces) {
      try {
        const Model = getProductModel(mp, conn);

        // ⚠️ SEMPRE filtra por userId
        const query = Model.find({ userId, isActive: true }).sort({ createdAt: -1 });
        if (limit) query.limit(parseInt(limit));
        if (skip)  query.skip(parseInt(skip));

        const items = await query.lean();
        console.log(`   ✅ ${mp}: ${items.length} produtos`);

        allProducts = [...allProducts, ...items.map(item => ({ ...item, marketplace: mp, marketplaceOrigin: mp }))];
      } catch (mpError) {
        console.warn(`   ⚠️ Erro em ${mp}:`, mpError.message);
      }
    }

    console.log(`   📊 Total: ${allProducts.length} produtos do usuário ${userId}\n`);

    res.json({ success: true, data: { items: allProducts, total: allProducts.length } });
  } catch (error) {
    console.error('❌ Erro ao listar produtos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/products/:id — Buscar produto por ID (do usuário)
// ═══════════════════════════════════════════════════════════

router.get('/:id', async (req, res) => {
  try {
    const { userId } = req;
    const { id } = req.params;
    const conn = getProductConnection();

    for (const mp of ['ML', 'shopee', 'amazon', 'magalu']) {
      const Model = getProductModel(mp, conn);
      // Garante que o produto pertence ao usuário autenticado
      const product = await Model.findOne({ _id: id, userId }).lean();
      if (product) return res.json({ success: true, data: { ...product, marketplace: mp } });
    }

    res.status(404).json({ success: false, error: 'Produto não encontrado.' });
  } catch (error) {
    console.error('❌ Erro ao buscar produto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/products/:id — Deletar produto único (do usuário)
// ═══════════════════════════════════════════════════════════

router.delete('/:id', async (req, res) => {
  try {
    const { userId } = req;
    const { id } = req.params;
    console.log(`\n🗑️ DELETE /api/products/${id} — userId: ${userId}`);

    const conn = getProductConnection();

    for (const mp of ['ML', 'shopee', 'amazon', 'magalu']) {
      const Model = getProductModel(mp, conn);
      // findOneAndDelete com userId garante que só deleta o próprio produto
      const result = await Model.findOneAndDelete({ _id: id, userId });
      if (result) {
        console.log(`   ✅ Produto deletado do ${mp}\n`);
        return res.json({ success: true, message: 'Produto deletado com sucesso.', data: { id, marketplace: mp } });
      }
    }

    res.status(404).json({ success: false, error: 'Produto não encontrado.' });
  } catch (error) {
    console.error('❌ Erro ao deletar produto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/products/cleanup/all — Deletar TODOS os produtos do usuário
// ═══════════════════════════════════════════════════════════

router.delete('/cleanup/all', async (req, res) => {
  try {
    const { userId } = req;
    console.log(`\n🗑️ DELETE ALL — userId: ${userId}`);

    const conn = getProductConnection();
    let totalDeleted = 0;
    const deletedByMarketplace = {};

    for (const mp of ['ML', 'shopee', 'amazon', 'magalu']) {
      const Model = getProductModel(mp, conn);
      const result = await Model.deleteMany({ userId }); // só os do usuário
      deletedByMarketplace[mp] = result.deletedCount;
      totalDeleted += result.deletedCount;
      console.log(`   ✅ ${mp}: ${result.deletedCount} deletados`);
    }

    console.log(`   📊 Total: ${totalDeleted} produtos deletados do usuário ${userId}\n`);
    res.json({ success: true, data: { deleted: totalDeleted, byMarketplace: deletedByMarketplace } });
  } catch (error) {
    console.error('❌ Erro ao deletar todos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/products/marketplace/:marketplace
// ═══════════════════════════════════════════════════════════

router.delete('/marketplace/:marketplace', async (req, res) => {
  try {
    const { userId } = req;
    const { marketplace } = req.params;
    console.log(`\n🗑️ DELETE MARKETPLACE: ${marketplace} — userId: ${userId}`);

    const conn = getProductConnection();
    const Model = getProductModel(marketplace, conn);
    const result = await Model.deleteMany({ userId });

    console.log(`   ✅ ${result.deletedCount} produtos deletados do ${marketplace}\n`);
    res.json({ success: true, data: { deleted: result.deletedCount, marketplace } });
  } catch (error) {
    console.error('❌ Erro ao deletar marketplace:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/products/cleanup/old — Deletar produtos antigos do usuário
// ═══════════════════════════════════════════════════════════

router.post('/cleanup/old', async (req, res) => {
  try {
    const { userId } = req;
    const { days = 30 } = req.body;
    console.log(`\n🗑️ CLEANUP OLD — ${days} dias — userId: ${userId}`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const conn = getProductConnection();
    let totalDeleted = 0;
    const deletedByMarketplace = {};

    for (const mp of ['ML', 'shopee', 'amazon', 'magalu']) {
      const Model = getProductModel(mp, conn);
      const result = await Model.deleteMany({ userId, createdAt: { $lt: cutoffDate } });
      if (result.deletedCount > 0) {
        deletedByMarketplace[mp] = result.deletedCount;
        totalDeleted += result.deletedCount;
        console.log(`   ✅ ${mp}: ${result.deletedCount} deletados`);
      }
    }

    console.log(`   📊 Total: ${totalDeleted} produtos antigos deletados\n`);
    res.json({ success: true, data: { deleted: totalDeleted, byMarketplace: deletedByMarketplace, cutoffDate: cutoffDate.toISOString() } });
  } catch (error) {
    console.error('❌ Erro ao deletar antigos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/products/bulk-delete — Exclusão em massa (do usuário)
// ═══════════════════════════════════════════════════════════

router.post('/bulk-delete', async (req, res) => {
  try {
    const { userId } = req;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Array de IDs é obrigatório.' });
    }

    console.log(`\n🗑️ BULK DELETE — ${ids.length} produtos — userId: ${userId}`);

    const conn = getProductConnection();
    let totalDeleted = 0;
    const deletedByMarketplace = {};

    for (const mp of ['ML', 'shopee', 'amazon', 'magalu']) {
      const Model = getProductModel(mp, conn);
      // userId garante que só deleta os próprios produtos
      const result = await Model.deleteMany({ _id: { $in: ids }, userId });
      if (result.deletedCount > 0) {
        deletedByMarketplace[mp] = result.deletedCount;
        totalDeleted += result.deletedCount;
        console.log(`   ✅ ${mp}: ${result.deletedCount} deletados`);
      }
    }

    console.log(`   📊 Total: ${totalDeleted} produtos deletados\n`);
    res.json({ success: true, data: { deleted: totalDeleted, byMarketplace: deletedByMarketplace } });
  } catch (error) {
    console.error('❌ Erro no bulk delete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;