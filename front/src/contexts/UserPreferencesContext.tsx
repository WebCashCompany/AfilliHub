// src/contexts/UserPreferencesContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { socketService } from '@/api/services/socket.service';
import { ENV } from '@/config/environment';

const API_BASE_URL = ENV.API_BASE_URL;

// ✅ Headers obrigatórios para todas as chamadas ao backend via ngrok
const NGROK_HEADERS = {
  'ngrok-skip-browser-warning': 'true',
  'Content-Type': 'application/json',
};

export interface UserPreferences {
  userId: string;
  theme: 'light' | 'dark' | 'system';
  language: 'pt-BR' | 'en-US' | 'es-ES';
  whatsapp: {
    currentSessionId: string | null;
    selectedGroups: Array<{
      id: string;
      nome: string;
      participantes: number;
      sessionId: string;
    }>;
    enabled: boolean;
  };
  telegram: {
    enabled: boolean;
    selectedChannels: Array<{
      id: string;
      name: string;
    }>;
  };
  automation: {
    active: boolean;
    paused: boolean;
    config: {
      intervalMinutes: number;
      categories: string[];
      marketplaces: string[];
    } | null;
    currentProductIndex: number;
    totalSent: number;
  };
  customMessage: string;
  notifications: {
    browser: boolean;
    sound: boolean;
  };
  updatedAt?: Date;
}

interface UserPreferencesContextData {
  preferences: UserPreferences | null;
  isLoading: boolean;
  isSyncing: boolean;
  
  // Métodos
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  updateTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  updateWhatsAppGroups: (groups: any[]) => Promise<void>;
  updateWhatsAppSession: (sessionId: string | null) => Promise<void>;
  updateCustomMessage: (message: string) => Promise<void>;
  updateAutomation: (automation: Partial<UserPreferences['automation']>) => Promise<void>;
  resetPreferences: () => Promise<void>;
  refreshPreferences: () => Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextData>({} as UserPreferencesContextData);

const DEFAULT_PREFERENCES: UserPreferences = {
  userId: 'default',
  theme: 'dark',
  language: 'pt-BR',
  whatsapp: {
    currentSessionId: null,
    selectedGroups: [],
    enabled: true
  },
  telegram: {
    enabled: false,
    selectedChannels: []
  },
  automation: {
    active: false,
    paused: false,
    config: null,
    currentProductIndex: 0,
    totalSent: 0
  },
  customMessage: '',
  notifications: {
    browser: true,
    sound: true
  }
};

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // ═══════════════════════════════════════════════════════════
  // CARREGAR PREFERÊNCIAS DO SERVIDOR
  // ═══════════════════════════════════════════════════════════
  const loadPreferences = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/preferences?userId=default`, {
        headers: NGROK_HEADERS, // ✅ ngrok header
      });
      const data = await response.json();
      
      if (data.success && data.preferences) {
        console.log('✅ Preferências carregadas do servidor:', data.preferences);
        setPreferences(data.preferences);
        applyTheme(data.preferences.theme);
      } else {
        console.warn('⚠️ Sem preferências no servidor, usando padrão');
        setPreferences(DEFAULT_PREFERENCES);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar preferências:', error);
      
      // Fallback para localStorage
      const savedPrefs = localStorage.getItem('user_preferences');
      if (savedPrefs) {
        try {
          const parsed = JSON.parse(savedPrefs);
          console.log('📦 Preferências carregadas do localStorage (fallback)');
          setPreferences(parsed);
          applyTheme(parsed.theme);
        } catch (e) {
          setPreferences(DEFAULT_PREFERENCES);
        }
      } else {
        setPreferences(DEFAULT_PREFERENCES);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // INICIALIZAR
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // ═══════════════════════════════════════════════════════════
  // SOCKET.IO - SINCRONIZAÇÃO EM TEMPO REAL
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const handlePreferencesUpdated = (data: { userId: string; preferences: UserPreferences }) => {
      console.log('🔄 [REAL-TIME] Preferências atualizadas por outro dispositivo:', data.userId);
      setPreferences(data.preferences);
      applyTheme(data.preferences.theme);
      localStorage.setItem('user_preferences', JSON.stringify(data.preferences));
    };

    socketService.on('preferences:updated', handlePreferencesUpdated);

    return () => {
      socketService.off('preferences:updated', handlePreferencesUpdated);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // APLICAR TEMA
  // ═══════════════════════════════════════════════════════════
  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    const root = window.document.documentElement;
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.remove('light', 'dark');
      root.classList.add(systemTheme);
    } else {
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // ATUALIZAR PREFERÊNCIAS
  // ═══════════════════════════════════════════════════════════
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    if (!preferences) return;

    setIsSyncing(true);
    
    // Atualizar localmente primeiro (otimista)
    const newPreferences = { ...preferences, ...updates };
    setPreferences(newPreferences);
    localStorage.setItem('user_preferences', JSON.stringify(newPreferences));

    try {
      const response = await fetch(`${API_BASE_URL}/api/preferences`, {
        method: 'PATCH',
        headers: NGROK_HEADERS, // ✅ ngrok header
        body: JSON.stringify({
          userId: 'default',
          updates
        })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Preferências sincronizadas com servidor');
      } else {
        console.error('❌ Erro ao sincronizar preferências:', data.error);
      }
    } catch (error) {
      console.error('❌ Erro ao salvar preferências:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [preferences]);

  // ═══════════════════════════════════════════════════════════
  // MÉTODOS ESPECÍFICOS
  // ═══════════════════════════════════════════════════════════
  const updateTheme = useCallback(async (theme: 'light' | 'dark' | 'system') => {
    applyTheme(theme);
    await updatePreferences({ theme });
  }, [updatePreferences]);

  const updateWhatsAppGroups = useCallback(async (groups: any[]) => {
    await updatePreferences({
      whatsapp: {
        ...preferences!.whatsapp,
        selectedGroups: groups
      }
    });
  }, [updatePreferences, preferences]);

  const updateWhatsAppSession = useCallback(async (sessionId: string | null) => {
    await updatePreferences({
      whatsapp: {
        ...preferences!.whatsapp,
        currentSessionId: sessionId
      }
    });
  }, [updatePreferences, preferences]);

  const updateCustomMessage = useCallback(async (message: string) => {
    await updatePreferences({ customMessage: message });
  }, [updatePreferences]);

  const updateAutomation = useCallback(async (automation: Partial<UserPreferences['automation']>) => {
    await updatePreferences({
      automation: {
        ...preferences!.automation,
        ...automation
      }
    });
  }, [updatePreferences, preferences]);

  const resetPreferences = useCallback(async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/preferences?userId=default`, {
        method: 'DELETE',
        headers: NGROK_HEADERS, // ✅ ngrok header
      });

      const data = await response.json();
      
      if (data.success) {
        setPreferences(data.preferences);
        applyTheme(data.preferences.theme);
        localStorage.setItem('user_preferences', JSON.stringify(data.preferences));
        console.log('✅ Preferências resetadas');
      }
    } catch (error) {
      console.error('❌ Erro ao resetar preferências:', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const refreshPreferences = useCallback(async () => {
    await loadPreferences();
  }, [loadPreferences]);

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences,
        isLoading,
        isSyncing,
        updatePreferences,
        updateTheme,
        updateWhatsAppGroups,
        updateWhatsAppSession,
        updateCustomMessage,
        updateAutomation,
        resetPreferences,
        refreshPreferences
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error('useUserPreferences deve ser usado dentro de UserPreferencesProvider');
  }
  return context;
}