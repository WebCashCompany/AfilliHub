const BaseScraper = require('./BaseScraper');

class MercadoLivreScraper extends BaseScraper {
  constructor(minDiscount) {
    super('ML', minDiscount);
    this.baseUrl = 'https://www.mercadolivre.com.br/ofertas';
  }

  async getProductUrls(categoryUrl, limit = 50) {
    const page = await this.browser.newPage();
    
    try {
      console.log('📄 Configurando página com user-agent real...');
      
      // Define user-agent real
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      });

      // Remove sinais de automação
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
        window.chrome = { runtime: {} };
      });

      console.log('🌐 Navegando para:', categoryUrl);
      
      await page.goto(categoryUrl, { 
        waitUntil: 'networkidle', 
        timeout: 30000 
      });

      // Simula comportamento humano - scroll
      console.log('📜 Simulando scroll humano...');
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight / 2) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      // Aguarda carregar
      console.log('⏳ Aguardando produtos carregarem...');
      await page.waitForTimeout(5000);

      // Tenta encontrar produtos de várias formas
      console.log('🔍 Procurando produtos na página...');
      
      // Método 1: Pega o HTML e faz parsing manual
      const htmlContent = await page.content();
      const mlbMatches = htmlContent.match(/\/MLB-\d+/g);
      
      if (mlbMatches && mlbMatches.length > 0) {
        console.log(`✅ Encontrados ${mlbMatches.length} códigos MLB no HTML`);
        
        const urls = [...new Set(mlbMatches)]
          .map(code => `https://produto.mercadolivre.com.br${code}`)
          .slice(0, limit);
        
        console.log(`🎯 Retornando ${urls.length} URLs únicas`);
        return urls;
      }

      // Método 2: Tenta com seletores genéricos
      console.log('🔄 Tentando método alternativo (seletores)...');
      
      const urls = await page.$$eval('a[href*="/MLB-"]', (links) => 
        links
          .map(a => a.href)
          .filter(href => href && href.includes('/MLB-'))
          .map(url => url.split('?')[0].split('#')[0])
      );

      if (urls.length > 0) {
        const uniqueUrls = [...new Set(urls)];
        console.log(`✅ Encontrados ${uniqueUrls.length} links únicos`);
        return uniqueUrls.slice(0, limit);
      }

      // Se não encontrou nada, salva screenshot
      console.log('⚠️  Nenhum produto encontrado!');
      const screenshotPath = `debug-ml-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot salvo: ${screenshotPath}`);
      console.log('💡 Abra o screenshot para ver o que aconteceu!');

      return [];
      
    } catch (error) {
      console.error('❌ Erro:', error.message);
      
      try {
        const screenshotPath = `error-ml-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot de erro salvo: ${screenshotPath}`);
      } catch (e) {}
      
      return [];
    } finally {
      await page.close();
    }
  }

  async scrapeProduct(url) {
    const page = await this.browser.newPage();
    
    try {
      // Anti-bot headers
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      });

      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });

      await page.waitForSelector('h1.ui-pdp-title', { timeout: 5000 });
      await page.waitForTimeout(2000);

      const nome = await page.textContent('h1.ui-pdp-title').catch(() => null);
      if (!nome) return null;

      // Preço DE (antigo)
      let precoDeTexto = 'Não disponível';
      try {
        const fraction = await page.textContent('s.ui-pdp-price__original-value .andes-money-amount__fraction');
        const cents = await page.textContent('s.ui-pdp-price__original-value .andes-money-amount__cents').catch(() => '00');
        precoDeTexto = `R$ ${fraction.trim()},${cents.trim()}`;
      } catch (e) {}

      // Preço PARA (atual)
      let precoParaTexto = 'Não disponível';
      try {
        const fraction = await page.textContent('div.ui-pdp-price__second-line .andes-money-amount__fraction');
        const cents = await page.textContent('div.ui-pdp-price__second-line .andes-money-amount__cents').catch(() => '00');
        precoParaTexto = `R$ ${fraction.trim()},${cents.trim()}`;
      } catch (e) {
        try {
          const fraction = await page.textContent('.andes-money-amount__fraction');
          const cents = await page.textContent('.andes-money-amount__cents').catch(() => '00');
          precoParaTexto = `R$ ${fraction.trim()},${cents.trim()}`;
        } catch (e2) {}
      }

      const precoAtual = this.extractPrice(precoParaTexto);
      const precoAnterior = this.extractPrice(precoDeTexto);
      const descontoNum = precoAnterior > 0 ? Math.round(((precoAnterior - precoAtual) / precoAnterior) * 100) : 0;
      const desconto = descontoNum > 0 ? `${descontoNum}% OFF` : 'Sem desconto';

      const imagem = await page.getAttribute('figure.ui-pdp-gallery__figure img', 'src')
        .catch(() => page.getAttribute('img.ui-pdp-image', 'src'))
        .catch(() => '');

      const avaliacao = await page.textContent('.ui-pdp-review__rating').catch(() => 'N/A');
      const numeroAvaliacoes = await page.textContent('.ui-pdp-review__amount').catch(() => '0');
      const frete = await page.textContent('.ui-pdp-color--GREEN').catch(() => '');
      const parcelas = await page.textContent('.ui-pdp-payment').catch(() => '');
      const vendedor = await page.textContent('.ui-pdp-seller__header__title').catch(() => '');

      let categoria = 'Ofertas ML';
      try {
        const breadcrumbs = await page.$$eval('.andes-breadcrumb__item', items => 
          items.map(item => item.textContent.trim())
        );
        if (breadcrumbs.length > 0) {
          categoria = breadcrumbs[breadcrumbs.length - 1];
        }
      } catch (e) {}

      const linkAfiliado = this.generateAffiliateUrl(url);

      return {
        nome: nome.trim(),
        imagem,
        link_afiliado: linkAfiliado,
        preco: precoParaTexto,
        preco_anterior: precoDeTexto,
        preco_de: precoDeTexto,
        preco_para: precoParaTexto,
        desconto,
        categoria,
        avaliacao: avaliacao.toString().trim(),
        numero_avaliacoes: numeroAvaliacoes.toString().trim(),
        frete: frete.trim(),
        parcelas: parcelas.trim(),
        vendedor: vendedor.trim(),
        porcentagem_vendido: 'N/A',
        tempo_restante: 'N/A',
        marketplace: this.marketplace,
        ultima_verificacao: new Date()
      };
    } catch (error) {
      console.error(`❌ Erro em ${url}:`, error.message);
      return null;
    } finally {
      await page.close();
    }
  }

  generateAffiliateUrl(url) {
    const affiliateId = process.env.ML_AFFILIATE_ID;
    if (!affiliateId || affiliateId.trim() === '') {
      return url;
    }

    // Extrai o código MLB do produto
    const mlbMatch = url.match(/MLB-(\d+)/);
    if (!mlbMatch) return url;

    // Gera IDs únicos de tracking (UUID v4)
    const trackingId = this.generateUUID();
    const recoId = this.generateUUID();
    const cUid = this.generateUUID();

    // Gera um searchVariation aleatório (12 dígitos como no exemplo real)
    const searchVariation = Math.floor(100000000000 + Math.random() * 900000000000);

    // Monta URL base sem params
    const baseUrl = url.split('?')[0].split('#')[0];

    // Query parameters (antes do #)
    const queryParams = `searchVariation=${searchVariation}`;

    // Hash parameters (depois do #) - INCLUI polycard_client
    const hashParams = [
      `polycard_client=recommendations_home_affiliate-profile`,
      `reco_backend=item_decorator`,
      `reco_client=home_affiliate-profile`,
      `reco_item_pos=0`,
      `source=affiliate-profile`,
      `reco_backend_type=function`,
      `reco_id=${recoId}`,
      `tracking_id=${trackingId}`,
      `c_id=/home/card-featured/element`,
      `c_uid=${cUid}`
    ].join('&');

    // Retorna URL completa: base + query + hash
    return `${baseUrl}?${queryParams}#${hashParams}`;
  }

  generateUUID() {
    // Gera UUID v4 (formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

module.exports = MercadoLivreScraper;