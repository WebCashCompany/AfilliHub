/**
 * ═══════════════════════════════════════════════════════════════════════
 * DEBUG ML SELECTORS - Descobre os seletores corretos
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const path = require('path');
const fs = require('fs');

async function debugSelectors() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║      🔍 DEBUG ML SELECTORS                         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({
    headless: false, // Mostra o navegador
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const sessionPath = path.join(process.cwd(), 'ml-session.json');
  let contextOptions = {
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  if (fs.existsSync(sessionPath)) {
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    if (sessionData.cookies) {
      contextOptions.storageState = sessionData;
      console.log('✅ Sessão carregada\n');
    }
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // URL das Ofertas Relâmpago
  const url = 'https://www.mercadolivre.com.br/ofertas#nav-header';

  console.log('🌐 Navegando para:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('\n🔍 ANALISANDO ESTRUTURA DA PÁGINA...\n');

  const debug = await page.evaluate(() => {
    const results = {
      totalElements: 0,
      cardSelectors: [],
      cards: [],
      priceSelectors: [],
      discountSelectors: [],
      imageSelectors: []
    };

    // 1. BUSCAR CARDS
    const possibleCardSelectors = [
      '.poly-card',
      '.ui-search-result',
      '.ui-search-result__content',
      '.ui-search-layout__item',
      '[class*="poly-card"]',
      '[class*="ui-search-result"]',
      '[class*="search-result"]',
      'li.ui-search-layout__item',
      'div[class*="item"]'
    ];

    for (const selector of possibleCardSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        results.cardSelectors.push({
          selector: selector,
          count: elements.length
        });
      }
    }

    // 2. ANALISAR PRIMEIRO CARD ENCONTRADO
    let firstCard = null;
    for (const selectorInfo of results.cardSelectors) {
      const cards = document.querySelectorAll(selectorInfo.selector);
      if (cards.length > 0) {
        firstCard = cards[0];
        break;
      }
    }

    if (firstCard) {
      // Classes do card
      results.cards.push({
        classes: firstCard.className,
        html: firstCard.outerHTML.substring(0, 500)
      });

      // 3. BUSCAR PREÇOS DENTRO DO CARD
      const priceElements = firstCard.querySelectorAll('[class*="price"], [class*="money"]');
      priceElements.forEach(el => {
        if (el.className) {
          results.priceSelectors.push({
            class: el.className,
            text: el.innerText.substring(0, 50),
            tag: el.tagName
          });
        }
      });

      // 4. BUSCAR DESCONTOS
      const discountElements = firstCard.querySelectorAll('[class*="discount"], [class*="off"]');
      discountElements.forEach(el => {
        if (el.className) {
          results.discountSelectors.push({
            class: el.className,
            text: el.innerText,
            tag: el.tagName
          });
        }
      });

      // 5. BUSCAR IMAGENS
      const images = firstCard.querySelectorAll('img');
      images.forEach(img => {
        results.imageSelectors.push({
          src: img.src?.substring(0, 100) || 'N/A',
          dataSrc: img.getAttribute('data-src')?.substring(0, 100) || 'N/A',
          class: img.className
        });
      });

      // 6. BUSCAR FRAÇÕES DE PREÇO (andes-money-amount__fraction)
      const fractions = firstCard.querySelectorAll('.andes-money-amount__fraction');
      if (fractions.length > 0) {
        results.priceSelectors.push({
          selector: '.andes-money-amount__fraction',
          count: fractions.length,
          values: Array.from(fractions).map(f => f.innerText)
        });
      }
    }

    results.totalElements = document.querySelectorAll('*').length;
    return results;
  });

  // EXIBIR RESULTADOS
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  📊 RESULTADOS DA ANÁLISE                          ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('🎯 SELETORES DE CARDS ENCONTRADOS:');
  if (debug.cardSelectors.length > 0) {
    debug.cardSelectors.forEach((sel, i) => {
      console.log(`   ${i + 1}. ${sel.selector} → ${sel.count} elementos`);
    });
  } else {
    console.log('   ❌ NENHUM CARD ENCONTRADO!');
  }

  console.log('\n💰 SELETORES DE PREÇO ENCONTRADOS:');
  if (debug.priceSelectors.length > 0) {
    debug.priceSelectors.slice(0, 5).forEach((sel, i) => {
      if (sel.selector) {
        console.log(`   ${i + 1}. ${sel.selector} → ${sel.count} frações`);
        console.log(`      Valores: ${sel.values?.join(', ')}`);
      } else {
        console.log(`   ${i + 1}. ${sel.tag} .${sel.class}`);
        console.log(`      Texto: ${sel.text}`);
      }
    });
  } else {
    console.log('   ❌ NENHUM PREÇO ENCONTRADO!');
  }

  console.log('\n🏷️  SELETORES DE DESCONTO ENCONTRADOS:');
  if (debug.discountSelectors.length > 0) {
    debug.discountSelectors.slice(0, 3).forEach((sel, i) => {
      console.log(`   ${i + 1}. ${sel.tag} .${sel.class}`);
      console.log(`      Texto: ${sel.text}`);
    });
  } else {
    console.log('   ❌ NENHUM DESCONTO ENCONTRADO!');
  }

  console.log('\n🖼️  SELETORES DE IMAGEM ENCONTRADOS:');
  if (debug.imageSelectors.length > 0) {
    debug.imageSelectors.slice(0, 2).forEach((sel, i) => {
      console.log(`   ${i + 1}. img.${sel.class || 'sem-class'}`);
      console.log(`      src: ${sel.src}`);
      console.log(`      data-src: ${sel.dataSrc}`);
    });
  } else {
    console.log('   ❌ NENHUMA IMAGEM ENCONTRADA!');
  }

  console.log('\n📝 ESTRUTURA DO PRIMEIRO CARD:');
  if (debug.cards.length > 0) {
    console.log(`   Classes: ${debug.cards[0].classes}`);
    console.log(`\n   HTML (primeiros 500 chars):`);
    console.log(`   ${debug.cards[0].html}`);
  }

  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║  ✅ ANÁLISE CONCLUÍDA                              ║');
  console.log('║  📋 Copie e cole esse output para ajustar          ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Salvar em arquivo
  const outputPath = path.join(process.cwd(), 'ml-debug-output.json');
  fs.writeFileSync(outputPath, JSON.stringify(debug, null, 2));
  console.log(`💾 Resultado salvo em: ${outputPath}\n`);

  console.log('⏸️  Navegador vai ficar aberto por 30s para você inspecionar...\n');
  await page.waitForTimeout(30000);

  await browser.close();
  console.log('✅ Finalizado!\n');
}

debugSelectors().catch(console.error);