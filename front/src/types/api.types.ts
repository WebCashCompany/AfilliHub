// src/types/api.types.ts

/**
 * ═══════════════════════════════════════════════════════════
 * TIPOS DA API - TYPE-SAFE RESPONSES
 * ═══════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────
// RESPONSE PADRÃO
// ─────────────────────────────────────────────────────────

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: any;
}

// ─────────────────────────────────────────────────────────
// PRODUTO
// ─────────────────────────────────────────────────────────

export interface ProductFromDB {
  _id: string;
  nome: string;
  nome_normalizado?: string;
  imagem: string;
  link_original: string;
  link_afiliado: string;
  preco: string;
  preco_anterior: string;
  preco_de: string;
  preco_para: string;
  desconto: string;
  categoria: string;
  avaliacao?: string;
  numero_avaliacoes?: string;
  frete?: string;
  parcelas?: string;
  vendedor?: string;
  porcentagem_vendido?: string;
  tempo_restante?: string;
  marketplace: 'ML' | 'Amazon' | 'Magalu' | 'Shopee';
  ultima_verificacao?: Date;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ─────────────────────────────────────────────────────────
// SCRAPING
// ─────────────────────────────────────────────────────────

export interface ScrapingRequestPayload {
  marketplaces: {
    mercadolivre?: { enabled: boolean; quantity: number };
    amazon?: { enabled: boolean; quantity: number };
    magalu?: { enabled: boolean; quantity: number };
    shopee?: { enabled: boolean; quantity: number };
  };
  minDiscount: number;
  maxPrice: number;
  filters?: {
    categoria?: string;
    palavraChave?: string;
    frete_gratis?: boolean;
  };
}

export interface ScrapingResult {
  collected: number;
  saved: number;
}

export interface ScrapingResponse {
  total: number;
  byMarketplace: {
    mercadolivre?: ScrapingResult;
    amazon?: ScrapingResult;
    magalu?: ScrapingResult;
    shopee?: ScrapingResult;
  };
}

// ─────────────────────────────────────────────────────────
// PRODUTOS - LIST/SEARCH
// ─────────────────────────────────────────────────────────

export interface ProductsListParams {
  marketplace?: 'ML' | 'shopee' | 'magalu' | 'amazon';
  categoria?: string;
  isActive?: boolean;
  limit?: number;
  skip?: number;
  minDiscount?: number;
  maxPrice?: number;
  search?: string;
}

export interface ProductsListResponse {
  products: ProductFromDB[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ─────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────

export interface AnalyticsResponse {
  totalProducts: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  byMarketplace: {
    marketplace: string;
    products: number;
    clicks: number;
    conversions: number;
    revenue: number;
  }[];
  byCategory: {
    category: string;
    products: number;
    clicks: number;
    revenue: number;
  }[];
}