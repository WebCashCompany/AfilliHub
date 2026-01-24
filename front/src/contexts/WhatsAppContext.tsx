// src/contexts/WhatsAppContext.tsx - COM PERSISTÊNCIA
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { whatsappService, WhatsAppStatus, WhatsAppGroup } from '@/api/services/whatsapp.service';

interface WhatsAppContextData {
  status: WhatsAppStatus;
  groups: WhatsAppGroup[];
  selectedGroups: string[];
  isConnecting: boolean;
  isLoading: boolean;
  
  connectBot: () => Promise<void>;
  disconnectBot: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  loadGroups: () => Promise<void>;
  setSelectedGroups: (groups: string[]) => void;
}

const WhatsAppContext = createContext<WhatsAppContextData>({} as WhatsAppContextData);

export function WhatsAppProvider({ children }: { children: ReactNode }) {
  // ✅ CARREGAR ESTADO INICIAL DO LOCALSTORAGE
  const [status, setStatus] = useState<WhatsAppStatus>(() => {
    const saved = localStorage.getItem('whatsapp_status');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao carregar status salvo:', e);
      }
    }
    return {
      conectado: false,
      status: 'offline',
      clientReady: false,
      qrCode: undefined
    };
  });

  const [groups, setGroups] = useState<WhatsAppGroup[]>(() => {
    const saved = localStorage.getItem('whatsapp_groups');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao carregar grupos salvos:', e);
      }
    }
    return [];
  });

  const [selectedGroups, setSelectedGroups] = useState<string[]>(() => {
    const saved = localStorage.getItem('whatsapp_selected_groups');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao carregar grupos selecionados:', e);
      }
    }
    return [];
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ✅ SALVAR STATUS NO LOCALSTORAGE SEMPRE QUE MUDAR
  useEffect(() => {
    localStorage.setItem('whatsapp_status', JSON.stringify(status));
  }, [status]);

  // ✅ SALVAR GRUPOS NO LOCALSTORAGE SEMPRE QUE MUDAR
  useEffect(() => {
    localStorage.setItem('whatsapp_groups', JSON.stringify(groups));
  }, [groups]);

  // ✅ SALVAR GRUPOS SELECIONADOS NO LOCALSTORAGE SEMPRE QUE MUDAR
  useEffect(() => {
    localStorage.setItem('whatsapp_selected_groups', JSON.stringify(selectedGroups));
  }, [selectedGroups]);

  // Verificar status periodicamente (a cada 5 segundos)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const checkStatus = async () => {
      try {
        const currentStatus = await whatsappService.getStatus();
        setStatus(currentStatus);

        // Se conectou e temos grupos vazios, carregar grupos
        if (currentStatus.conectado && groups.length === 0) {
          await loadGroups();
        }
      } catch (error) {
        console.error('Erro ao verificar status:', error);
      }
    };

    // ✅ SÓ INICIA VERIFICAÇÃO SE JÁ ESTAVA CONECTADO (carregado do localStorage)
    if (status.conectado) {
      checkStatus();
      interval = setInterval(checkStatus, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status.conectado, groups.length]);

  const refreshStatus = useCallback(async () => {
    try {
      const currentStatus = await whatsappService.getStatus();
      setStatus(currentStatus);
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    if (!status.conectado) return;

    setIsLoading(true);
    try {
      const loadedGroups = await whatsappService.listGroups();
      setGroups(loadedGroups);
    } catch (error) {
      console.error('Erro ao carregar grupos:', error);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, [status.conectado]);

  const connectBot = useCallback(async () => {
    setIsConnecting(true);
    try {
      await whatsappService.connectBot();
      await refreshStatus();
    } catch (error) {
      console.error('Erro ao conectar bot:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [refreshStatus]);

  const disconnectBot = useCallback(async () => {
    try {
      await whatsappService.disconnectBot();
      
      // ✅ LIMPAR ESTADO E LOCALSTORAGE
      const emptyStatus = {
        conectado: false,
        status: 'offline' as const,
        clientReady: false,
        qrCode: undefined
      };
      
      setStatus(emptyStatus);
      setGroups([]);
      setSelectedGroups([]);
      
      localStorage.removeItem('whatsapp_status');
      localStorage.removeItem('whatsapp_groups');
      localStorage.removeItem('whatsapp_selected_groups');
    } catch (error) {
      console.error('Erro ao desconectar bot:', error);
      throw error;
    }
  }, []);

  return (
    <WhatsAppContext.Provider
      value={{
        status,
        groups,
        selectedGroups,
        isConnecting,
        isLoading,
        connectBot,
        disconnectBot,
        refreshStatus,
        loadGroups,
        setSelectedGroups
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