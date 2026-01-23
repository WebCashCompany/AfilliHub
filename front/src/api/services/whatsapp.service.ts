// src/api/services/whatsapp.service.ts
// VERSÃO SIMPLIFICADA COM FETCH DIRETO

const API_BASE = 'http://localhost:3001';

export interface WhatsAppGroup {
  id: string;
  nome: string;
  participantes: number;
}

export interface WhatsAppStatus {
  conectado: boolean;
  status: 'online' | 'offline';
  clientReady: boolean;
  qrCode?: string;
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
  private readonly BASE_PATH = '/api/divulgacao';

  async connectBot(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/conectar-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    console.log('🔌 Connect Response:', data);
    
    if (!data.success) {
      throw new Error(data.error || 'Erro ao conectar bot');
    }
    
    return data;
  }

  async getStatus(): Promise<WhatsAppStatus> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/status-bot`);
    const data = await response.json();
    
    console.log('📊 Status Response:', data);
    
    return {
      conectado: data.conectado || false,
      status: data.status || 'offline',
      clientReady: data.clientReady || false,
      qrCode: data.qrCode || undefined
    };
  }

  async listGroups(): Promise<WhatsAppGroup[]> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/listar-grupos`);
    const data = await response.json();
    return data.grupos || [];
  }

  async sendOffers(payload: SendOffersPayload): Promise<SendOffersResponse> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/enviar-ofertas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Erro ao enviar ofertas');
    }
    
    return data;
  }

  async sendTest(grupoId: string): Promise<SendOffersResponse> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/enviar-teste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupoId })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Erro ao enviar teste');
    }
    
    return data;
  }

  async disconnectBot(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/desconectar-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Erro ao desconectar bot');
    }
    
    return data;
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;