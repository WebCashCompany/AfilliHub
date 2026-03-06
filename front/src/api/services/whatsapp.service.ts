// front/src/api/services/whatsapp.service.ts
import { io, Socket } from 'socket.io-client';
import { ENV } from '@/config/environment';

const API_BASE = ENV.API_BASE_URL;

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
  name: string;
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

  private qrCodeCallback:       ((sessionId: string, qrCode: string) => void) | null = null;
  private connectedCallback:    ((sessionId: string, phoneNumber: string) => void) | null = null;
  private disconnectedCallback: ((sessionId: string, reason: string) => void) | null = null;
  private sessionsUpdateCallback: ((sessions: WhatsAppSession[]) => void) | null = null;

  // Header para contornar a tela de aviso do ngrok no plano gratuito
  private defaultHeaders = {
    'ngrok-skip-browser-warning': 'true',
  };

  constructor() {
    this.initializeSocket();
  }

  // ─── Socket.IO ────────────────────────────────────────────────────────────

  private initializeSocket() {
    this.socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,   // tenta reconectar sempre
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket.IO conectado!');
      this.socket?.emit('sessions:get');

      // Ao reconectar, pede o estado atual da automação
      this.socket?.emit('automation:request-state', { userId: 'default' });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket.IO desconectado:', reason);
    });

    this.socket.on('reconnect', (attempt) => {
      console.log(`🔄 Socket.IO reconectado após ${attempt} tentativa(s)`);
    });

    // QR Code
    this.socket.on('whatsapp:qr', (data: { sessionId: string; qrCode: string }) => {
      console.log('📱 QR Code recebido:', data.sessionId);
      this.qrCodeCallback?.(data.sessionId, data.qrCode);
    });

    // Conectado
    this.socket.on('whatsapp:connected', (data: { sessionId: string; phoneNumber: string; connectedAt: Date }) => {
      console.log('✅ WhatsApp conectado:', data);
      this.connectedCallback?.(data.sessionId, data.phoneNumber);
      this.socket?.emit('sessions:get');
    });

    // Desconectado
    this.socket.on('whatsapp:disconnected', (data: { sessionId: string; reason: string }) => {
      console.log('❌ WhatsApp desconectado:', data);
      this.disconnectedCallback?.(data.sessionId, data.reason);
      this.socket?.emit('sessions:get');
    });

    // Lista de sessões
    this.socket.on('sessions:list', (data: { sessions: WhatsAppSession[] }) => {
      console.log('📋 Sessões atualizadas:', data.sessions?.length ?? 0);
      this.sessionsUpdateCallback?.(data.sessions);
    });
  }

  // ─── Expõe o socket para outros serviços (ex: DistributionPage) ───────────

  getSocket(): Socket | null {
    return this.socket;
  }

  // ─── Callbacks de eventos ─────────────────────────────────────────────────

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

  // ─── Sessões ──────────────────────────────────────────────────────────────

  async connectSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
      body: JSON.stringify({ sessionId }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao conectar sessão');
    return data;
  }

  async disconnectSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
      body: JSON.stringify({ sessionId }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao desconectar sessão');
    this.socket?.emit('sessions:get');
    return data;
  }

  async listSessions(): Promise<WhatsAppSession[]> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/sessions`, {
      headers: this.defaultHeaders,
    });
    const data = await response.json();
    return data.sessions || [];
  }

  async getSessionStatus(sessionId: string): Promise<WhatsAppSession> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/status/${sessionId}`, {
      headers: this.defaultHeaders,
    });
    const data = await response.json();
    return data.session;
  }

  // ─── Grupos ───────────────────────────────────────────────────────────────

  async listGroups(sessionId: string): Promise<WhatsAppGroup[]> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/groups/${sessionId}`, {
      headers: this.defaultHeaders,
    });
    const data = await response.json();
    return data.grupos || [];
  }

  // ─── Envio ────────────────────────────────────────────────────────────────

  async sendOffers(payload: SendOffersPayload): Promise<SendOffersResponse> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/send-offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao enviar ofertas');
    return data;
  }

  async sendTest(sessionId: string, grupoId: string): Promise<SendOffersResponse> {
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
      body: JSON.stringify({ sessionId, grupoId }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao enviar teste');
    return data;
  }

  // ─── Utilitários ──────────────────────────────────────────────────────────

  requestSessionsUpdate() {
    this.socket?.emit('sessions:get');
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;