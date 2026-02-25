// front/src/contexts/WhatsAppContext.tsx - CORRIGIDO v2
import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { socketService } from '@/api/services/socket.service';
import { whatsappService, WhatsAppSession, WhatsAppGroup } from '@/api/services/whatsapp.service';

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
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // ✅ FIX: usar ref para currentSessionId dentro de callbacks sem re-registrar listeners
  const currentSessionIdRef = useRef<string | null>(null);
  currentSessionIdRef.current = currentSessionId;

  // ─────────────────────────────────────────────────────────
  // HELPER: normalizar dados de sessões (array ou objeto)
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
  // CARREGAR DADOS INICIAIS
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const savedCurrentSession = localStorage.getItem('whatsapp_current_session');
    const savedSelectedGroups = localStorage.getItem('whatsapp_selected_groups');

    if (savedCurrentSession) setCurrentSessionId(savedCurrentSession);

    if (savedSelectedGroups) {
      try {
        setSelectedGroups(JSON.parse(savedSelectedGroups));
      } catch (e) {
        console.error('Erro ao carregar grupos selecionados:', e);
      }
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // SOCKET.IO — EVENTOS EM TEMPO REAL
  // ✅ FIX: registrar UMA vez só (sem currentSessionId na dep array)
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
      // ✅ FIX: não chamar refreshSessions() aqui — o broadcast 'sessions-update' já virá
    };

    const handleDisconnected = (data: { sessionId: string; reason: string }) => {
      console.log('❌ [REAL-TIME] Sessão desconectada:', data.sessionId, data.reason);
      
      // ✅ FIX: atualizar localmente SEM chamar refreshSessions() — evita race condition
      // O broadcast 'sessions-update' chegará logo e atualizará corretamente
      setSessions(prev => prev.map(s =>
        s.sessionId === data.sessionId
          ? { ...s, conectado: false, status: 'offline' as const }
          : s
      ));

      if (data.sessionId === currentSessionIdRef.current) {
        setCurrentSessionId(null);
        setGroups([]);
        setQrCode(null);
      }
    };

    // ✅ FIX: Backend emite 'whatsapp:sessions-update' — este é o evento correto
    const handleSessionsUpdate = (data: { sessions: WhatsAppSession[] } | WhatsAppSession[]) => {
      // Aceita tanto { sessions: [...] } quanto [...] diretamente
      const raw = Array.isArray(data) ? data : (data as any).sessions;
      const list = normalizeSessions(raw);
      console.log('📋 [REAL-TIME] Sessões atualizadas:', list.length, 'sessões');
      setSessions(list);
    };

    // ✅ FIX: Também escutar 'sessions:list' (resposta do backend ao 'sessions:get')
    const handleSessionsList = (data: { sessions: WhatsAppSession[] } | WhatsAppSession[]) => {
      const raw = Array.isArray(data) ? data : (data as any).sessions;
      const list = normalizeSessions(raw);
      console.log('📋 [REAL-TIME] Lista de sessões recebida:', list.length);
      setSessions(list);

      // Auto-selecionar primeira sessão ativa se não há nenhuma selecionada
      if (!currentSessionIdRef.current && list.length > 0) {
        const active = list.find(s => s.conectado);
        if (active) {
          setCurrentSessionId(active.sessionId);
        }
      }
    };

    const handleOfferSent = (data: { sessionId: string; groupId: string; offerName: string }) => {
      console.log('✅ [REAL-TIME] Oferta enviada:', data);
    };

    socketService.on('whatsapp:qr', handleQRCode);
    socketService.on('whatsapp:connected', handleConnected);
    socketService.on('whatsapp:disconnected', handleDisconnected);
    socketService.on('whatsapp:sessions-update', handleSessionsUpdate); // broadcast do backend
    socketService.on('sessions:list', handleSessionsList);              // resposta ao sessions:get
    socketService.on('whatsapp:offer-sent', handleOfferSent);

    return () => {
      socketService.off('whatsapp:qr', handleQRCode);
      socketService.off('whatsapp:connected', handleConnected);
      socketService.off('whatsapp:disconnected', handleDisconnected);
      socketService.off('whatsapp:sessions-update', handleSessionsUpdate);
      socketService.off('sessions:list', handleSessionsList);
      socketService.off('whatsapp:offer-sent', handleOfferSent);
    };
  }, []); // ✅ FIX: sem dependências — evita re-registrar e perder eventos

  // ─────────────────────────────────────────────────────────
  // PERSISTÊNCIA NO LOCALSTORAGE
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('whatsapp_current_session', currentSessionId);
    } else {
      localStorage.removeItem('whatsapp_current_session');
    }
  }, [currentSessionId]);

  useEffect(() => {
    localStorage.setItem('whatsapp_selected_groups', JSON.stringify(selectedGroups));
  }, [selectedGroups]);

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
      }
    } catch (error) {
      console.error('Erro ao desconectar sessão:', error);
      throw error;
    }
  }, []);

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