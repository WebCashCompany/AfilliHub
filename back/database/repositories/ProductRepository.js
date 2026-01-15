const Product = require('../models/Product');

class ProductRepository {
  async upsert(productData) {
    try {
      return await Product.findOneAndUpdate(
        { nome: productData.nome, marketplace: productData.marketplace },
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

    const operations = products.map(product => ({
      updateOne: {
        filter: { 
          nome: product.nome,
          marketplace: product.marketplace 
        },
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
      const result = await Product.bulkWrite(operations, { ordered: false });
      console.log(`✅ Bulk: ${result.upsertedCount} inseridos, ${result.modifiedCount} atualizados`);
      return result;
    } catch (error) {
      console.error('Erro no bulk upsert:', error);
      throw error;
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