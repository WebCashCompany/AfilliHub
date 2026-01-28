// front/src/api/services/whatsapp.service.ts
import { io, Socket } from 'socket.io-client';

const API_BASE = 'http://localhost:3001';

export interface WhatsAppSession {
  sessionId: string;
  conectado: boolean;
  status: 'online' | 'offline';
  clientReady: boolean;
  phoneNumber?: string;
  connectedAt?: Date;
}

export interface WhatsAppGroup {
  id: string;
  nome: string;
  participantes: number;
}

export interface SendOffersPayload {
  sessionId: string;
  grupoId: string;
  ofertas: {
    nome: string;
    mensagem: string;
    imagem?: string;
    link: string;
  }[];
}

export interface SendOffersResponse {
  success: boolean;
  mensagem: string;
}

class WhatsAppService {
  private readonly BASE_PATH = '/api/divulgacao';
  private socket: Socket | null = null;
  private qrCodeCallback: ((sessionId: string, qrCode: string) => void) | null = null;
  private connectedCallback: ((sessionId: string, phoneNumber: string) => void) | null = null;
  private disconnectedCallback: ((sessionId: string, reason: string) => void) | null = null;
  private sessionsUpdateCallback: ((sessions: WhatsAppSession[]) => void) | null = null;

  constructor() {
    this.initializeSocket();
  }

  private initializeSocket() {
    this.socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket.IO conectado!');
      // Solicitar lista de sessões ao conectar
      this.socket?.emit('sessions:get');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket.IO desconectado');
    });

    // Receber QR Code
    this.socket.on('whatsapp:qr', (data: { sessionId: string; qrCode: string }) => {
      console.log('📱 QR Code recebido via Socket.IO:', data.sessionId);
      if (this.qrCodeCallback) {
        this.qrCodeCallback(data.sessionId, data.qrCode);
      }
    });

    // Receber notificação de conexão
    this.socket.on('whatsapp:connected', (data: { sessionId: string; phoneNumber: string; connectedAt: Date }) => {
      console.log('✅ WhatsApp conectado via Socket.IO:', data);
      if (this.connectedCallback) {
        this.connectedCallback(data.sessionId, data.phoneNumber);
      }
      // Atualizar lista de sessões
      this.socket?.emit('sessions:get');
    });

    // Receber notificação de desconexão
    this.socket.on('whatsapp:disconnected', (data: { sessionId: string; reason: string }) => {
      console.log('❌ WhatsApp desconectado via Socket.IO:', data);
      if (this.disconnectedCallback) {
        this.disconnectedCallback(data.sessionId, data.reason);
      }
      // Atualizar lista de sessões
      this.socket?.emit('sessions:get');
    });

    // Receber lista de sessões
    this.socket.on('sessions:list', (data: { sessions: WhatsAppSession[] }) => {
      console.log('📋 Lista de sessões atualizada:', data.sessions);
      if (this.sessionsUpdateCallback) {
        this.sessionsUpdateCallback(data.sessions);
      }
    });
  }

  // Callbacks para eventos
  onQRCode(callback: (sessionId: string, qrCode: string) => void) {
    this.qrCodeCallback = callback;
  }

  onConnected(callback: (sessionId: string, phoneNumber: string) => void) {
    this.connectedCallback = callback;
  }

  onDisconnected(callback: (sessionId: string, reason: string) => void) {
    this.disconnectedCallback = callback;
  }

  onSessionsUpdate(callback: (sessions: WhatsAppSession[]) => void) {
    this.sessionsUpdateCallback = callback;
  }

  // Conectar nova sessão
  async connectSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Erro ao conectar sessão');
    }
    
    return data;
  }

  // Desconectar sessão
  async disconnectSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Erro ao desconectar sessão');
    }
    
    // Atualizar lista de sessões
    this.socket?.emit('sessions:get');
    
    return data;
  }

  // Listar todas as sessões
  async listSessions(): Promise<WhatsAppSession[]> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/sessions`);
    const data = await response.json();
    return data.sessions || [];
  }

  // Status de sessão específica
  async getSessionStatus(sessionId: string): Promise<WhatsAppSession> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/status/${sessionId}`);
    const data = await response.json();
    return data.session;
  }

  // Listar grupos de uma sessão
  async listGroups(sessionId: string): Promise<WhatsAppGroup[]> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/groups/${sessionId}`);
    const data = await response.json();
    return data.grupos || [];
  }

  // Enviar ofertas
  async sendOffers(payload: SendOffersPayload): Promise<SendOffersResponse> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/send-offers`, {
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

  // Enviar teste
  async sendTest(sessionId: string, grupoId: string): Promise<SendOffersResponse> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, grupoId })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Erro ao enviar teste');
    }
    
    return data;
  }

  // Solicitar atualização da lista de sessões
  requestSessionsUpdate() {
    this.socket?.emit('sessions:get');
  }

  // Destruir conexão Socket.IO
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;