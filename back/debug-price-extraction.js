/**
 * DEBUG FOCADO: Extração de preços de UM card do Mercado Livre
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

require('dotenv').config();
const path = require('path');
const fs = require('fs');

async function debugPriceExtraction() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║      🔍 DEBUG EXTRAÇÃO DE PREÇOS - ML              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const sessionPath = path.join(process.cwd(), 'ml-session.json');
  let storageState = undefined;

  if (fs.existsSync(sessionPath)) {
    try {
      storageState = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      console.log('✅ Sessão carregada\n');
    } catch (error) {
      console.log('⚠️  Erro ao carregar sessão\n');
    }
  }

  const browser = await chromium.launch({
    headless: false, // ← VISÍVEL para debug
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ...(storageState && { storageState })
  });

  const page = await context.newPage();

  try {
    const url = 'https://www.mercadolivre.com.br/ofertas?container_id=MLB779362-1&page=1';
    console.log('🌐 Navegando para:', url);
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    console.log('\n🔍 EXTRAINDO DADOS DO PRIMEIRO CARD...\n');

    const cardData = await page.evaluate(() => {
      const card = document.querySelector('.poly-card');
      if (!card) return { error: 'Nenhum card encontrado' };

      const result = {
        html: card.outerHTML.substring(0, 1000),
        priceAnalysis: {}
      };

      // 1. Busca o container principal
      const priceContainer = card.querySelector('.poly-component__price');
      result.priceAnalysis.hasContainer = !!priceContainer;

      if (priceContainer) {
        result.priceAnalysis.containerHTML = priceContainer.innerHTML.substring(0, 500);

        // 2. Busca elementos "previous"
        const previousElements = priceContainer.querySelectorAll('.andes-money-amount--previous');
        result.priceAnalysis.previousCount = previousElements.length;
        result.priceAnalysis.previousClasses = Array.from(previousElements).map(el => el.className);
        
        if (previousElements.length > 0) {
          const prevFraction = previousElements[0].querySelector('.andes-money-amount__fraction');
          result.priceAnalysis.previousPrice = prevFraction?.innerText;
        }

        // 3. Busca elementos "current"
        const currentContainer = priceContainer.querySelector('.poly-price__current');
        result.priceAnalysis.hasCurrentContainer = !!currentContainer;
        
        if (currentContainer) {
          const currFraction = currentContainer.querySelector('.andes-money-amount__fraction');
          result.priceAnalysis.currentPrice = currFraction?.innerText;
        }

        // 4. Lista TODOS os fractions
        const allFractions = priceContainer.querySelectorAll('.andes-money-amount__fraction');
        result.priceAnalysis.totalFractions = allFractions.length;
        result.priceAnalysis.allPrices = Array.from(allFractions).map((frac, idx) => {
          const parent = frac.closest('.andes-money-amount');
          return {
            index: idx,
            value: frac.innerText,
            isPrevious: parent?.classList.contains('andes-money-amount--previous'),
            parentClasses: parent?.className || 'no parent'
          };
        });

        // 5. Busca desconto
        const discountEl = card.querySelector('.poly-price__disc_label, .andes-money-amount__discount');
        result.priceAnalysis.discount = discountEl?.innerText;
      }

      // 6. Nome do produto
      const nameEl = card.querySelector('h2, .poly-component__title');
      result.productName = nameEl?.innerText;

      return result;
    });

    console.log('═══════════════════════════════════════════════════');
    console.log('📦 PRODUTO:', cardData.productName);
    console.log('═══════════════════════════════════════════════════\n');

    console.log('📊 ANÁLISE DE PREÇOS:');
    console.log('   Container existe?', cardData.priceAnalysis.hasContainer ? '✅' : '❌');
    console.log('   Current container?', cardData.priceAnalysis.hasCurrentContainer ? '✅' : '❌');
    console.log('   Total de fractions:', cardData.priceAnalysis.totalFractions);
    console.log('   Elementos "previous":', cardData.priceAnalysis.previousCount);
    console.log('   Desconto:', cardData.priceAnalysis.discount || 'N/A');
    console.log('');

    if (cardData.priceAnalysis.allPrices) {
      console.log('💰 TODOS OS PREÇOS ENCONTRADOS:');
      cardData.priceAnalysis.allPrices.forEach(p => {
        console.log(`   [${p.index}] ${p.value} | Previous: ${p.isPrevious ? '✅' : '❌'} | ${p.parentClasses}`);
      });
      console.log('');
    }

    console.log('🎯 PREÇOS EXTRAÍDOS:');
    console.log('   Preço anterior (previous):', cardData.priceAnalysis.previousPrice || '❌ NÃO ENCONTRADO');
    console.log('   Preço atual (current):', cardData.priceAnalysis.currentPrice || '❌ NÃO ENCONTRADO');
    console.log('');

    console.log('📝 HTML DO CONTAINER (primeiros 500 chars):');
    console.log(cardData.priceAnalysis.containerHTML || 'N/A');
    console.log('');

    // TESTE: Aplicar a lógica de extração
    console.log('\n🧪 SIMULANDO LÓGICA DE EXTRAÇÃO:\n');

    const extractionResult = await page.evaluate(() => {
      const card = document.querySelector('.poly-card');
      if (!card) return null;

      let currentPrice = 0, oldPrice = 0;
      const priceContainer = card.querySelector('.poly-component__price');

      if (priceContainer) {
        // Método 1: Previous + Current
        const previousPrice = priceContainer.querySelector('.andes-money-amount--previous .andes-money-amount__fraction');
        if (previousPrice) {
          oldPrice = parseInt(previousPrice.innerText.replace(/\./g, '')) || 0;
        }

        const currentContainer = priceContainer.querySelector('.poly-price__current');
        if (currentContainer) {
          const currentFraction = currentContainer.querySelector('.andes-money-amount__fraction');
          if (currentFraction) {
            currentPrice = parseInt(currentFraction.innerText.replace(/\./g, '')) || 0;
          }
        }

        // Fallback
        if (currentPrice === 0) {
          const allFractions = priceContainer.querySelectorAll('.andes-money-amount__fraction');
          for (const fraction of allFractions) {
            const parent = fraction.closest('.andes-money-amount');
            if (!parent?.classList.contains('andes-money-amount--previous')) {
              currentPrice = parseInt(fraction.innerText.replace(/\./g, '')) || 0;
              break;
            }
          }
        }
      }

      // Desconto
      const discountEl = card.querySelector('.poly-price__disc_label, .andes-money-amount__discount');
      const discount = parseInt((discountEl?.innerText || '0').replace(/\D/g, '')) || 0;

      return { currentPrice, oldPrice, discount };
    });

    console.log('   Preço atual extraído:', extractionResult.currentPrice || '❌ ZERO');
    console.log('   Preço antigo extraído:', extractionResult.oldPrice || '❌ ZERO');
    console.log('   Desconto extraído:', extractionResult.discount + '%');
    console.log('');

    if (extractionResult.currentPrice === 0 || extractionResult.oldPrice === 0) {
      console.log('❌ FALHA NA EXTRAÇÃO!');
      console.log('   A lógica atual NÃO está funcionando para este card.');
      console.log('   Verifique o HTML acima para ajustar os seletores.\n');
    } else if (extractionResult.currentPrice >= extractionResult.oldPrice) {
      console.log('⚠️  PREÇOS INVERTIDOS!');
      console.log(`   Current (${extractionResult.currentPrice}) >= Old (${extractionResult.oldPrice})`);
      console.log('   Este produto seria REJEITADO pela validação.\n');
    } else {
      console.log('✅ EXTRAÇÃO OK!');
      console.log(`   ${extractionResult.oldPrice} → ${extractionResult.currentPrice} (${extractionResult.discount}% off)\n`);
    }

    console.log('⏸️  Navegador vai ficar aberto por 60s para inspeção manual...');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await browser.close();
    console.log('\n✅ Debug finalizado!');
  }
}

debugPriceExtraction();