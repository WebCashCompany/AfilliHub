// front/src/api/services/whatsapp.service.ts
import { io, Socket } from 'socket.io-client';
import { ENV } from '@/config/environment';
import { supabase } from '@/lib/supabase';

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

// ── Helper: retorna headers com JWT + ngrok ────────────────────────────────
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

class WhatsAppService {
  private readonly BASE_PATH = '/api/divulgacao';
  private socket: Socket | null = null;

  private qrCodeCallback:         ((sessionId: string, qrCode: string) => void) | null = null;
  private connectedCallback:      ((sessionId: string, phoneNumber: string) => void) | null = null;
  private disconnectedCallback:   ((sessionId: string, reason: string) => void) | null = null;
  private sessionsUpdateCallback: ((sessions: WhatsAppSession[]) => void) | null = null;

  constructor() {
    this.initializeSocket();
  }

  // ─── Socket.IO ────────────────────────────────────────────────────────────

  private async initializeSocket() {
    // Busca o token antes de criar o socket
    let token = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || '';
    } catch (e) {
      console.warn('⚠️ [WhatsAppService] Não foi possível obter token JWT:', e);
    }

    this.socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: { token }, // ← token no handshake para entrar na room do usuário
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket.IO conectado!');
      this.socket?.emit('sessions:get');
      this.socket?.emit('automation:request-state', {});
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket.IO desconectado:', reason);
    });

    this.socket.on('reconnect', (attempt) => {
      console.log(`🔄 Socket.IO reconectado após ${attempt} tentativa(s)`);
    });

    this.socket.on('whatsapp:qr', (data: { sessionId: string; qrCode: string }) => {
      console.log('📱 QR Code recebido:', data.sessionId);
      this.qrCodeCallback?.(data.sessionId, data.qrCode);
    });

    this.socket.on('whatsapp:connected', (data: { sessionId: string; phoneNumber: string; connectedAt: Date }) => {
      console.log('✅ WhatsApp conectado:', data);
      this.connectedCallback?.(data.sessionId, data.phoneNumber);
      this.socket?.emit('sessions:get');
    });

    this.socket.on('whatsapp:disconnected', (data: { sessionId: string; reason: string }) => {
      console.log('❌ WhatsApp desconectado:', data);
      this.disconnectedCallback?.(data.sessionId, data.reason);
      this.socket?.emit('sessions:get');
    });

    this.socket.on('sessions:list', (data: { sessions: WhatsAppSession[] }) => {
      console.log('📋 Sessões atualizadas:', data.sessions?.length ?? 0);
      this.sessionsUpdateCallback?.(data.sessions);
    });
  }

  // ─── Expõe o socket ───────────────────────────────────────────────────────

  getSocket(): Socket | null {
    return this.socket;
  }

  // ─── Callbacks ────────────────────────────────────────────────────────────

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
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao conectar sessão');
    return data;
  }

  async disconnectSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/disconnect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao desconectar sessão');
    this.socket?.emit('sessions:get');
    return data;
  }

  async listSessions(): Promise<WhatsAppSession[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/sessions`, { headers });
    const data = await response.json();
    return data.sessions || [];
  }

  async getSessionStatus(sessionId: string): Promise<WhatsAppSession> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/status/${sessionId}`, { headers });
    const data = await response.json();
    return data.session;
  }

  // ─── Grupos ───────────────────────────────────────────────────────────────

  async listGroups(sessionId: string): Promise<WhatsAppGroup[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/groups/${sessionId}`, { headers });
    const data = await response.json();
    return data.grupos || [];
  }

  // ─── Envio ────────────────────────────────────────────────────────────────

  async sendOffers(payload: SendOffersPayload): Promise<SendOffersResponse> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/send-offers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao enviar ofertas');
    return data;
  }

  async sendTest(sessionId: string, grupoId: string): Promise<SendOffersResponse> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}${this.BASE_PATH}/send-test`, {
      method: 'POST',
      headers,
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