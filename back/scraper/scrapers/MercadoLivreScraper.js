const BaseScraper = require('./BaseScraper');
const axios = require('axios');
const { refreshMLToken } = require('../services/mlAuth');

class MercadoLivreScraper extends BaseScraper {
    constructor(minDiscount) {
        super('ML', minDiscount);

        this.urls = {
            ofertas: [
                'https://www.mercadolivre.com.br/ofertas?page=1',
                'https://www.mercadolivre.com.br/ofertas?page=2',
                'https://www.mercadolivre.com.br/ofertas?page=3'
            ]
        };
    }

    /**
     * Executa o processo completo de scraping e conversão
     */
    async scrapeCategory(categoryUrl, limit = 50) {
        // PASSO 1: Automação do Token (renova antes de começar)
        await refreshMLToken();
        await this.init();

        try {
            console.log(
                `🚀 Iniciando Scraping Mercado Livre (ID Afiliado: ${process.env.ML_AFFILIATE_ID})`
            );

            let allFilteredProducts = [];

            for (const url of this.urls.ofertas) {
                console.log(`🌐 Analisando vitrine: ${url}`);

                const productsFromPage = await this.getProductsWithMinDiscount(
                    url,
                    limit
                );

                allFilteredProducts.push(...productsFromPage);

                if (allFilteredProducts.length >= limit) break;
            }

            // PASSO 2: Conversão de Links via API Oficial
            console.log(
                `\n🔗 Convertendo ${allFilteredProducts.length} links para Afiliado Oficial...`
            );

            for (let product of allFilteredProducts) {
                product.link_afiliado = await this.convertUrlViaAPI(
                    product.link_original
                );
            }

            return allFilteredProducts.slice(0, limit);
        } finally {
            await this.close();
        }
    }

    /**
     * Captura produtos com desconto mínimo usando Playwright
     */
    async getProductsWithMinDiscount(url, limit) {
        const page = await this.browser.newPage();

        try {
            await page.setExtraHTTPHeaders({
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 60000
            });

            // Auto-scroll progressivo para carregar imagens e preços
            await page.evaluate(async () => {
                await new Promise(resolve => {
                    let totalHeight = 0;
                    const distance = 700;

                    const timer = setInterval(() => {
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if (totalHeight >= document.body.scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 200);
                });
            });

            await page.waitForTimeout(2000);

            return await page.evaluate(minDiscountAllowed => {
                const items = document.querySelectorAll(
                    '.promotion-item, .ui-search-result, .poly-card, .ui-search-layout__item'
                );

                const found = [];

                items.forEach(item => {
                    const discEl = item.querySelector(
                        '.andes-money-amount__discount, .promotion-item__discount-text, .poly-discount-badge, .ui-search-price__discount'
                    );

                    const discountNum =
                        parseInt(discEl?.innerText.replace(/[^\d]/g, '')) || 0;

                    if (discountNum >= minDiscountAllowed) {
                        const title = item.querySelector(
                            '.promotion-item__title, .ui-search-item__title, .poly-component__title, .poly-box .poly-component__title-wrapper a'
                        )?.innerText;

                        const link = item.querySelector('a')?.href;
                        const img =
                            item.querySelector('img')?.src ||
                            item
                                .querySelector('img')
                                ?.getAttribute('data-src');

                        const priceFraction =
                            item.querySelector(
                                '.andes-money-amount__fraction'
                            )?.innerText || '0';

                        const oldPriceEl = item.querySelector(
                            's .andes-money-amount__fraction, .andes-money-amount--previous .andes-money-amount__fraction'
                        );

                        const oldPrice = oldPriceEl
                            ? oldPriceEl.innerText
                            : 'N/A';

                        if (title && link && !link.includes('advertising')) {
                            found.push({
                                nome: title.trim(),
                                link_original: link,
                                preco: `R$ ${priceFraction}`,
                                preco_anterior:
                                    oldPrice !== 'N/A'
                                        ? `R$ ${oldPrice}`
                                        : 'N/A',
                                desconto: `${discountNum}% OFF`,
                                imagem: img
                            });
                        }
                    }
                });

                return found;
            }, this.minDiscount);
        } catch (e) {
            console.error('❌ Erro no scraper:', e.message);
            return [];
        } finally {
            if (!page.isClosed()) await page.close();
        }
    }

    /**
     * Converte link usando API ou fallback em caso de erro
     */
    async convertUrlViaAPI(originalUrl) {
        const accessToken = process.env.ML_ACCESS_TOKEN;
        const cleanUrl = originalUrl.split('?')[0].split('#')[0];

        if (!accessToken || accessToken.includes('AGUARDANDO')) {
            return this.generateFallbackLink(cleanUrl);
        }

        try {
            const response = await axios.post(
                'https://api.mercadolibre.com/short_urls',
                { url: cleanUrl },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            return response.data.short_url;
        } catch (error) {
            // Se a API falhar (DNS, timeout, etc), o fallback garante a comissão
            return this.generateFallbackLink(cleanUrl);
        }
    }

    /**
     * Gera link manual com seu ID de afiliado
     */
    generateFallbackLink(url) {
        const affiliateId = process.env.ML_AFFILIATE_ID || '77997172';

        return `${url}?matt_tool=${affiliateId}&utm_source=affiliate&utm_medium=webcash`;
    }
}

module.exports = MercadoLivreScraper;
