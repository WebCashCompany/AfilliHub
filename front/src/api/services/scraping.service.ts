// src/api/services/scraping.service.ts

/**
 * ═══════════════════════════════════════════════════════════
 * SCRAPING SERVICE
 * ═══════════════════════════════════════════════════════════
 * 
 * Serviço para operações de scraping de produtos.
 */

import { apiClient } from '../client';
import { API_ENDPOINTS } from '../endpoints';
import type {
  ApiResponse,
  ScrapingRequestPayload,
  ScrapingResponse,
} from '@/types/api.types';

class ScrapingService {
  /**
   * Inicia processo de scraping
   */
  async start(payload: ScrapingRequestPayload): Promise<ApiResponse<ScrapingResponse>> {
    return apiClient.post<ScrapingResponse>(API_ENDPOINTS.SCRAPING.START, payload);
  }

  /**
   * Obtém status atual do scraping
   */
  async getStatus(): Promise<ApiResponse<any>> {
    return apiClient.get(API_ENDPOINTS.SCRAPING.STATUS);
  }

  /**
   * Obtém histórico de execuções
   */
  async getHistory(limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get(API_ENDPOINTS.SCRAPING.HISTORY, { limit });
  }
}

export const scrapingService = new ScrapingService();

export default scrapingService;