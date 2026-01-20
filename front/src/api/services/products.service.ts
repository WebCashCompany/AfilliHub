// src/api/services/products.service.ts - ATUALIZADO

import { apiClient } from '../client';
import { API_ENDPOINTS } from '../endpoints';
import type {
  ApiResponse,
  ProductsListParams,
  ProductsListResponse,
  ProductFromDB,
} from '@/types/api.types';

class ProductsService {
  /**
   * Lista produtos com filtros
   */
  async list(params?: ProductsListParams): Promise<ApiResponse<ProductsListResponse>> {
    return apiClient.get<ProductsListResponse>(API_ENDPOINTS.PRODUCTS.LIST, params);
  }

  /**
   * Busca produtos por termo
   */
  async search(term: string, params?: ProductsListParams): Promise<ApiResponse<ProductsListResponse>> {
    return apiClient.get<ProductsListResponse>(API_ENDPOINTS.PRODUCTS.SEARCH, {
      q: term,
      ...params,
    });
  }

  /**
   * Obtém produto por ID
   */
  async getById(id: string): Promise<ApiResponse<ProductFromDB>> {
    return apiClient.get<ProductFromDB>(API_ENDPOINTS.PRODUCTS.GET(id));
  }

  /**
   * Lista produtos por marketplace
   */
  async getByMarketplace(
    marketplace: 'ML' | 'shopee' | 'magalu' | 'amazon',
    params?: ProductsListParams
  ): Promise<ApiResponse<ProductsListResponse>> {
    return apiClient.get<ProductsListResponse>(
      API_ENDPOINTS.PRODUCTS.BY_MARKETPLACE(marketplace),
      params
    );
  }

  /**
   * Cria novo produto
   */
  async create(data: Partial<ProductFromDB>): Promise<ApiResponse<ProductFromDB>> {
    return apiClient.post<ProductFromDB>(API_ENDPOINTS.PRODUCTS.CREATE, data);
  }

  /**
   * Atualiza produto
   */
  async update(id: string, data: Partial<ProductFromDB>): Promise<ApiResponse<ProductFromDB>> {
    return apiClient.put<ProductFromDB>(API_ENDPOINTS.PRODUCTS.UPDATE(id), data);
  }

  /**
   * Deleta produto único
   */
  async delete(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete(API_ENDPOINTS.PRODUCTS.DELETE(id));
  }

  /**
   * Deleta múltiplos produtos
   */
  async bulkDelete(ids: string[]): Promise<ApiResponse<{ deleted: number }>> {
    return apiClient.post<{ deleted: number }>('/api/products/bulk-delete', { ids });
  }

  /**
   * Deleta todos os produtos
   */
  async deleteAll(): Promise<ApiResponse<{ deleted: number; byMarketplace: Record<string, number> }>> {
    return apiClient.delete<{ deleted: number; byMarketplace: Record<string, number> }>('/api/products/cleanup/all');
  }

  /**
   * Deleta produtos de um marketplace específico
   */
  async deleteByMarketplace(marketplace: 'ML' | 'shopee' | 'amazon' | 'magalu'): Promise<ApiResponse<{ deleted: number }>> {
    return apiClient.delete<{ deleted: number }>(`/api/products/marketplace/${marketplace}`);
  }

  /**
   * Deleta produtos antigos
   */
  async deleteOld(days: number): Promise<ApiResponse<{ deleted: number; byMarketplace: Record<string, number> }>> {
    return apiClient.post<{ deleted: number; byMarketplace: Record<string, number> }>('/api/products/cleanup/old', { days });
  }
}

export const productsService = new ProductsService();

export default productsService;