// ═══════════════════════════════════════════════════════════
// config/categorias-magalu.js - CONFIGURAÇÃO DE CATEGORIAS
// ═══════════════════════════════════════════════════════════

/**
 * Configuração centralizada das categorias do Magazine Luiza
 * Cada categoria tem: nome, URL base, slug, prioridade
 * Algumas categorias têm SUBCATEGORIAS que compartilham a mesma categoria principal
 */

const MAGALU_CATEGORIES = {
  OFERTAS_DIA: {
    name: 'Ofertas do Dia',
    url: 'https://www.magazinevoce.com.br/{affiliateId}/selecao/ofertasdodia/',
    slug: 'ofertas-do-dia',
    priority: 1,
    enabled: true
  },
  
  INTERNACIONAL: {
    name: 'Internacional',
    url: 'https://www.magazinevoce.com.br/{affiliateId}/selecao/crossborderatualizacao/',
    slug: 'internacional',
    priority: 2,
    enabled: true
  },
  
  // ═══════════════════════════════════════════════════════════
  // 🏠 CASA - COM SUBCATEGORIAS
  // ═══════════════════════════════════════════════════════════
  CASA_UTILIDADES: {
    name: 'Casa - Utilidades',
    categoryName: 'Casa', // 🆕 Nome da categoria principal no banco
    url: 'https://www.magazinevoce.com.br/{affiliateId}/utilidades-domesticas/l/ud/',
    slug: 'casa-utilidades',
    priority: 3,
    enabled: true,
    isSubcategory: true, // 🆕 Flag de subcategoria
    parentCategory: 'CASA'
  },
  
  CASA_CONSTRUCAO: {
    name: 'Casa - Construção',
    categoryName: 'Casa', // 🆕 Mesma categoria principal
    url: 'https://www.magazinevoce.com.br/{affiliateId}/casa-e-construcao/l/cj/',
    slug: 'casa-construcao',
    priority: 3,
    enabled: true,
    isSubcategory: true,
    parentCategory: 'CASA'
  },
  
  CASA_MOVEIS: {
    name: 'Casa - Móveis',
    categoryName: 'Casa', // 🆕 Mesma categoria principal
    url: 'https://www.magazinevoce.com.br/{affiliateId}/moveis/l/mo/',
    slug: 'casa-moveis',
    priority: 3,
    enabled: true,
    isSubcategory: true,
    parentCategory: 'CASA'
  },
  // ═══════════════════════════════════════════════════════════
  
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
 * @param {string} categoryKey - Chave da categoria (ex: 'OFERTAS_DIA', 'CASA_UTILIDADES')
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
 * 🆕 Retorna o nome da categoria principal (para salvar no banco)
 * @param {string} categoryKey - Chave da categoria
 * @returns {string} Nome da categoria principal
 */
function getCategoryName(categoryKey) {
  const category = MAGALU_CATEGORIES[categoryKey];
  
  if (!category) {
    return 'Ofertas do Dia'; // Default
  }
  
  // Se tem categoryName definido (subcategoria), usa ele
  // Senão, usa o name normal
  return category.categoryName || category.name;
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
 * 🆕 Retorna lista de categorias principais (sem subcategorias)
 * @returns {Array} Array de categorias principais
 */
function getMainCategories() {
  return Object.entries(MAGALU_CATEGORIES)
    .filter(([_, cat]) => cat.enabled && !cat.isSubcategory)
    .map(([key, cat]) => ({ key, ...cat }))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * 🆕 Retorna subcategorias de uma categoria pai
 * @param {string} parentKey - Chave da categoria pai (ex: 'CASA')
 * @returns {Array} Array de subcategorias
 */
function getSubcategories(parentKey) {
  return Object.entries(MAGALU_CATEGORIES)
    .filter(([_, cat]) => cat.enabled && cat.isSubcategory && cat.parentCategory === parentKey)
    .map(([key, cat]) => ({ key, ...cat }));
}

/**
 * Retorna apenas os slugs das categorias (para enum do schema)
 * @returns {Array<string>}
 */
function getCategorySlugs() {
  return Object.values(MAGALU_CATEGORIES).map(cat => cat.slug);
}

/**
 * 🆕 Retorna apenas os nomes PRINCIPAIS das categorias (sem duplicatas)
 * Para usar no enum do schema
 * @returns {Array<string>}
 */
function getUniqueCategoryNames() {
  const names = new Set();
  
  Object.values(MAGALU_CATEGORIES).forEach(cat => {
    // Se tem categoryName (subcategoria), adiciona ele
    // Senão, adiciona o name normal
    names.add(cat.categoryName || cat.name);
  });
  
  return Array.from(names);
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
  const main = getMainCategories().length;
  const subcategories = enabled - main;
  
  return {
    total,
    enabled,
    disabled: total - enabled,
    main,
    subcategories,
    categories: MAGALU_CATEGORIES
  };
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  MAGALU_CATEGORIES,
  getCategoryUrl,
  getCategoryName, // 🆕
  getCategoryBySlug,
  getEnabledCategories,
  getMainCategories, // 🆕
  getSubcategories, // 🆕
  getCategorySlugs,
  getUniqueCategoryNames, // 🆕
  isValidCategory,
  getCategoryStats
};
