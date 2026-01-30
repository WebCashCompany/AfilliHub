// ═══════════════════════════════════════════════════════════
// config/categorias-amazon.js - CONFIGURAÇÃO DE CATEGORIAS AMAZON
// ═══════════════════════════════════════════════════════════

/**
 * Configuração centralizada das categorias da Amazon Brasil
 * Cada categoria tem: nome, URL base, slug, prioridade
 */

const AMAZON_CATEGORIES = {
  OFERTAS_DIA: {
    name: 'Ofertas do Dia',
    url: 'https://www.amazon.com.br/gp/bestsellers/kitchen/ref=zg_bs_kitchen_sm',
    slug: 'ofertas-do-dia',
    priority: 1,
    enabled: true
  },
  
  MAIS_VENDIDOS: {
    name: 'Mais Vendidos',
    url: 'https://www.amazon.com.br/gp/bestsellers/?ref_=nav_cs_bestsellers',
    slug: 'mais-vendidos',
    priority: 2,
    enabled: true
  },

  // ═══════════════════════════════════════════════════════════
  // 🏠 CASA E COZINHA - COM SUBCATEGORIAS
  // ═══════════════════════════════════════════════════════════
  CASA_UTILIDADES: {
    name: 'Casa - Utilidades',
    categoryName: 'Casa', 
    url: 'https://www.amazon.com.br/b?node=16209051011',
    slug: 'casa-utilidades',
    priority: 3,
    enabled: true,
    isSubcategory: true,
    parentCategory: 'CASA'
  },
  
  CASA_COZINHA: {
    name: 'Casa - Cozinha',
    categoryName: 'Casa',
    url: 'https://www.amazon.com.br/b?node=17124665011',
    slug: 'casa-cozinha',
    priority: 3,
    enabled: true,
    isSubcategory: true,
    parentCategory: 'CASA'
  },

  CASA_DECORACAO: {
    name: 'Casa - Decoração',
    categoryName: 'Casa',
    url: 'https://www.amazon.com.br/b?node=17124681011',
    slug: 'casa-decoracao',
    priority: 3,
    enabled: true,
    isSubcategory: true,
    parentCategory: 'CASA'
  },
  
  // ═══════════════════════════════════════════════════════════
  // 🔌 TECNOLOGIA
  // ═══════════════════════════════════════════════════════════
  ELECTRONICS: {
    name: 'Eletrônicos',
    url: 'https://www.amazon.com.br/b?node=16209062011',
    slug: 'eletronicos',
    priority: 4,
    enabled: true
  },

  INFORMATICA: {
    name: 'Informática',
    url: 'https://www.amazon.com.br/b?node=16339926011',
    slug: 'informatica',
    priority: 5,
    enabled: true
  },

  BELEZA: {
    name: 'Beleza',
    url: 'https://www.amazon.com.br/b?node=16209031011',
    slug: 'beleza',
    priority: 6,
    enabled: true
  },

  BRINQUEDOS: {
    name: 'Brinquedos',
    url: 'https://www.amazon.com.br/b?node=16253455011',
    slug: 'brinquedos',
    priority: 7,
    enabled: true
  },

  FERRAMENTAS: {
    name: 'Ferramentas',
    url: 'https://www.amazon.com.br/b?node=16209055011',
    slug: 'ferramentas',
    priority: 8,
    enabled: true
  }
};

/**
 * Retorna a URL formatada com a Tag de Afiliado
 * @param {string} categoryKey - Chave da categoria
 * @param {string} affiliateTag - Tag de associado Amazon
 * @param {number} page - Número da página
 * @returns {string} URL completa
 */
function getCategoryUrl(categoryKey, affiliateTag, page = 1) {
  const category = AMAZON_CATEGORIES[categoryKey];
  if (!category) {
    throw new Error(`Categoria "${categoryKey}" não encontrada na Amazon`);
  }
  
  let url = category.url;
  const separator = url.includes('?') ? '&' : '?';
  
  // Amazon usa o parâmetro 'tag' para afiliados
  url = `${url}${separator}tag=${affiliateTag}`;
  
  if (page > 1) {
    url = `${url}&page=${page}`;
  }
  
  return url;
}

/**
 * Retorna o nome da categoria principal (para salvar no banco)
 */
function getCategoryName(categoryKey) {
  const category = AMAZON_CATEGORIES[categoryKey];
  if (!category) {
    return 'Ofertas do Dia';
  }
  return category.categoryName || category.name;
}

/**
 * Retorna informações de uma categoria pelo slug
 */
function getCategoryBySlug(slug) {
  for (const [key, category] of Object.entries(AMAZON_CATEGORIES)) {
    if (category.slug === slug) {
      return { key, ...category };
    }
  }
  return null;
}

/**
 * Retorna lista de todas as categorias habilitadas ordenadas
 */
function getEnabledCategories() {
  return Object.entries(AMAZON_CATEGORIES)
    .filter(([_, cat]) => cat.enabled)
    .map(([key, cat]) => ({ key, ...cat }))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Retorna lista de categorias principais (sem subcategorias)
 */
function getMainCategories() {
  return Object.entries(AMAZON_CATEGORIES)
    .filter(([_, cat]) => cat.enabled && !cat.isSubcategory)
    .map(([key, cat]) => ({ key, ...cat }))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Retorna subcategorias de uma categoria pai
 */
function getSubcategories(parentKey) {
  return Object.entries(AMAZON_CATEGORIES)
    .filter(([_, cat]) => cat.enabled && cat.isSubcategory && cat.parentCategory === parentKey)
    .map(([key, cat]) => ({ key, ...cat }));
}

/**
 * Retorna apenas os slugs das categorias
 */
function getCategorySlugs() {
  return Object.values(AMAZON_CATEGORIES).map(cat => cat.slug);
}

/**
 * Retorna apenas os nomes ÚNICOS das categorias principais
 */
function getUniqueCategoryNames() {
  const names = new Set();
  Object.values(AMAZON_CATEGORIES).forEach(cat => {
    names.add(cat.categoryName || cat.name);
  });
  return Array.from(names);
}

/**
 * Valida se uma categoria existe
 */
function isValidCategory(categoryKey) {
  return categoryKey in AMAZON_CATEGORIES;
}

/**
 * Retorna estatísticas das categorias
 */
function getCategoryStats() {
  const total = Object.keys(AMAZON_CATEGORIES).length;
  const enabled = getEnabledCategories().length;
  const main = getMainCategories().length;
  const subcategories = enabled - main;

  return {
    total,
    enabled,
    disabled: total - enabled,
    main,
    subcategories,
    categories: AMAZON_CATEGORIES
  };
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  AMAZON_CATEGORIES,
  getCategoryUrl,
  getCategoryName,
  getCategoryBySlug,
  getEnabledCategories,
  getMainCategories,
  getSubcategories,
  getCategorySlugs,
  getUniqueCategoryNames,
  isValidCategory,
  getCategoryStats
};