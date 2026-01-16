const Product = require('../models/Product');

class ProductRepository {
  async upsert(productData) {
    try {
      // Usamos o link_afiliado como filtro único para evitar o erro E11000
      return await Product.findOneAndUpdate(
        { link_afiliado: productData.link_afiliado }, 
        { 
          ...productData,
          ultima_verificacao: new Date()
        },
        { 
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    } catch (error) {
      console.error('Erro ao fazer upsert:', error);
      throw error;
    }
  }

  async bulkUpsert(products) {
    if (!products || products.length === 0) return { ok: 0 };

    // 1. FILTRO DE MEMÓRIA: Remove duplicados antes de enviar para o banco
    const uniqueProducts = Array.from(
      new Map(products.map(p => [p.link_afiliado, p])).values()
    );

    // 2. MONTAGEM DAS OPERAÇÕES
    const operations = uniqueProducts.map(product => ({
      updateOne: {
        // Filtramos pelo link_afiliado que é a sua chave única no MongoDB
        filter: { link_afiliado: product.link_afiliado },
        update: { 
          $set: {
            ...product,
            ultima_verificacao: new Date()
          }
        },
        upsert: true
      }
    }));

    try {
      // 'ordered: false' faz com que se um der erro, os outros continuem salvando
      const result = await Product.bulkWrite(operations, { ordered: false });
      console.log(`✅ Bulk: ${result.upsertedCount} novos, ${result.modifiedCount} atualizados`);
      return result;
    } catch (error) {
      // Se houver erro de chave duplicada residual, ele loga mas não quebra o processo
      console.error('⚠️ Algumas duplicatas foram detectadas e ignoradas no Bulk.');
      return error.result || { ok: 0 };
    }
  }

  async find(filters = {}, options = {}) {
    const query = { isActive: true, ...filters };
    let dbQuery = Product.find(query);
    
    if (options.sort) dbQuery = dbQuery.sort(options.sort);
    else dbQuery = dbQuery.sort({ ultima_verificacao: -1 });
    
    if (options.limit) dbQuery = dbQuery.limit(options.limit);
    if (options.skip) dbQuery = dbQuery.skip(options.skip);
    
    return dbQuery.lean().exec();
  }

  async count(filters = {}) {
    return Product.countDocuments({ isActive: true, ...filters });
  }

  async getStats() {
    return await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$marketplace', total: { $sum: 1 } } }
    ]);
  }
}

module.exports = new ProductRepository();