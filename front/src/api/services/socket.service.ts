// front/src/api/services/socket.service.ts
import { io, Socket } from 'socket.io-client';
import { ENV } from '@/config/environment';
import { supabase } from '@/lib/supabase';

class SocketService {
  private socket: Socket | null = null;
  private callbacks: Map<string, Function[]> = new Map();
  private reconnectInterval: NodeJS.Timeout | null = null;

  async connect() {
    if (this.socket?.connected) {
      console.log('✅ Socket já está conectado');
      return;
    }

    let token = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || '';
    } catch (e) {
      console.warn('⚠️ [Socket] Não foi possível obter token JWT:', e);
    }

    const BACKEND_URL = ENV.API_BASE_URL.replace(/\/api$/, '');
    console.log('🔌 Conectando Socket.IO em:', BACKEND_URL);

    this.socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
      withCredentials: true,
      auth: { token },
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket.IO conectado! ID:', this.socket?.id);

      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }

      this.emit('sessions:get', {});
      this.emit('whatsapp:request-sessions', {});

      // ── NOVO: notifica listeners externos que o socket conectou ──────
      // Usado pelo DistributionPage para re-pedir o estado da automação
      this.triggerCallbacks('connect', {});
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Erro ao conectar Socket.IO:', error.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket.IO desconectado:', reason);

      if (!this.reconnectInterval) {
        this.reconnectInterval = setInterval(() => {
          if (!this.socket?.connected) {
            console.log('🔄 Tentando reconectar...');
            this.socket?.connect();
          }
        }, 3000);
      }
    });

    // ═══════════════════════════════════════════════════════════
    // EVENTOS DO WHATSAPP
    // ═══════════════════════════════════════════════════════════

    this.socket.on('whatsapp:qr', (data: { sessionId: string; qrCode: string }) => {
      console.log('📱 [BROADCAST] QR Code recebido:', data.sessionId);
      this.triggerCallbacks('whatsapp:qr', data);
    });

    this.socket.on('whatsapp:connected', (data: { sessionId: string; phoneNumber: string; connectedAt: Date }) => {
      console.log('✅ [BROADCAST] Sessão conectada:', data.sessionId, data.phoneNumber);
      this.triggerCallbacks('whatsapp:connected', data);
    });

    this.socket.on('whatsapp:disconnected', (data: { sessionId: string; reason: string }) => {
      console.log('❌ [BROADCAST] Sessão desconectada:', data.sessionId, data.reason);
      this.triggerCallbacks('whatsapp:disconnected', data);
    });

    this.socket.on('whatsapp:sessions-update', (data: { sessions: any[] }) => {
      console.log('📋 [BROADCAST] Sessões atualizadas:', data.sessions?.length || 0, 'sessões');
      this.triggerCallbacks('whatsapp:sessions-update', data);
    });

    this.socket.on('sessions:list', (data: { sessions: any[] }) => {
      console.log('📋 Lista de sessões recebida:', data.sessions?.length || 0);
      this.triggerCallbacks('whatsapp:sessions-update', data);
    });

    this.socket.on('whatsapp:sessions-list', (data: { sessions: any[] }) => {
      console.log('📋 Lista de sessões recebida (alias):', data.sessions?.length || 0);
      this.triggerCallbacks('whatsapp:sessions-update', data);
    });

    this.socket.on('whatsapp:offer-sent', (data: { sessionId: string; groupId: string; offerName: string }) => {
      console.log('✅ [BROADCAST] Oferta enviada:', data);
      this.triggerCallbacks('whatsapp:offer-sent', data);
    });

    this.socket.on('preferences:updated', (data: any) => {
      this.triggerCallbacks('preferences:updated', data);
    });

    this.socket.on('preferences:response', (data: any) => {
      this.triggerCallbacks('preferences:response', data);
    });

    // ═══════════════════════════════════════════════════════════
    // EVENTOS DA AUTOMAÇÃO
    // ═══════════════════════════════════════════════════════════

    this.socket.on('automation:state', (data: any) => {
      console.log('🤖 [AUTOMATION] Estado recebido:', data);
      this.triggerCallbacks('automation:state', data);
    });

    this.socket.on('automation:product-sent', (data: any) => {
      console.log('📤 [AUTOMATION] Produto enviado:', data);
      this.triggerCallbacks('automation:product-sent', data);
    });

    this.socket.on('automation:error', (data: any) => {
      console.error('❌ [AUTOMATION] Erro:', data);
      this.triggerCallbacks('automation:error', data);
    });

    this.socket.on('automation:cancelled', (data: any) => {
      console.log('🛑 [AUTOMATION] Cancelada:', data);
      this.triggerCallbacks('automation:cancelled', data);
    });

    this.socket.on('automation:paused', (data: any) => {
      console.log('⏸️ [AUTOMATION] Pausada:', data);
      this.triggerCallbacks('automation:paused', data);
    });

    this.socket.on('automation:resumed', (data: any) => {
      console.log('▶️ [AUTOMATION] Retomada:', data);
      this.triggerCallbacks('automation:resumed', data);
    });
  }

  // ── Atualiza o token após login/refresh de sessão ─────────────────
  async updateToken() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      if (this.socket && token) {
        this.socket.auth = { token };
        this.socket.disconnect();
        this.socket.connect();
        console.log('🔑 [Socket] Token atualizado e reconectando...');
      }
    } catch (e) {
      console.error('❌ [Socket] Erro ao atualizar token:', e);
    }
  }

  disconnect() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.callbacks.clear();
      console.log('🔌 Socket.IO desconectado');
    }
  }

  on(event: string, callback: Function) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)!.push(callback);
  }

  off(event: string, callback: Function) {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  private triggerCallbacks(event: string, data: any) {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('⚠️ Socket não está conectado. Não foi possível emitir:', event);
    }
  }

  isConnected() {
    return this.socket?.connected || false;
  }

  getSocketId() {
    return this.socket?.id || null;
  }
}

export const socketService = new SocketService();