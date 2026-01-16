/**
 * MERCADO LIVRE - GERADOR DE LINKS DE AFILIADO
 * 
 * SOLUÇÃO DEFINITIVA E PROFISSIONAL
 * 
 * O Mercado Livre NÃO oferece API pública para afiliados.
 * Esta classe usa o formato OFICIAL dos links de afiliado do ML.
 * 
 * Formato oficial: ?matt_tool=SEU_ID
 */

class MLAffiliateAPI {
  constructor() {
    this.affiliateId = process.env.ML_AFFILIATE_ID;
    
    if (!this.affiliateId) {
      throw new Error('ML_AFFILIATE_ID não configurado no .env');
    }
  }

  /**
   * Gera links de afiliado usando o formato OFICIAL do Mercado Livre
   * 
   * @param {Array<string>} urls - URLs dos produtos
   * @returns {Array<Object>} Links de afiliado gerados
   */
  async generateAffiliateLinks(urls) {
    if (!urls || urls.length === 0) return [];

    console.log(`🔗 Gerando ${urls.length} links de afiliado (formato oficial ML)...`);

    const results = [];

    for (const url of urls) {
      try {
        const affiliateLink = this.createAffiliateLink(url);
        
        results.push({
          source: url,
          affiliate_link: affiliateLink,
          success: true
        });
      } catch (error) {
        console.error(`❌ Erro ao processar ${url}:`, error.message);
        
        results.push({
          source: url,
          affiliate_link: null,
          success: false,
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    console.log(`✅ ${successful}/${urls.length} links gerados com sucesso!\n`);

    return results;
  }

  /**
   * Cria link de afiliado no formato OFICIAL do Mercado Livre
   * 
   * Formato: https://produto.mercadolivre.com.br/MLB-123?matt_tool=ID
   * 
   * Parâmetros UTM adicionais são opcionais mas recomendados para tracking
   */
  createAffiliateLink(url) {
    // Remove parâmetros existentes da URL
    const cleanUrl = url.split('?')[0].split('#')[0];

    // Valida se é uma URL do Mercado Livre
    if (!this.isValidMLUrl(cleanUrl)) {
      throw new Error('URL inválida: não é do Mercado Livre');
    }

    // Monta os parâmetros do link de afiliado
    const params = new URLSearchParams({
      matt_tool: this.affiliateId,
      // UTM params para tracking (opcionais mas recomendados)
      utm_source: 'webcash',
      utm_medium: 'affiliate',
      utm_campaign: 'deals'
    });

    return `${cleanUrl}?${params.toString()}`;
  }

  /**
   * Valida se a URL é do Mercado Livre
   */
  isValidMLUrl(url) {
    const mlDomains = [
      'mercadolivre.com.br',
      'produto.mercadolivre.com.br',
      'www.mercadolivre.com.br'
    ];

    try {
      const urlObj = new URL(url);
      return mlDomains.some(domain => urlObj.hostname.includes(domain));
    } catch {
      return false;
    }
  }

  /**
   * Extrai o ID do produto do Mercado Livre da URL
   */
  extractProductId(url) {
    const match = url.match(/MLB-(\d+)/);
    return match ? match[0] : null;
  }

  /**
   * Valida se o link de afiliado foi gerado corretamente
   */
  validateAffiliateLink(link) {
    try {
      const url = new URL(link);
      const mattTool = url.searchParams.get('matt_tool');
      
      return mattTool === this.affiliateId;
    } catch {
      return false;
    }
  }

  /**
   * Gera link curto de afiliado (opcional - para redes sociais)
   * 
   * Nota: O ML possui seu próprio encurtador em https://mpago.la/
   * mas requer acesso ao painel de afiliados para gerar
   */
  async generateShortLink(affiliateLink) {
    // TODO: Implementar integração com serviço de encurtamento
    // Opções: bit.ly, tinyurl, ou encurtador próprio
    return affiliateLink;
  }
}

module.exports = MLAffiliateAPI;