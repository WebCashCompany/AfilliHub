// front/src/contexts/WhatsAppContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { socketService } from '@/api/services/socket.service';
import { whatsappService, WhatsAppSession, WhatsAppGroup } from '@/api/services/whatsapp.service';
import { useAuth } from '@/contexts/AuthContext';

interface WhatsAppContextData {
  sessions: WhatsAppSession[];
  currentSessionId: string | null;
  groups: WhatsAppGroup[];
  selectedGroups: string[];
  isConnecting: boolean;
  isLoading: boolean;
  qrCode: string | null;
  socketConnected: boolean;

  setCurrentSession: (sessionId: string | null) => void;
  connectNewSession: (sessionId: string) => Promise<void>;
  disconnectSession: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  loadGroups: (sessionId: string) => Promise<void>;
  setSelectedGroups: (groups: string[]) => void;
  getActiveSession: () => WhatsAppSession | null;
}

const WhatsAppContext = createContext<WhatsAppContextData>({} as WhatsAppContextData);

export function WhatsAppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const currentSessionIdRef = useRef<string | null>(null);
  currentSessionIdRef.current = currentSessionId;

  // ─────────────────────────────────────────────────────────
  // CHAVES DO LOCALSTORAGE VINCULADAS AO USUÁRIO
  // ─────────────────────────────────────────────────────────
  const storageKey = useCallback((key: string) =>
    user?.id ? `whatsapp_${key}_${user.id}` : null,
  [user?.id]);

  const saveToStorage = useCallback((key: string, value: any) => {
    const k = storageKey(key);
    if (!k) return;
    localStorage.setItem(k, JSON.stringify(value));
  }, [storageKey]);

  const loadFromStorage = useCallback(<T,>(key: string, fallback: T): T => {
    const k = storageKey(key);
    if (!k) return fallback;
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }, [storageKey]);

  const removeFromStorage = useCallback((key: string) => {
    const k = storageKey(key);
    if (k) localStorage.removeItem(k);
  }, [storageKey]);

  // ─────────────────────────────────────────────────────────
  // HELPER: normalizar sessões
  // ─────────────────────────────────────────────────────────
  const normalizeSessions = (data: any): WhatsAppSession[] => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return Object.values(data);
    return [];
  };

  // ─────────────────────────────────────────────────────────
  // INICIALIZAR SOCKET.IO
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    console.log('🔌 Conectando Socket.IO...');
    socketService.connect();

    const checkInterval = setInterval(() => {
      setSocketConnected(socketService.isConnected());
    }, 1000);

    return () => {
      clearInterval(checkInterval);
      socketService.disconnect();
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // CARREGAR DADOS SALVOS QUANDO USUÁRIO LOGA
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const savedSession = loadFromStorage<string | null>('current_session', null);
    const savedGroups  = loadFromStorage<string[]>('selected_groups', []);

    if (savedSession) {
      console.log('💾 Sessão restaurada do storage:', savedSession);
      setCurrentSessionId(savedSession);
    }

    if (savedGroups.length > 0) {
      console.log('💾 Grupos restaurados do storage:', savedGroups.length);
      setSelectedGroups(savedGroups);
    }
  }, [user?.id]);

  // ─────────────────────────────────────────────────────────
  // LIMPAR ESTADO AO DESLOGAR
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setCurrentSessionId(null);
      setGroups([]);
      setSelectedGroups([]);
      setQrCode(null);
      setSessions([]);
    }
  }, [user]);

  // ─────────────────────────────────────────────────────────
  // SOCKET.IO — EVENTOS EM TEMPO REAL
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleQRCode = (data: { sessionId: string; qrCode: string }) => {
      console.log('📱 [REAL-TIME] QR Code recebido:', data.sessionId);
      setQrCode(data.qrCode);
      setIsConnecting(false);
    };

    const handleConnected = (data: { sessionId: string; phoneNumber: string; connectedAt: Date }) => {
      console.log('✅ [REAL-TIME] Sessão conectada:', data.sessionId);
      setQrCode(null);
      setIsConnecting(false);
    };

    const handleDisconnected = (data: { sessionId: string; reason: string }) => {
      console.log('❌ [REAL-TIME] Sessão desconectada:', data.sessionId, data.reason);

      setSessions(prev => prev.map(s =>
        s.sessionId === data.sessionId
          ? { ...s, conectado: false, status: 'offline' as const }
          : s
      ));

      if (data.sessionId === currentSessionIdRef.current) {
        setCurrentSessionId(null);
        setGroups([]);
        setQrCode(null);
        removeFromStorage('current_session');
      }
    };

    const handleSessionsUpdate = (data: { sessions: WhatsAppSession[] } | WhatsAppSession[]) => {
      const raw  = Array.isArray(data) ? data : (data as any).sessions;
      const list = normalizeSessions(raw);
      console.log('📋 [REAL-TIME] Sessões atualizadas:', list.length);
      setSessions(list);

      // Se há uma sessão salva no storage, verificar se ainda está ativa
      const saved = currentSessionIdRef.current;
      if (saved) {
        const stillActive = list.find(s => s.sessionId === saved && s.conectado);
        if (!stillActive) {
          // Sessão salva não está mais ativa — tentar pegar outra ativa
          const anyActive = list.find(s => s.conectado);
          if (anyActive) {
            setCurrentSessionId(anyActive.sessionId);
            saveToStorage('current_session', anyActive.sessionId);
          }
        }
      } else {
        // Nenhuma sessão selecionada — auto-selecionar primeira ativa
        const anyActive = list.find(s => s.conectado);
        if (anyActive) {
          setCurrentSessionId(anyActive.sessionId);
          saveToStorage('current_session', anyActive.sessionId);
        }
      }
    };

    socketService.on('whatsapp:qr', handleQRCode);
    socketService.on('whatsapp:connected', handleConnected);
    socketService.on('whatsapp:disconnected', handleDisconnected);
    socketService.on('whatsapp:sessions-update', handleSessionsUpdate);

    return () => {
      socketService.off('whatsapp:qr', handleQRCode);
      socketService.off('whatsapp:connected', handleConnected);
      socketService.off('whatsapp:disconnected', handleDisconnected);
      socketService.off('whatsapp:sessions-update', handleSessionsUpdate);
    };
  }, [user?.id]);

  // ─────────────────────────────────────────────────────────
  // PERSISTIR SESSÃO ATUAL POR USUÁRIO
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    if (currentSessionId) {
      saveToStorage('current_session', currentSessionId);
    } else {
      removeFromStorage('current_session');
    }
  }, [currentSessionId, user?.id]);

  // ─────────────────────────────────────────────────────────
  // PERSISTIR GRUPOS SELECIONADOS POR USUÁRIO
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    saveToStorage('selected_groups', selectedGroups);
  }, [selectedGroups, user?.id]);

  // ─────────────────────────────────────────────────────────
  // FUNÇÕES
  // ─────────────────────────────────────────────────────────
  const refreshSessions = useCallback(async () => {
    try {
      const allSessions = await whatsappService.listSessions();
      setSessions(Array.isArray(allSessions) ? allSessions : []);
    } catch (error) {
      console.error('Erro ao atualizar sessões:', error);
    }
  }, []);

  const loadGroups = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const loadedGroups = await whatsappService.listGroups(sessionId);
      setGroups(loadedGroups);
    } catch (error) {
      console.error('Erro ao carregar grupos:', error);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connectNewSession = useCallback(async (sessionId: string) => {
    setIsConnecting(true);
    setQrCode(null);
    try {
      await whatsappService.connectSession(sessionId);
      setCurrentSessionId(sessionId);
    } catch (error) {
      console.error('Erro ao conectar sessão:', error);
      setIsConnecting(false);
      throw error;
    }
  }, []);

  const disconnectSession = useCallback(async (sessionId: string) => {
    try {
      await whatsappService.disconnectSession(sessionId);
      if (sessionId === currentSessionIdRef.current) {
        setCurrentSessionId(null);
        setGroups([]);
        setSelectedGroups([]);
        setQrCode(null);
        removeFromStorage('current_session');
      }
    } catch (error) {
      console.error('Erro ao desconectar sessão:', error);
      throw error;
    }
  }, [user?.id]);

  const setCurrentSession = useCallback((sessionId: string | null) => {
    setCurrentSessionId(sessionId);
    if (sessionId) {
      loadGroups(sessionId);
    } else {
      setGroups([]);
      setSelectedGroups([]);
    }
  }, [loadGroups]);

  const getActiveSession = useCallback(() => {
    if (!currentSessionIdRef.current || !Array.isArray(sessions)) return null;
    return sessions.find(s => s.sessionId === currentSessionIdRef.current) || null;
  }, [sessions]);

  return (
    <WhatsAppContext.Provider
      value={{
        sessions,
        currentSessionId,
        groups,
        selectedGroups,
        isConnecting,
        isLoading,
        qrCode,
        socketConnected,
        setCurrentSession,
        connectNewSession,
        disconnectSession,
        refreshSessions,
        loadGroups,
        setSelectedGroups,
        getActiveSession
      }}
    >
      {children}
    </WhatsAppContext.Provider>
  );
}

export function useWhatsApp() {
  const context = useContext(WhatsAppContext);
  if (!context) throw new Error('useWhatsApp deve ser usado dentro de WhatsAppProvider');
  return context;
}