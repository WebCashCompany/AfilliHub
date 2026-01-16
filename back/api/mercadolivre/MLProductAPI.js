const axios = require('axios');
const MLAuth = require('./MLAuth');

class MLProductAPI {
  constructor() {
    this.auth = new MLAuth();
    this.baseUrl = 'https://api.mercadolibre.com';
    this.siteId = 'MLB'; // Brasil
    // User-Agent ajuda a evitar bloqueios 403 de WAF
    this.userAgent = 'WebCash/1.0 (https://www.webcash.com.br)';
  }

  /**
   * Faz requisição com tratamento automático de token e headers de segurança
   */
  async makeRequest(url, params = {}) {
    const token = await this.auth.getValidAccessToken();
    try {
      const response = await axios.get(url, {
        params,
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Accept': 'application/json',
          'User-Agent': this.userAgent
        }
      });
      return response.data;
    } catch (error) {
      // Se for erro de token (401), renova e tenta mais uma vez
      if (error.response?.status === 401) {
        console.log('🔄 Token expirado em requisição, renovando...');
        await this.auth.refreshAccessToken();
        const retry = await axios.get(url, {
          params,
          headers: { 
            'Authorization': `Bearer ${this.auth.accessToken}`,
            'Accept': 'application/json',
            'User-Agent': this.userAgent
          }
        });
        return retry.data;
      }
      throw error;
    }
  }

  /**
   * TEST 3: Testa conexão com dados do usuário
   */
  async testConnection() {
    try {
      const data = await this.makeRequest(`${this.baseUrl}/users/me`);
      return !!data.id;
    } catch (error) {
      console.error('❌ Erro na conexão (testConnection):', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * TEST 4: Lista categorias (necessário para o script de teste)
   */
  async getCategories() {
    try {
      const data = await this.makeRequest(`${this.baseUrl}/sites/${this.siteId}/categories`);
      return data;
    } catch (error) {
      console.error('❌ Erro ao buscar categorias:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * TEST 5: Busca ofertas reais filtrando por desconto
   */
  async searchDeals(minDiscount = 30, limit = 50) {
    let allProducts = [];
    let offset = 0;

    try {
      console.log(`🔍 Iniciando busca via API (Desconto min: ${minDiscount}%)...`);
      
      while (allProducts.length < limit && offset < 500) {
        const data = await this.makeRequest(`${this.baseUrl}/sites/${this.siteId}/search`, {
          // 'q': 'ofertas', // Opcional: termo de busca para filtrar mais
          'sort': 'relevance',
          'status': 'active',
          'limit': 50,
          'offset': offset,
          // Filtros de desconto para ajudar a API a entregar o que queremos
          'DISCOUNT': `${minDiscount}-100`
        });

        const results = data.results || [];
        if (results.length === 0) break;

        for (const item of results) {
          if (allProducts.length >= limit) break;
          const product = this.formatProduct(item, minDiscount);
          if (product) {
            allProducts.push(product);
          }
        }

        console.log(`   └─ Offset ${offset}: Encontrados ${allProducts.length} válidos`);
        
        if (results.length < 50) break;
        offset += 50;
        
        // Pequeno sleep para evitar Rate Limit (429)
        await new Promise(r => setTimeout(r, 300));
      }
      
      return allProducts;
    } catch (error) {
      console.error('❌ Erro searchDeals:', error.response?.data || error.message);
      return allProducts;
    }
  }

  /**
   * Formatação Profissional dos dados para o banco
   */
  formatProduct(item, minDiscountRequired) {
    const originalPrice = item.original_price || item.price;
    const currentPrice = item.price;
    
    let discount = 0;
    if (originalPrice > currentPrice) {
        discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    }

    // Validação de segurança do desconto
    if (discount < minDiscountRequired) return null;

    return {
      nome: item.title.trim(),
      // Converte thumbnail para imagem de alta resolução (O = Original)
      imagem: item.thumbnail?.replace("-I.jpg", "-O.jpg"), 
      link_original: item.permalink.split('?')[0],
      link_afiliado: null, // Será preenchido pelo ScrapingService chamando AffiliateAPI
      preco: `R$ ${currentPrice.toFixed(2).replace('.', ',')}`,
      preco_anterior: `R$ ${originalPrice.toFixed(2).replace('.', ',')}`,
      preco_de: originalPrice.toFixed(2),
      preco_para: currentPrice.toFixed(2),
      desconto: `${discount}%`,
      marketplace: 'ML',
      ml_product_id: item.id,
      isActive: true,
      dataColeta: new Date()
    };
  }
}

module.exports = MLProductAPI;