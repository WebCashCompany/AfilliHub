// front/src/contexts/WhatsAppContext.tsx
// ⚠️ SUBSTITUIR TODO O CONTEÚDO DO ARQUIVO POR ESTE
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { whatsappService, WhatsAppSession, WhatsAppGroup } from '@/api/services/whatsapp.service';

interface WhatsAppContextData {
  sessions: WhatsAppSession[];
  currentSessionId: string | null;
  groups: WhatsAppGroup[];
  selectedGroups: string[];
  isConnecting: boolean;
  isLoading: boolean;
  qrCode: string | null;
  
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

  // Carregar sessões salvas do localStorage
  useEffect(() => {
    const savedSessions = localStorage.getItem('whatsapp_sessions');
    const savedCurrentSession = localStorage.getItem('whatsapp_current_session');
    const savedGroups = localStorage.getItem('whatsapp_groups');
    const savedSelectedGroups = localStorage.getItem('whatsapp_selected_groups');

    if (savedSessions) {
      try {
        setSessions(JSON.parse(savedSessions));
      } catch (e) {
        console.error('Erro ao carregar sessões:', e);
      }
    }

    if (savedCurrentSession) {
      setCurrentSessionId(savedCurrentSession);
    }

    if (savedGroups) {
      try {
        setGroups(JSON.parse(savedGroups));
      } catch (e) {
        console.error('Erro ao carregar grupos:', e);
      }
    }

    if (savedSelectedGroups) {
      try {
        setSelectedGroups(JSON.parse(savedSelectedGroups));
      } catch (e) {
        console.error('Erro ao carregar grupos selecionados:', e);
      }
    }

    // Solicitar lista atual de sessões
    refreshSessions();
  }, []);

  // Salvar no localStorage quando mudar
  useEffect(() => {
    localStorage.setItem('whatsapp_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('whatsapp_current_session', currentSessionId);
    } else {
      localStorage.removeItem('whatsapp_current_session');
    }
  }, [currentSessionId]);

  useEffect(() => {
    localStorage.setItem('whatsapp_groups', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem('whatsapp_selected_groups', JSON.stringify(selectedGroups));
  }, [selectedGroups]);

  // Configurar callbacks do Socket.IO
  useEffect(() => {
    // Callback para QR Code
    whatsappService.onQRCode((sessionId, qr) => {
      console.log('📱 QR Code recebido no Context:', sessionId);
      if (sessionId === currentSessionId) {
        setQrCode(qr);
        setIsConnecting(false);
      }
    });

    // Callback para conexão bem-sucedida
    whatsappService.onConnected((sessionId, phoneNumber) => {
      console.log('✅ Sessão conectada no Context:', sessionId, phoneNumber);
      setQrCode(null);
      setIsConnecting(false);
      
      // Atualizar lista de sessões
      refreshSessions();
      
      // Se for a sessão atual, carregar grupos
      if (sessionId === currentSessionId) {
        loadGroups(sessionId);
      }
    });

    // Callback para desconexão
    whatsappService.onDisconnected((sessionId, reason) => {
      console.log('❌ Sessão desconectada no Context:', sessionId, reason);
      
      // Atualizar lista de sessões
      refreshSessions();
      
      // Limpar grupos se for a sessão atual
      if (sessionId === currentSessionId) {
        setGroups([]);
        setSelectedGroups([]);
      }
    });

    // Callback para atualização de sessões
    whatsappService.onSessionsUpdate((updatedSessions) => {
      console.log('📋 Sessões atualizadas no Context:', updatedSessions);
      setSessions(updatedSessions);
    });

    return () => {
      // Cleanup se necessário
    };
  }, [currentSessionId]);

  const refreshSessions = useCallback(async () => {
    try {
      const allSessions = await whatsappService.listSessions();
      setSessions(allSessions);
      
      // Se não há sessão atual mas há sessões ativas, selecionar a primeira
      if (!currentSessionId && allSessions.length > 0) {
        const activeSession = allSessions.find(s => s.conectado);
        if (activeSession) {
          setCurrentSessionId(activeSession.sessionId);
        }
      }
    } catch (error) {
      console.error('Erro ao atualizar sessões:', error);
    }
  }, [currentSessionId]);

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
      
      // A atualização virá via Socket.IO
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
      
      // Atualizar lista de sessões
      await refreshSessions();
    } catch (error) {
      console.error('Erro ao desconectar sessão:', error);
      throw error;
    }
  }, [currentSessionId, refreshSessions]);

  const setCurrentSession = useCallback((sessionId: string | null) => {
    setCurrentSessionId(sessionId);
    
    if (sessionId) {
      // Carregar grupos da nova sessão
      loadGroups(sessionId);
    } else {
      setGroups([]);
      setSelectedGroups([]);
    }
  }, [loadGroups]);

  const getActiveSession = useCallback(() => {
    if (!currentSessionId) return null;
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