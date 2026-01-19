/**
 * ═══════════════════════════════════════════════════════════════
 * SELETOR DE CATEGORIAS - INTERFACE INTERATIVA
 * ═══════════════════════════════════════════════════════════════
 */

const readline = require('readline');
const { 
  CATEGORIAS_ML, 
  exibirMenuCategorias, 
  categoriaExiste 
} = require('./categorias-ml');

/**
 * Cria interface readline
 */
function criarInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Faz uma pergunta e retorna a resposta
 */
function perguntar(rl, pergunta) {
  return new Promise((resolve) => {
    rl.question(pergunta, (resposta) => {
      resolve(resposta.trim());
    });
  });
}

/**
 * Processa a seleção de categorias do usuário
 */
function processarSelecao(input) {
  if (!input || input.toLowerCase() === 'todas') {
    return Object.keys(CATEGORIAS_ML);
  }
  
  // Remove espaços e separa por vírgula
  const selecoes = input.split(',').map(s => s.trim()).filter(s => s);
  const categorias = [];
  const invalidas = [];
  
  for (const selecao of selecoes) {
    // Verifica se é um número
    if (/^\d+$/.test(selecao)) {
      const index = parseInt(selecao) - 1;
      const chaves = Object.keys(CATEGORIAS_ML);
      
      if (index >= 0 && index < chaves.length) {
        categorias.push(chaves[index]);
      } else {
        invalidas.push(selecao);
      }
    }
    // Verifica se é uma chave válida
    else if (categoriaExiste(selecao)) {
      categorias.push(selecao);
    }
    else {
      invalidas.push(selecao);
    }
  }
  
  return { categorias, invalidas };
}

/**
 * Seletor interativo de categorias
 */
async function selecionarCategorias() {
  const rl = criarInterface();
  
  try {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          🎯 SELETOR DE CATEGORIAS - MERCADO LIVRE             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
    exibirMenuCategorias();
    
    console.log('📝 INSTRUÇÕES:');
    console.log('   • Digite "todas" ou pressione ENTER para todas as categorias');
    console.log('   • Digite os números separados por vírgula: 1,3,5');
    console.log('   • Ou digite as chaves: beleza,games,informatica');
    console.log('   • Misture números e chaves: 1,games,3\n');
    
    const input = await perguntar(rl, '🔍 Selecione as categorias: ');
    
    if (!input || input.toLowerCase() === 'todas') {
      const todasCategorias = Object.keys(CATEGORIAS_ML);
      console.log(`\n✅ Selecionadas TODAS as ${todasCategorias.length} categorias!\n`);
      rl.close();
      return todasCategorias;
    }
    
    const resultado = processarSelecao(input);
    
    if (resultado.invalidas && resultado.invalidas.length > 0) {
      console.log(`\n⚠️  Seleções inválidas ignoradas: ${resultado.invalidas.join(', ')}`);
    }
    
    if (resultado.categorias.length === 0) {
      console.log('\n❌ Nenhuma categoria válida selecionada. Usando TODAS.\n');
      rl.close();
      return Object.keys(CATEGORIAS_ML);
    }
    
    console.log(`\n✅ Selecionadas ${resultado.categorias.length} categoria(s):`);
    resultado.categorias.forEach((cat, idx) => {
      const info = CATEGORIAS_ML[cat];
      console.log(`   ${idx + 1}. ${info.emoji}  ${info.nome}`);
    });
    console.log('');
    
    rl.close();
    return resultado.categorias;
    
  } catch (error) {
    rl.close();
    console.error('❌ Erro ao selecionar categorias:', error.message);
    return Object.keys(CATEGORIAS_ML);
  }
}

/**
 * Seleção via argumentos da linha de comando
 * Uso: --categorias=beleza,games,informatica
 */
function selecionarViaArgumentos(args) {
  const categoriaArg = args.find(arg => arg.startsWith('--categorias='));
  
  if (!categoriaArg) {
    return null;
  }
  
  const valor = categoriaArg.split('=')[1];
  
  if (!valor || valor.toLowerCase() === 'todas') {
    return Object.keys(CATEGORIAS_ML);
  }
  
  const resultado = processarSelecao(valor);
  
  if (resultado.categorias.length === 0) {
    console.log('⚠️  Nenhuma categoria válida nos argumentos. Usando TODAS.\n');
    return Object.keys(CATEGORIAS_ML);
  }
  
  return resultado.categorias;
}

/**
 * Exibe categorias selecionadas de forma formatada
 */
function exibirCategoriasSelecionadas(categorias, distribuicao = null) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              📊 CATEGORIAS SELECIONADAS                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  categorias.forEach((cat, idx) => {
    const info = CATEGORIAS_ML[cat];
    const produtos = distribuicao ? ` → ${distribuicao[cat]} produtos` : '';
    console.log(`  ${(idx + 1).toString().padStart(2, '0')}. ${info.emoji}  ${info.nome.padEnd(30)}${produtos}`);
  });
  
  console.log('\n╚════════════════════════════════════════════════════════════════╝\n');
}

module.exports = {
  selecionarCategorias,
  selecionarViaArgumentos,
  processarSelecao,
  exibirCategoriasSelecionadas
};