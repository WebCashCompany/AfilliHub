require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const NGROK_HEADERS = {
  'ngrok-skip-browser-warning': 'true',
  'Content-Type': 'application/json',
};
/**
 * ═══════════════════════════════════════════════════════════════
 * CONFIGURAÇÃO INICIAL - MERCADO LIVRE
 * ═══════════════════════════════════════════════════════════════
 * 
 * Este script serve para:
 * 1. Fazer login manual no Mercado Livre UMA VEZ
 * 2. Salvar a sessão (cookies) em ml-session.json
 * 3. Reutilizar essa sessão nas próximas execuções
 * 
 * COMO USAR:
 * 1. Execute: node ml-auth-setup.js
 * 2. Uma janela do navegador vai abrir
 * 3. Faça login normalmente no Mercado Livre
 * 4. Navegue até o portal de afiliados para confirmar acesso
 * 5. Volte no terminal e pressione ENTER
 * 6. Pronto! Sessão salva em ml-session.json
 * 
 * QUANDO USAR NOVAMENTE:
 * - Quando a sessão expirar (geralmente 30-90 dias)
 * - Se o ML pedir novo login
 */

async function configurarSessaoML() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║    🔐 CONFIGURAÇÃO DE AUTENTICAÇÃO - ML 🔐        ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Verifica se já existe sessão salva
  const sessionPath = path.join(__dirname, 'ml-session.json');
  
  if (fs.existsSync(sessionPath)) {
    console.log('⚠️  JÁ EXISTE UMA SESSÃO SALVA!\n');
    console.log('Deseja substituir? (S/N): ');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('', resolve);
    });
    
    rl.close();
    
    if (answer.toUpperCase() !== 'S') {
      console.log('\n❌ Operação cancelada.\n');
      process.exit(0);
    }
    
    console.log('\n✅ Sessão antiga será substituída.\n');
  }

  const browser = await chromium.launch({ 
    headless: false, // Mostra o navegador
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  console.log('🌐 Abrindo Mercado Livre...\n');
  await page.goto('https://www.mercadolivre.com.br/', { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });
  
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║              📋 INSTRUÇÕES 📋                     ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
  console.log('1️⃣  Faça LOGIN no Mercado Livre na janela que abriu');
  console.log('');
  console.log('2️⃣  Após logar, navegue até o portal de afiliados:');
  console.log('   https://afiliados.mercadolivre.com.br/');
  console.log('');
  console.log('3️⃣  Confirme que consegue acessar o painel');
  console.log('');
  console.log('4️⃣  Volte aqui e pressione ENTER');
  console.log('');
  console.log('════════════════════════════════════════════════════');
  console.log('');
  
  // Espera o usuário pressionar ENTER
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise(resolve => {
    rl.question('Pressione ENTER quando terminar o login... ', () => {
      rl.close();
      resolve();
    });
  });
  
  console.log('\n💾 Salvando sessão...');
  
  // Salva os cookies e tokens da sessão
  await context.storageState({ path: sessionPath });
  
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║            ✅ CONFIGURAÇÃO CONCLUÍDA ✅           ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
  console.log('✨ Sessão salva em: ml-session.json');
  console.log('');
  console.log('📌 PRÓXIMOS PASSOS:');
  console.log('   1. A automação agora usará essa sessão automaticamente');
  console.log('   2. Você NÃO precisa fazer login novamente');
  console.log('   3. Se a sessão expirar, rode este script novamente');
  console.log('');
  console.log('⚠️  IMPORTANTE:');
  console.log('   • NÃO compartilhe o arquivo ml-session.json');
  console.log('   • Adicione ml-session.json no .gitignore');
  console.log('');
  
  await browser.close();
  process.exit(0);
}

// Executa a configuração
configurarSessaoML().catch(error => {
  console.error('\n❌ ERRO:', error.message);
  process.exit(1);
});