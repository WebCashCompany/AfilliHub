// src/api/endpoints.ts

/**
 * ═══════════════════════════════════════════════════════════
 * API ENDPOINTS - CENTRALIZADOS
 * ═══════════════════════════════════════════════════════════
 * 
 * Todas as URLs da API em um único lugar para fácil manutenção.
 */

export const API_ENDPOINTS = {
  // ─────────────────────────────────────────────────────────
  // SCRAPING
  // ─────────────────────────────────────────────────────────
  SCRAPING: {
    START: '/api/scraping/start',
    STATUS: '/api/scraping/status',
    HISTORY: '/api/scraping/history',
  },

  // ─────────────────────────────────────────────────────────
  // PRODUTOS
  // ─────────────────────────────────────────────────────────
  PRODUCTS: {
    LIST: '/api/products',
    GET: (id: string) => `/api/products/${id}`,
    CREATE: '/api/products',
    UPDATE: (id: string) => `/api/products/${id}`,
    DELETE: (id: string) => `/api/products/${id}`,
    BULK_DELETE: '/api/products/bulk-delete',
    SEARCH: '/api/products/search',
    BY_MARKETPLACE: (marketplace: string) => `/api/products/marketplace/${marketplace}`,
  },

  // ─────────────────────────────────────────────────────────
  // ANALYTICS
  // ─────────────────────────────────────────────────────────
  ANALYTICS: {
    OVERVIEW: '/api/analytics/overview',
    BY_MARKETPLACE: '/api/analytics/marketplace',
    BY_CATEGORY: '/api/analytics/category',
    DAILY: '/api/analytics/daily',
  },

  // ─────────────────────────────────────────────────────────
  // HEALTH CHECK
  // ─────────────────────────────────────────────────────────
  HEALTH: '/api/health',
} as const;

export default API_ENDPOINTS;