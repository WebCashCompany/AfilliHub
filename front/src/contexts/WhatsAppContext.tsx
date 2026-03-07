// front/src/contexts/WhatsAppContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { socketService } from '@/api/services/socket.service';
import { whatsappService, WhatsAppSession, WhatsAppGroup } from '@/api/services/whatsapp.service';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';

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
  // ── Fonte de verdade: preferências do backend ────────────────────────────
  const { preferences, isLoading: prefsLoading } = useUserPreferences();

  const [sessions, setSessions]                 = useState<WhatsAppSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [groups, setGroups]                     = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups]     = useState<string[]>([]);
  const [isConnecting, setIsConnecting]         = useState(false);
  const [isLoading, setIsLoading]               = useState(false);
  const [qrCode, setQrCode]                     = useState<string | null>(null);
  const [socketConnected, setSocketConnected]   = useState(false);

  const currentSessionIdRef = useRef<string | null>(null);
  currentSessionIdRef.current = currentSessionId;

  const sessionUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Normalizar sessões ────────────────────────────────────────────────────
  const normalizeSessions = (data: any): WhatsAppSession[] => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return Object.values(data);
    return [];
  };

  // ── Conectar Socket — só após usuário logado ──────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    socketService.connect();
    const checkInterval = setInterval(() => {
      setSocketConnected(socketService.isConnected());
    }, 1000);
    return () => clearInterval(checkInterval);
  }, [user?.id]);

  // ── BOOT: restaura sessão e grupos a partir do backend (preferences) ──────
  // Roda quando preferences carregarem — substitui o localStorage
  useEffect(() => {
    if (!user?.id || prefsLoading || !preferences) return;

    const savedSessionId = preferences.whatsapp?.currentSessionId ?? null;
    const savedGroups    = (preferences.whatsapp?.selectedGroups ?? []).map(g => g.id);

    // Busca sessões via HTTP pra verificar se a sessão salva ainda está online
    whatsappService.listSessions().then(allSessions => {
      const list = Array.isArray(allSessions) ? allSessions : [];
      setSessions(list);
      console.log('🔄 Sessões carregadas via HTTP no boot:', list.length);

      if (savedSessionId) {
        const stillOnline = list.find(s => s.sessionId === savedSessionId && s.conectado);
        if (stillOnline) {
          console.log('✅ Sessão restaurada do backend:', savedSessionId);
          setCurrentSessionId(savedSessionId);
        } else {
          // Sessão salva existe mas está offline — ainda define como current
          // pra o usuário ver que tem uma sessão e poder reconectar
          const exists = list.find(s => s.sessionId === savedSessionId);
          if (exists) {
            console.log('⚠️ Sessão salva está offline, mantendo referência:', savedSessionId);
            setCurrentSessionId(savedSessionId);
          } else {
            // Não existe mais — tenta qualquer sessão online
            const anyActive = list.find(s => s.conectado);
            if (anyActive) {
              console.log('🔄 Sessão salva não existe, usando:', anyActive.sessionId);
              setCurrentSessionId(anyActive.sessionId);
            }
          }
        }
      } else {
        // Nenhuma sessão salva — auto-seleciona a primeira online
        const anyActive = list.find(s => s.conectado);
        if (anyActive) {
          console.log('🔄 Auto-selecionando sessão ativa:', anyActive.sessionId);
          setCurrentSessionId(anyActive.sessionId);
        }
      }

      // Restaura grupos selecionados
      if (savedGroups.length > 0) {
        console.log('💾 Grupos restaurados do backend:', savedGroups.length);
        setSelectedGroups(savedGroups);
      }
    }).catch(err => {
      console.warn('⚠️ Não foi possível carregar sessões no boot:', err);
    });

  }, [user?.id, prefsLoading]); // ← roda quando preferences terminam de carregar

  // ── Limpar estado ao deslogar ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setCurrentSessionId(null);
      setGroups([]);
      setSelectedGroups([]);
      setQrCode(null);
      setSessions([]);
    }
  }, [user]);

  // ── Socket.IO — eventos em tempo real ─────────────────────────────────────
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
      // Atualiza a sessão na lista como conectada
      setSessions(prev => prev.map(s =>
        s.sessionId === data.sessionId
          ? { ...s, conectado: true, status: 'online' as const, phoneNumber: data.phoneNumber }
          : s
      ));
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
      }
    };

    const handleSessionsUpdate = (data: { sessions: WhatsAppSession[] } | WhatsAppSession[]) => {
      const raw  = Array.isArray(data) ? data : (data as any).sessions;
      const list = normalizeSessions(raw);
      console.log('📋 [REAL-TIME] Sessões atualizadas:', list.length);

      if (list.length === 0) {
        console.warn('⚠️ Lista de sessões vazia recebida — ignorando');
        return;
      }

      setSessions(list);

      if (sessionUpdateTimerRef.current) clearTimeout(sessionUpdateTimerRef.current);

      sessionUpdateTimerRef.current = setTimeout(() => {
        const saved = currentSessionIdRef.current;
        if (saved) {
          const stillActive = list.find(s => s.sessionId === saved && s.conectado);
          if (!stillActive) {
            const anyActive = list.find(s => s.conectado);
            if (anyActive) {
              setCurrentSessionId(anyActive.sessionId);
            } else {
              whatsappService.listSessions().then(fresh => {
                const freshList   = Array.isArray(fresh) ? fresh : [];
                const freshActive = freshList.find(s => s.sessionId === saved && s.conectado);
                if (!freshActive) {
                  setCurrentSessionId(null);
                  setGroups([]);
                }
              }).catch(() => {});
            }
          }
        } else {
          const anyActive = list.find(s => s.conectado);
          if (anyActive) setCurrentSessionId(anyActive.sessionId);
        }
      }, 500);
    };

    socketService.on('whatsapp:qr',              handleQRCode);
    socketService.on('whatsapp:connected',       handleConnected);
    socketService.on('whatsapp:disconnected',    handleDisconnected);
    socketService.on('whatsapp:sessions-update', handleSessionsUpdate);

    return () => {
      socketService.off('whatsapp:qr',              handleQRCode);
      socketService.off('whatsapp:connected',       handleConnected);
      socketService.off('whatsapp:disconnected',    handleDisconnected);
      socketService.off('whatsapp:sessions-update', handleSessionsUpdate);
      if (sessionUpdateTimerRef.current) clearTimeout(sessionUpdateTimerRef.current);
    };
  }, [user?.id]);

  // ── Funções ───────────────────────────────────────────────────────────────
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
    if (sessionId) loadGroups(sessionId);
    else { setGroups([]); setSelectedGroups([]); }
  }, [loadGroups]);

  const getActiveSession = useCallback(() => {
    if (!currentSessionIdRef.current || !Array.isArray(sessions)) return null;
    return sessions.find(s => s.sessionId === currentSessionIdRef.current) || null;
  }, [sessions]);

  return (
    <WhatsAppContext.Provider value={{
      sessions, currentSessionId, groups, selectedGroups,
      isConnecting, isLoading, qrCode, socketConnected,
      setCurrentSession, connectNewSession, disconnectSession,
      refreshSessions, loadGroups, setSelectedGroups, getActiveSession,
    }}>
      {children}
    </WhatsAppContext.Provider>
  );
}

export function useWhatsApp() {
  const context = useContext(WhatsAppContext);
  if (!context) throw new Error('useWhatsApp deve ser usado dentro de WhatsAppProvider');
  return context;
}