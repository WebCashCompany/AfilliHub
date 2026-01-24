// src/contexts/WhatsAppContext.tsx
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
  const [status, setStatus] = useState<WhatsAppStatus>({
    conectado: false,
    status: 'offline',
    clientReady: false,
    qrCode: undefined
  });
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

    // Verificação inicial
    checkStatus();

    // Verificação periódica
    interval = setInterval(checkStatus, 5000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [groups.length]);

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
      setStatus({
        conectado: false,
        status: 'offline',
        clientReady: false,
        qrCode: undefined
      });
      setGroups([]);
      setSelectedGroups([]);
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