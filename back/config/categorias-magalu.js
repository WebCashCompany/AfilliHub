// ═══════════════════════════════════════════════════════════
// config/categorias-magalu.js - CONFIGURAÇÃO DE CATEGORIAS
// ═══════════════════════════════════════════════════════════

/**
 * Configuração centralizada das categorias do Magazine Luiza
 * Cada categoria tem: nome, URL base, slug e prioridade
 */

const MAGALU_CATEGORIES = {
  OFERTAS_DIA: {
    name: 'Ofertas do Dia',
    url: 'https://www.magazinevoce.com.br/{affiliateId}/selecao/ofertasdodia/',
    slug: 'ofertas-do-dia',
    priority: 1, // Alta prioridade
    enabled: true
  },
  
  INTERNACIONAL: {
    name: 'Internacional',
    url: 'https://www.magazinevoce.com.br/{affiliateId}/selecao/crossborderatualizacao/',
    slug: 'internacional',
    priority: 2,
    enabled: true
  },
  
  CASA: {
    name: 'Casa',
    url: 'https://especiais.magazineluiza.com.br/mundo-casa/',
    slug: 'casa',
    priority: 3,
    enabled: true
  },
  
  FERRAMENTAS: {
    name: 'Ferramentas',
    url: 'https://www.magazinevoce.com.br/{affiliateId}/ferramentas/l/fs/',
    slug: 'ferramentas',
    priority: 4,
    enabled: true
  },
  
  ELETROPORTATEIS: {
    name: 'Eletroportáteis',
    url: 'https://www.magazinevoce.com.br/{affiliateId}/eletroportateis/l/ep/',
    slug: 'eletroportateis',
    priority: 5,
    enabled: true
  },
  
  BRINQUEDOS: {
    name: 'Brinquedos',
    url: 'https://www.magazineluiza.com.br/selecao/diadascriancas_principal/',
    slug: 'brinquedos',
    priority: 6,
    enabled: true
  },
  
  AUTOMOTIVO: {
    name: 'Automotivo',
    url: 'https://www.magazinevoce.com.br/{affiliateId}/automotivo/l/au/',
    slug: 'automotivo',
    priority: 7,
    enabled: true
  },
  
  DOMESTICOS: {
    name: 'Domésticos',
    url: 'https://www.magazinevoce.com.br/{affiliateId}/utilidades-domesticas/l/ud/',
    slug: 'domesticos',
    priority: 8,
    enabled: true
  }
};

/**
 * Retorna a URL formatada com o ID de afiliado
 * @param {string} categoryKey - Chave da categoria (ex: 'OFERTAS_DIA')
 * @param {string} affiliateId - ID do afiliado
 * @param {number} page - Número da página (opcional)
 * @returns {string} URL completa
 */
function getCategoryUrl(categoryKey, affiliateId, page = 1) {
  const category = MAGALU_CATEGORIES[categoryKey];
  
  if (!category) {
    throw new Error(`Categoria "${categoryKey}" não encontrada`);
  }
  
  let url = category.url.replace('{affiliateId}', affiliateId);
  
  // Adiciona paginação se a URL suportar
  if (url.includes('magazinevoce.com.br') && page > 1) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}page=${page}`;
  }
  
  return url;
}

/**
 * Retorna informações de uma categoria pelo slug
 * @param {string} slug - Slug da categoria
 * @returns {Object|null} Dados da categoria ou null
 */
function getCategoryBySlug(slug) {
  for (const [key, category] of Object.entries(MAGALU_CATEGORIES)) {
    if (category.slug === slug) {
      return { key, ...category };
    }
  }
  return null;
}

/**
 * Retorna lista de todas as categorias habilitadas
 * @returns {Array} Array de categorias ordenadas por prioridade
 */
function getEnabledCategories() {
  return Object.entries(MAGALU_CATEGORIES)
    .filter(([_, cat]) => cat.enabled)
    .map(([key, cat]) => ({ key, ...cat }))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Retorna apenas os slugs das categorias (para enum do schema)
 * @returns {Array<string>}
 */
function getCategorySlugs() {
  return Object.values(MAGALU_CATEGORIES).map(cat => cat.slug);
}

/**
 * Valida se uma categoria existe
 * @param {string} categoryKey - Chave da categoria
 * @returns {boolean}
 */
function isValidCategory(categoryKey) {
  return categoryKey in MAGALU_CATEGORIES;
}

/**
 * Retorna estatísticas das categorias
 * @returns {Object}
 */
function getCategoryStats() {
  const total = Object.keys(MAGALU_CATEGORIES).length;
  const enabled = getEnabledCategories().length;
  
  return {
    total,
    enabled,
    disabled: total - enabled,
    categories: MAGALU_CATEGORIES
  };
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  MAGALU_CATEGORIES,
  getCategoryUrl,
  getCategoryBySlug,
  getEnabledCategories,
  getCategorySlugs,
  isValidCategory,
  getCategoryStats
};

// ═══════════════════════════════════════════════════════════
// EXEMPLO DE USO:
// ═══════════════════════════════════════════════════════════

/*
const { 
  getCategoryUrl, 
  getEnabledCategories, 
  getCategoryBySlug 
} = require('./categorias-magalu');

// Obter URL de uma categoria
const url = getCategoryUrl('OFERTAS_DIA', 'magazinepromoforia', 2);
console.log(url);
// → "https://www.magazinevoce.com.br/magazinepromoforia/selecao/ofertasdodia/?page=2"

// Listar categorias habilitadas
const categories = getEnabledCategories();
console.log(categories);
// → [{ key: 'OFERTAS_DIA', name: 'Ofertas do Dia', ... }, ...]

// Buscar categoria por slug
const category = getCategoryBySlug('ferramentas');
console.log(category);
// → { key: 'FERRAMENTAS', name: 'Ferramentas', ... }
*/