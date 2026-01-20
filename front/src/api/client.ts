// src/api/client.ts

/**
 * ═══════════════════════════════════════════════════════════
 * API CLIENT - AXIOS INSTANCE
 * ═══════════════════════════════════════════════════════════
 * 
 * Cliente HTTP centralizado com interceptors e tratamento
 * de erros automático.
 */

import ENV from '@/config/environment';
import type { ApiError, ApiResponse } from '@/types/api.types';

// ─────────────────────────────────────────────────────────
// CLASSE DO CLIENTE API
// ─────────────────────────────────────────────────────────

class ApiClient {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = ENV.API_BASE_URL;
    this.timeout = ENV.API_TIMEOUT;
  }

  /**
   * Faz requisição HTTP genérica
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse JSON
      const data = await response.json().catch(() => null);

      // Erro HTTP
      if (!response.ok) {
        throw {
          message: data?.error || data?.message || 'Erro na requisição',
          status: response.status,
          details: data,
        } as ApiError;
      }

      return data as ApiResponse<T>;

    } catch (error: any) {
      // Timeout
      if (error.name === 'AbortError') {
        throw {
          message: 'Tempo de requisição excedido',
          code: 'TIMEOUT',
        } as ApiError;
      }

      // Erro de rede
      if (!navigator.onLine) {
        throw {
          message: 'Sem conexão com a internet',
          code: 'NETWORK_ERROR',
        } as ApiError;
      }

      // Repassa erro já formatado
      if (error.message && error.status) {
        throw error as ApiError;
      }

      // Erro genérico
      throw {
        message: 'Erro ao conectar com o servidor',
        code: 'UNKNOWN_ERROR',
        details: error,
      } as ApiError;
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    let url = endpoint;
    
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      url += `?${searchParams.toString()}`;
    }

    return this.request<T>(url, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
}

// ─────────────────────────────────────────────────────────
// EXPORTAR INSTÂNCIA SINGLETON
// ─────────────────────────────────────────────────────────

export const apiClient = new ApiClient();

export default apiClient;