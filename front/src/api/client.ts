// src/api/client.ts

/**
 * ═══════════════════════════════════════════════════════════
 * API CLIENT
 * ═══════════════════════════════════════════════════════════
 *
 * Cliente HTTP centralizado.
 * Injeta automaticamente o JWT do Supabase em todo request,
 * garantindo isolamento de dados por usuário no backend.
 */

import ENV from '@/config/environment';
import { supabase } from '@/lib/supabase';
import type { ApiError, ApiResponse } from '@/types/api.types';

class ApiClient {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = ENV.API_BASE_URL;
    this.timeout = ENV.API_TIMEOUT;
  }

  /**
   * Retorna o JWT do usuário autenticado.
   * Lança erro se não houver sessão ativa.
   */
  private async getAuthHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw {
        message: 'Não autenticado. Faça login novamente.',
        code: 'UNAUTHORIZED',
        status: 401,
      } as ApiError;
    }

    return { Authorization: `Bearer ${session.access_token}` };
  }

  /**
   * Faz requisição HTTP genérica com autenticação automática
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    const authHeader = await this.getAuthHeader();

    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...authHeader,
        ...options.headers,
      },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, { ...config, signal: controller.signal });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw {
          message: data?.error || data?.message || 'Erro na requisição',
          status: response.status,
          details: data,
        } as ApiError;
      }

      return data as ApiResponse<T>;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw { message: 'Tempo de requisição excedido', code: 'TIMEOUT' } as ApiError;
      }
      if (!navigator.onLine) {
        throw { message: 'Sem conexão com a internet', code: 'NETWORK_ERROR' } as ApiError;
      }
      if (error.message && error.status) throw error as ApiError;
      throw { message: 'Erro ao conectar com o servidor', code: 'UNKNOWN_ERROR', details: error } as ApiError;
    }
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) searchParams.append(key, String(value));
      });
      url += `?${searchParams.toString()}`;
    }
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(data) });
  }
}

export const apiClient = new ApiClient();
export default apiClient;