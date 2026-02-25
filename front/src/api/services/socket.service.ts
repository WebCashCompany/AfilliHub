// front/src/api/services/socket.service.ts
import { io, Socket } from 'socket.io-client';
import { ENV } from '@/config/environment';

class SocketService {
  private socket: Socket | null = null;
  private callbacks: Map<string, Function[]> = new Map();
  private reconnectInterval: NodeJS.Timeout | null = null;

  connect() {
    if (this.socket?.connected) {
      console.log('✅ Socket já está conectado');
      return;
    }

    const BACKEND_URL = ENV.API_BASE_URL.replace(/\/api$/, '');
    console.log('🔌 Conectando Socket.IO em:', BACKEND_URL);

    this.socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
      withCredentials: true
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket.IO conectado! ID:', this.socket?.id);

      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }

      // ✅ FIX: emitir AMBOS para garantir compatibilidade com o backend
      this.emit('sessions:get', {});
      this.emit('whatsapp:request-sessions', {});
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

    // ✅ FIX: broadcast do backend → dispara o handler correto no Context
    this.socket.on('whatsapp:sessions-update', (data: { sessions: any[] }) => {
      console.log('📋 [BROADCAST] Sessões atualizadas:', data.sessions?.length || 0, 'sessões');
      this.triggerCallbacks('whatsapp:sessions-update', data);
    });

    // ✅ FIX: resposta ao sessions:get → redireciona pro mesmo handler
    this.socket.on('sessions:list', (data: { sessions: any[] }) => {
      console.log('📋 Lista de sessões recebida:', data.sessions?.length || 0);
      this.triggerCallbacks('whatsapp:sessions-update', data); // ✅ mesmo handler do Context
    });

    // ✅ FIX: alias antigo → redireciona pro mesmo handler
    this.socket.on('whatsapp:sessions-list', (data: { sessions: any[] }) => {
      console.log('📋 Lista de sessões recebida (alias):', data.sessions?.length || 0);
      this.triggerCallbacks('whatsapp:sessions-update', data); // ✅ mesmo handler do Context
    });

    this.socket.on('whatsapp:offer-sent', (data: { sessionId: string; groupId: string; offerName: string }) => {
      console.log('✅ [BROADCAST] Oferta enviada:', data);
      this.triggerCallbacks('whatsapp:offer-sent', data);
    });

    this.socket.on('preferences:response', (data: any) => {
      this.triggerCallbacks('preferences:response', data);
    });
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
      if (index > -1) {
        callbacks.splice(index, 1);
      }
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