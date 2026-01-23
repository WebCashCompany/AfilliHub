/**
 * ═══════════════════════════════════════════════════════════════
 * CATEGORIAS DO MERCADO LIVRE - CONFIGURAÇÃO COMPLETA
 * ═══════════════════════════════════════════════════════════════
 * 
 * Este arquivo contém todas as categorias disponíveis para scraping
 * no Mercado Livre, com suas respectivas URLs e códigos.
 */

const CATEGORIAS_ML = {
  todas: {
    nome: 'Todas as Ofertas',
    url: 'https://www.mercadolivre.com.br/ofertas',
    codigo: 'todas',
    emoji: '🎯'
  },
  beleza: {
    nome: 'Beleza',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB1246',
    codigo: 'MLB1246',
    emoji: '💄'
  },
  ofertas_relampago: {
    nome: 'Ofertas Relâmpago',
    url: 'https://www.mercadolivre.com.br/ofertas?promotion_type=lightning',
    codigo: 'lightning',
    emoji: '⚡'
  },
  ofertas_dia: {
    nome: 'Ofertas do Dia',
    url: 'https://www.mercadolivre.com.br/ofertas?container_id=MLB779362-1&promotion_type=deal_of_the_day',
    codigo: 'deal_of_the_day',
    emoji: '🌟'
  },
  informatica: {
    nome: 'Informática',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB1648&container_id=MLB779362-1',
    codigo: 'MLB1648',
    emoji: '💻'
  },
  precos_imbativeis: {
    nome: 'Preços Imbatíveis',
    url: 'https://www.mercadolivre.com.br/ofertas?container_id=MLB1298579-1&deal_ids=MLB1298579',
    codigo: 'MLB1298579',
    emoji: '💥'
  },
  eletrodomesticos: {
    nome: 'Eletrodomésticos',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB5726&container_id=MLB779362-1',
    codigo: 'MLB5726',
    emoji: '🏠'
  },
  celulares: {
    nome: 'Celulares',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB1051&container_id=MLB779362-1',
    codigo: 'MLB1051',
    emoji: '📲'
  },
  casa_decoracao: {
    nome: 'Casa e Decoração',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB1574&container_id=MLB779362-1',
    codigo: 'MLB1574',
    emoji: '🛋️'
  },
  joias_relogios: {
    nome: 'Joias e Relógios',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB3937&container_id=MLB779362-1',
    codigo: 'MLB3937',
    emoji: '⌚'
  },
  esportes: {
    nome: 'Esportes e Fitness',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB1276&container_id=MLB779362-1',
    codigo: 'MLB1276',
    emoji: '⚽'
  },
  games: {
    nome: 'Games',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB1144&container_id=MLB779362-1',
    codigo: 'MLB1144',
    emoji: '🎮'
  },
  ferramentas: {
    nome: 'Ferramentas',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB263532&container_id=MLB779362-1',
    codigo: 'MLB263532',
    emoji: '🔧'
  },
  calcados_roupas: {
    nome: 'Calçados e Roupas',
    url: 'https://www.mercadolivre.com.br/ofertas?category=MLB1430&container_id=MLB779362-1',
    codigo: 'MLB1430',
    emoji: '👟'
  }
};

/**
 * Retorna todas as categorias disponíveis
 */
function listarCategorias() {
  return Object.keys(CATEGORIAS_ML);
}

/**
 * Retorna informações de uma categoria específica
 */
function getCategoria(chave) {
  return CATEGORIAS_ML[chave] || null;
}

/**
 * Valida se uma categoria existe
 */
function categoriaExiste(chave) {
  return CATEGORIAS_ML.hasOwnProperty(chave);
}

/**
 * Exibe menu formatado de categorias
 */
function exibirMenuCategorias() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║               📂 CATEGORIAS DISPONÍVEIS                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  let contador = 1;
  for (const [chave, info] of Object.entries(CATEGORIAS_ML)) {
    const numero = contador.toString().padStart(2, '0');
    console.log(`  ${numero}. ${info.emoji}  ${info.nome.padEnd(30)} → ${chave}`);
    contador++;
  }
  
  console.log('\n╚════════════════════════════════════════════════════════════════╝\n');
}

/**
 * Divide produtos entre categorias selecionadas
 */
function dividirProdutosPorCategoria(totalProdutos, categoriasSelecionadas) {
  const numCategorias = categoriasSelecionadas.length;
  const produtosPorCategoria = Math.floor(totalProdutos / numCategorias);
  const resto = totalProdutos % numCategorias;
  
  const distribuicao = {};
  
  categoriasSelecionadas.forEach((categoria, index) => {
    // As primeiras categorias recebem o resto da divisão
    distribuicao[categoria] = produtosPorCategoria + (index < resto ? 1 : 0);
  });
  
  return distribuicao;
}

module.exports = {
  CATEGORIAS_ML,
  listarCategorias,
  getCategoria,
  categoriaExiste,
  exibirMenuCategorias,
  dividirProdutosPorCategoria
};