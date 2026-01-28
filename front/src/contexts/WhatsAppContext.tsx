// front/src/contexts/WhatsAppContext.tsx - COM SOCKET.IO SINCRONIZADO
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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

  // ═══════════════════════════════════════════════════════════
  // INICIALIZAR SOCKET.IO
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    console.log('🔌 Conectando Socket.IO...');
    socketService.connect();
    
    // Verificar conexão a cada segundo
    const checkInterval = setInterval(() => {
      setSocketConnected(socketService.isConnected());
    }, 1000);

    return () => {
      clearInterval(checkInterval);
      socketService.disconnect();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // CARREGAR DADOS INICIAIS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const savedCurrentSession = localStorage.getItem('whatsapp_current_session');
    const savedSelectedGroups = localStorage.getItem('whatsapp_selected_groups');

    if (savedCurrentSession) {
      setCurrentSessionId(savedCurrentSession);
    }

    if (savedSelectedGroups) {
      try {
        setSelectedGroups(JSON.parse(savedSelectedGroups));
      } catch (e) {
        console.error('Erro ao carregar grupos selecionados:', e);
      }
    }

    // Solicitar lista de sessões ao conectar
    if (socketService.isConnected()) {
      socketService.emit('whatsapp:request-sessions', {});
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // SOCKET.IO - EVENTOS EM TEMPO REAL
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    // ⭐ QR CODE (recebe de qualquer lugar)
    const handleQRCode = (data: { sessionId: string; qrCode: string }) => {
      console.log('📱 [REAL-TIME] QR Code recebido:', data.sessionId);
      // Mostrar QR Code independente da sessão atual
      setQrCode(data.qrCode);
      setIsConnecting(false);
    };

    // ⭐ SESSÃO CONECTADA (recebe de qualquer lugar)
    const handleConnected = (data: { sessionId: string; phoneNumber: string; connectedAt: Date }) => {
      console.log('✅ [REAL-TIME] Sessão conectada:', data.sessionId, data.phoneNumber);
      setQrCode(null);
      setIsConnecting(false);
      
      // Atualizar lista
      refreshSessions();
    };

    // ⭐ SESSÃO DESCONECTADA (recebe de qualquer lugar)
    const handleDisconnected = (data: { sessionId: string; reason: string }) => {
      console.log('❌ [REAL-TIME] Sessão desconectada:', data.sessionId, data.reason);
      
      // Remover sessão imediatamente da lista
      setSessions(prev => prev.filter(s => s.sessionId !== data.sessionId));
      
      // Se for a sessão atual, limpar
      if (data.sessionId === currentSessionId) {
        setCurrentSessionId(null);
        setGroups([]);
        setQrCode(null);
      }
      
      // Atualizar lista completa em seguida
      refreshSessions();
    };

    // ⭐ LISTA DE SESSÕES ATUALIZADA (broadcast para todos)
    const handleSessionsUpdate = (data: { sessions: WhatsAppSession[] }) => {
      console.log('📋 [REAL-TIME] Sessões atualizadas:', data.sessions?.length || 0, 'sessões');
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    };

    // ⭐ LISTA DE SESSÕES (resposta da solicitação)
    const handleSessionsList = (data: { sessions: WhatsAppSession[] }) => {
      console.log('📋 [REAL-TIME] Lista de sessões recebida:', data.sessions?.length || 0);
      const sessionsList = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(sessionsList);
      
      // Se não há sessão atual mas há sessões ativas, selecionar a primeira
      if (!currentSessionId && sessionsList.length > 0) {
        const activeSession = sessionsList.find(s => s.conectado);
        if (activeSession) {
          setCurrentSessionId(activeSession.sessionId);
          loadGroups(activeSession.sessionId);
        }
      }
    };

    // ⭐ OFERTA ENVIADA (notificação em tempo real)
    const handleOfferSent = (data: { sessionId: string; groupId: string; offerName: string }) => {
      console.log('✅ [REAL-TIME] Oferta enviada:', data);
      // Você pode adicionar um toast aqui se quiser
    };

    // Registrar callbacks
    socketService.on('whatsapp:qr', handleQRCode);
    socketService.on('whatsapp:connected', handleConnected);
    socketService.on('whatsapp:disconnected', handleDisconnected);
    socketService.on('whatsapp:sessions-update', handleSessionsUpdate);
    socketService.on('whatsapp:sessions-list', handleSessionsList);
    socketService.on('whatsapp:offer-sent', handleOfferSent);

    return () => {
      socketService.off('whatsapp:qr', handleQRCode);
      socketService.off('whatsapp:connected', handleConnected);
      socketService.off('whatsapp:disconnected', handleDisconnected);
      socketService.off('whatsapp:sessions-update', handleSessionsUpdate);
      socketService.off('whatsapp:sessions-list', handleSessionsList);
      socketService.off('whatsapp:offer-sent', handleOfferSent);
    };
  }, [currentSessionId]);

  // ═══════════════════════════════════════════════════════════
  // SALVAR NO LOCALSTORAGE
  // ═══════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════
  // FUNÇÕES
  // ═══════════════════════════════════════════════════════════
  const refreshSessions = useCallback(async () => {
    try {
      const allSessions = await whatsappService.listSessions();
      setSessions(allSessions);
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
      
      // A atualização virá via Socket.IO em tempo real
    } catch (error) {
      console.error('Erro ao conectar sessão:', error);
      setIsConnecting(false);
      throw error;
    }
  }, []);

  const disconnectSession = useCallback(async (sessionId: string) => {
    try {
      await whatsappService.disconnectSession(sessionId);
      
      // Se for a sessão atual, limpar
      if (sessionId === currentSessionId) {
        setCurrentSessionId(null);
        setGroups([]);
        setSelectedGroups([]);
        setQrCode(null);
      }
      
      // A atualização virá via Socket.IO em tempo real
    } catch (error) {
      console.error('Erro ao desconectar sessão:', error);
      throw error;
    }
  }, [currentSessionId]);

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
    if (!currentSessionId) return null;
    if (!Array.isArray(sessions)) return null;
    return sessions.find(s => s.sessionId === currentSessionId) || null;
  }, [currentSessionId, sessions]);

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
  
  if (!context) {
    throw new Error('useWhatsApp deve ser usado dentro de WhatsAppProvider');
  }
  
  return context;
}