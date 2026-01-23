// src/api/services/whatsapp.service.ts - CORRIGIDO

import apiClient from '@/api/client';
import type { ApiResponse } from '@/types/api.types';

export interface WhatsAppGroup {
  id: string;
  nome: string;
  participantes: number;
}

export interface WhatsAppStatus {
  conectado: boolean;
  status: 'online' | 'offline';
  clientReady: boolean;
}

export interface SendOffersPayload {
  grupoId: string;
  ofertas: {
    nome: string;
    preco: string;
    desconto: string;
    link: string;
  }[];
}

export interface SendOffersResponse {
  success: boolean;
  mensagem: string;
  grupo?: string;
}

class WhatsAppService {
  private readonly BASE_PATH = '/api/divulgacao'; // ✅ CORRIGIDO

  async connectBot(): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `${this.BASE_PATH}/conectar-bot`
    );
    
    if (!response.success) {
      throw new Error(response.error || 'Erro ao conectar bot');
    }
    
    return response.data!;
  }

  async getStatus(): Promise<WhatsAppStatus> {
    const response = await apiClient.get<WhatsAppStatus>(`${this.BASE_PATH}/status-bot`);
    return response.data || { conectado: false, status: 'offline', clientReady: false };
  }

  async listGroups(): Promise<WhatsAppGroup[]> {
    const response = await apiClient.get<{ success: boolean; grupos: WhatsAppGroup[] }>(
      `${this.BASE_PATH}/listar-grupos`
    );
    return response.data?.grupos || [];
  }

  async sendOffers(payload: SendOffersPayload): Promise<SendOffersResponse> {
    const response = await apiClient.post<SendOffersResponse>(
      `${this.BASE_PATH}/enviar-ofertas`,
      payload
    );
    
    if (!response.success) {
      throw new Error(response.error || 'Erro ao enviar ofertas');
    }
    
    return response.data!;
  }

  async sendTest(grupoId: string): Promise<SendOffersResponse> {
    const response = await apiClient.post<SendOffersResponse>(
      `${this.BASE_PATH}/enviar-teste`,
      { grupoId }
    );
    
    if (!response.success) {
      throw new Error(response.error || 'Erro ao enviar teste');
    }
    
    return response.data!;
  }

  async disconnectBot(): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `${this.BASE_PATH}/desconectar-bot`
    );
    
    if (!response.success) {
      throw new Error(response.error || 'Erro ao desconectar bot');
    }
    
    return response.data!;
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;