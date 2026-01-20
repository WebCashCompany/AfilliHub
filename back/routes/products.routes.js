// ═══════════════════════════════════════════════════════════
// routes/products.routes.js - COMPLETO COM EXCLUSÕES
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { getProductConnection } = require('../database/mongodb');
const { getProductModel } = require('../database/models/Products');

// ═══════════════════════════════════════════════════════════
// GET /api/products - LISTAR TODOS OS PRODUTOS
// ═══════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    console.log('\n📦 GET /api/products - Listando produtos...');
    
    const { marketplace, limit, skip } = req.query;
    
    const conn = getProductConnection();
    const marketplaces = marketplace ? [marketplace] : ['ML', 'shopee', 'amazon', 'magalu'];
    let allProducts = [];

    for (const mp of marketplaces) {
      try {
        const Model = getProductModel(mp, conn);
        
        const query = Model.find({ isActive: true })
          .sort({ createdAt: -1 });
        
        if (limit) query.limit(parseInt(limit));
        if (skip) query.skip(parseInt(skip));
        
        const items = await query.lean();
        
        console.log(`   ✅ ${mp}: ${items.length} produtos`);
        
        const itemsWithMarketplace = items.map(item => ({
          ...item,
          marketplace: mp,
          marketplaceOrigin: mp
        }));
        
        allProducts = [...allProducts, ...itemsWithMarketplace];
      } catch (mpError) {
        console.warn(`   ⚠️ Erro em ${mp}:`, mpError.message);
      }
    }

    console.log(`   📊 Total: ${allProducts.length} produtos\n`);

    res.json({
      success: true,
      data: {
        items: allProducts,
        total: allProducts.length
      }
    });

  } catch (error) {
    console.error('❌ Erro ao listar produtos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/products/cleanup/all - DELETAR TODOS
// ═══════════════════════════════════════════════════════════

router.delete('/cleanup/all', async (req, res) => {
  try {
    console.log('\n🗑️ DELETE ALL - Deletando todos os produtos...');
    
    const conn = getProductConnection();
    const marketplaces = ['ML', 'shopee', 'amazon', 'magalu'];
    let totalDeleted = 0;
    const deletedByMarketplace = {};

    for (const mp of marketplaces) {
      const Model = getProductModel(mp, conn);
      const result = await Model.deleteMany({});
      
      deletedByMarketplace[mp] = result.deletedCount;
      totalDeleted += result.deletedCount;
      console.log(`   ✅ ${mp}: ${result.deletedCount} deletados`);
    }

    console.log(`   📊 Total: ${totalDeleted} produtos deletados\n`);

    res.json({
      success: true,
      data: {
        deleted: totalDeleted,
        byMarketplace: deletedByMarketplace
      }
    });

  } catch (error) {
    console.error('❌ Erro ao deletar todos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/products/marketplace/:marketplace - DELETAR POR MARKETPLACE
// ═══════════════════════════════════════════════════════════

router.delete('/marketplace/:marketplace', async (req, res) => {
  try {
    const { marketplace } = req.params;
    console.log(`\n🗑️ DELETE MARKETPLACE: ${marketplace}`);
    
    const conn = getProductConnection();
    const Model = getProductModel(marketplace, conn);
    
    const result = await Model.deleteMany({});
    
    console.log(`   ✅ ${result.deletedCount} produtos deletados do ${marketplace}\n`);

    res.json({
      success: true,
      data: {
        deleted: result.deletedCount,
        marketplace: marketplace
      }
    });

  } catch (error) {
    console.error('❌ Erro ao deletar marketplace:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/products/cleanup/old - DELETAR PRODUTOS ANTIGOS
// ═══════════════════════════════════════════════════════════

router.post('/cleanup/old', async (req, res) => {
  try {
    const { days = 30 } = req.body;
    
    console.log(`\n🗑️ CLEANUP OLD - Produtos > ${days} dias`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const conn = getProductConnection();
    const marketplaces = ['ML', 'shopee', 'amazon', 'magalu'];
    let totalDeleted = 0;
    const deletedByMarketplace = {};

    for (const mp of marketplaces) {
      const Model = getProductModel(mp, conn);
      const result = await Model.deleteMany({
        createdAt: { $lt: cutoffDate }
      });
      
      if (result.deletedCount > 0) {
        deletedByMarketplace[mp] = result.deletedCount;
        totalDeleted += result.deletedCount;
        console.log(`   ✅ ${mp}: ${result.deletedCount} deletados`);
      }
    }

    console.log(`   📊 Total: ${totalDeleted} produtos antigos deletados\n`);

    res.json({
      success: true,
      data: {
        deleted: totalDeleted,
        byMarketplace: deletedByMarketplace,
        cutoffDate: cutoffDate.toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erro ao deletar antigos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/products/bulk-delete - EXCLUSÃO EM MASSA
// ═══════════════════════════════════════════════════════════

router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array de IDs é obrigatório'
      });
    }

    console.log(`\n🗑️ BULK DELETE - ${ids.length} produtos`);
    
    const conn = getProductConnection();
    const marketplaces = ['ML', 'shopee', 'amazon', 'magalu'];
    let totalDeleted = 0;
    const deletedByMarketplace = {};

    for (const mp of marketplaces) {
      const Model = getProductModel(mp, conn);
      const result = await Model.deleteMany({ _id: { $in: ids } });
      
      if (result.deletedCount > 0) {
        deletedByMarketplace[mp] = result.deletedCount;
        totalDeleted += result.deletedCount;
        console.log(`   ✅ ${mp}: ${result.deletedCount} deletados`);
      }
    }

    console.log(`   📊 Total: ${totalDeleted} produtos deletados\n`);

    res.json({
      success: true,
      data: {
        deleted: totalDeleted,
        byMarketplace: deletedByMarketplace
      }
    });

  } catch (error) {
    console.error('❌ Erro no bulk delete:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/products/:id - BUSCAR PRODUTO POR ID
// ═══════════════════════════════════════════════════════════

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const conn = getProductConnection();
    const marketplaces = ['ML', 'shopee', 'amazon', 'magalu'];
    
    for (const mp of marketplaces) {
      const Model = getProductModel(mp, conn);
      const product = await Model.findById(id).lean();
      
      if (product) {
        return res.json({
          success: true,
          data: { ...product, marketplace: mp }
        });
      }
    }

    res.status(404).json({
      success: false,
      error: 'Produto não encontrado'
    });

  } catch (error) {
    console.error('❌ Erro ao buscar produto:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/products/:id - DELETAR PRODUTO ÚNICO
// ═══════════════════════════════════════════════════════════

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`\n🗑️ DELETE /api/products/${id}`);
    
    const conn = getProductConnection();
    const marketplaces = ['ML', 'shopee', 'amazon', 'magalu'];
    
    for (const mp of marketplaces) {
      const Model = getProductModel(mp, conn);
      const result = await Model.findByIdAndDelete(id);
      
      if (result) {
        console.log(`   ✅ Produto deletado do ${mp}\n`);
        return res.json({
          success: true,
          message: 'Produto deletado com sucesso',
          data: { id, marketplace: mp }
        });
      }
    }

    res.status(404).json({
      success: false,
      error: 'Produto não encontrado'
    });

  } catch (error) {
    console.error('❌ Erro ao deletar produto:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;