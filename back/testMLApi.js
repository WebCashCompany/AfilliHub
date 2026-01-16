require('dotenv').config();

const MLProductAPI = require('./api/mercadolivre/MLProductAPI');
const MLAuth = require('./api/mercadolivre/MLAuth');

/**
 * TESTE COMPLETO - API DO MERCADO LIVRE
 * 
 * Valida todas as funcionalidades antes de rodar a automação
 */

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║      🧪 TESTE DA API DO MERCADO LIVRE 🧪       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const mlApi = new MLProductAPI();
  const mlAuth = new MLAuth();

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 1: Validar Credenciais
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Validar Credenciais do .env');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`✓ ML_APP_ID: ${process.env.ML_APP_ID ? '✅ Encontrado' : '❌ Não encontrado'}`);
    console.log(`✓ ML_CLIENT_SECRET: ${process.env.ML_CLIENT_SECRET ? '✅ Encontrado' : '❌ Não encontrado'}`);
    console.log(`✓ ML_ACCESS_TOKEN: ${process.env.ML_ACCESS_TOKEN ? '✅ Encontrado' : '❌ Não encontrado'}`);
    console.log(`✓ ML_REFRESH_TOKEN: ${process.env.ML_REFRESH_TOKEN ? '✅ Encontrado' : '❌ Não encontrado'}`);
    console.log(`✓ ML_AFFILIATE_ID: ${process.env.ML_AFFILIATE_ID ? '✅ Encontrado' : '❌ Não encontrado'}\n`);

    if (!process.env.ML_APP_ID || !process.env.ML_CLIENT_SECRET) {
      console.error('❌ ERRO: Credenciais não encontradas no .env\n');
      console.log('Adicione as seguintes variáveis ao seu .env:');
      console.log('ML_APP_ID=seu_app_id');
      console.log('ML_CLIENT_SECRET=seu_client_secret');
      console.log('ML_ACCESS_TOKEN=seu_access_token');
      console.log('ML_REFRESH_TOKEN=seu_refresh_token\n');
      process.exit(1);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 2: Testar Autenticação
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Autenticação');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const isValid = await mlAuth.validateToken();

    if (!isValid) {
      console.error('\n❌ Token inválido. Tente renovar com:');
      console.log('node -e "require(\'./api/mercadolivre/MLAuth\').refreshAccessToken()"\n');
      process.exit(1);
    }

    console.log('✅ Autenticação OK!\n');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 3: Testar Conexão com API
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Conexão com API');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const connected = await mlApi.testConnection();

    if (!connected) {
      console.error('❌ Falha na conexão com API\n');
      process.exit(1);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 4: Listar Categorias
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Listar Categorias');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const categories = await mlApi.getCategories();

    if (categories.length === 0) {
      console.error('⚠️  Nenhuma categoria encontrada\n');
    } else {
      console.log(`✅ ${categories.length} categorias disponíveis\n`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 5: Buscar Produtos (amostra)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Buscar Produtos em Oferta');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🔍 Buscando 5 produtos com desconto ≥ 30%...\n');

    const products = await mlApi.searchDeals(30, 5);

    if (products.length === 0) {
      console.log('⚠️  Nenhum produto encontrado (tente reduzir o desconto mínimo)\n');
    } else {
      console.log(`✅ ${products.length} produtos encontrados!\n`);
      console.log('📦 AMOSTRA:\n');

      products.forEach((p, i) => {
        console.log(`${i + 1}. ${p.nome.substring(0, 60)}...`);
        console.log(`   └─ Desconto: ${p.desconto}`);
        console.log(`   └─ Preço: ${p.preco_anterior} → ${p.preco}`);
        console.log(`   └─ Link: ${p.link_afiliado.substring(0, 60)}...`);
        console.log('');
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // RESUMO FINAL
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║            ✅ TODOS OS TESTES PASSARAM ✅       ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    console.log('🎉 Sua API está configurada corretamente!\n');
    console.log('📋 PRÓXIMOS PASSOS:\n');
    console.log('1. Execute a automação completa:');
    console.log('   → node index.js mercadolivre\n');
    console.log('2. Ou use o worker específico:');
    console.log('   → node workers/mlWorker.js\n');
    console.log('3. Configure modo no .env:');
    console.log('   → SCRAPING_MODE=auto (recomendado)');
    console.log('   → SCRAPING_MODE=api (força API)');
    console.log('   → SCRAPING_MODE=scraper (força scraping)\n');

    process.exit(0);

  } catch (error) {
    console.error('\n╔══════════════════════════════════════════════════╗');
    console.error('║                  ❌ ERRO NO TESTE ❌             ║');
    console.error('╚══════════════════════════════════════════════════╝\n');
    console.error('Erro:', error.message);
    
    if (error.response?.data) {
      console.error('Detalhes da API:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('\n💡 DICAS:');
    console.error('- Verifique se suas credenciais no .env estão corretas');
    console.error('- Tente renovar o token: node -e "require(\'./services/mlAuth\').refreshMLToken()"');
    console.error('- Consulte a documentação: https://developers.mercadolivre.com.br\n');
    
    process.exit(1);
  }
}

// Executa os testes
runTests();