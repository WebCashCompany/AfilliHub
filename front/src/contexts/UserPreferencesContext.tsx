// src/contexts/UserPreferencesContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { socketService } from '@/api/services/socket.service';
import { useAuth } from '@/contexts/AuthContext';
import { ENV } from '@/config/environment';

const API_BASE_URL = ENV.API_BASE_URL;

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
    selectedChannels: Array<{ id: string; name: string }>;
  };
  automation: {
    active: boolean;
    paused: boolean;
    config: { intervalMinutes: number; categories: string[]; marketplaces: string[] } | null;
    currentProductIndex: number;
    totalSent: number;
  };
  customMessage: string;
  notifications: { browser: boolean; sound: boolean };
  updatedAt?: Date;
}

interface UserPreferencesContextData {
  preferences: UserPreferences | null;
  isLoading: boolean;
  isSyncing: boolean;
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

const DEFAULT_PREFERENCES: Omit<UserPreferences, 'userId'> = {
  theme:    'dark',
  language: 'pt-BR',
  whatsapp: { currentSessionId: null, selectedGroups: [], enabled: true },
  telegram: { enabled: false, selectedChannels: [] },
  automation: { active: false, paused: false, config: null, currentProductIndex: 0, totalSent: 0 },
  customMessage: '',
  notifications: { browser: true, sound: true }
};

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { session, user, isAuthenticated } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isSyncing,   setIsSyncing]   = useState(false);

  // ── Ref sempre atualizada — evita closure stale em todos os callbacks ──
  const preferencesRef = useRef<UserPreferences | null>(null);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  // ── Helper: headers com token JWT ────────────────────────────────
  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type':              'application/json',
      'ngrok-skip-browser-warning': 'true',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session]);

  // ── Aplicar tema ─────────────────────────────────────────────────
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

  // ── Carregar preferências ─────────────────────────────────────────
  const loadPreferences = useCallback(async () => {
    if (!isAuthenticated || !user) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/preferences`, {
        headers: getHeaders(),
      });
      const data = await response.json();

      if (data.success && data.preferences) {
        console.log('✅ Preferências carregadas do servidor:', data.preferences);
        setPreferences(data.preferences);
        applyTheme(data.preferences.theme);
      } else {
        console.warn('⚠️ Sem preferências no servidor, usando padrão');
        setPreferences({ userId: user.id, ...DEFAULT_PREFERENCES });
      }
    } catch (error) {
      console.error('❌ Erro ao carregar preferências:', error);
      setPreferences({ userId: user.id, ...DEFAULT_PREFERENCES });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user, getHeaders]);

  // ── Inicializar quando o usuário logar ───────────────────────────
  useEffect(() => {
    if (isAuthenticated && user) {
      loadPreferences();
    } else if (!isAuthenticated) {
      setPreferences(null);
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  // ── Socket.IO — sincronização em tempo real ───────────────────────
  useEffect(() => {
    const handlePreferencesUpdated = (data: { userId: string; preferences: UserPreferences }) => {
      if (!user || data.userId !== user.id) return;
      console.log('🔄 [REAL-TIME] Preferências atualizadas');
      setPreferences(data.preferences);
      applyTheme(data.preferences.theme);
    };

    socketService.on('preferences:updated', handlePreferencesUpdated);
    return () => { socketService.off('preferences:updated', handlePreferencesUpdated); };
  }, [user?.id]);

  // ── Atualizar preferências — sem closure stale via ref ────────────
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    if (!isAuthenticated) return;

    const current = preferencesRef.current;
    if (!current) return;

    const newPreferences = { ...current, ...updates };

    // Otimista: atualiza local imediatamente
    setPreferences(newPreferences);
    setIsSyncing(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/preferences`, {
        method:  'PATCH',
        headers: getHeaders(),
        body:    JSON.stringify({ updates })
      });

      const data = await response.json();
      if (!data.success) {
        console.error('❌ Erro ao sincronizar preferências:', data.error);
        setPreferences(current); // reverte pro valor correto (não stale)
      }
    } catch (error) {
      console.error('❌ Erro ao salvar preferências:', error);
      setPreferences(current);
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, getHeaders]); // ← sem `preferences` nas deps

  const updateTheme = useCallback(async (theme: 'light' | 'dark' | 'system') => {
    applyTheme(theme);
    await updatePreferences({ theme });
  }, [updatePreferences]);

  // ── updateWhatsAppGroups — lê whatsapp atual via ref, sem stale ───
  const updateWhatsAppGroups = useCallback(async (groups: any[]) => {
    const current = preferencesRef.current;
    if (!current) return;
    await updatePreferences({
      whatsapp: { ...current.whatsapp, selectedGroups: groups }
    });
  }, [updatePreferences]);

  const updateWhatsAppSession = useCallback(async (sessionId: string | null) => {
    const current = preferencesRef.current;
    if (!current) return;
    await updatePreferences({
      whatsapp: { ...current.whatsapp, currentSessionId: sessionId }
    });
  }, [updatePreferences]);

  const updateCustomMessage = useCallback(async (message: string) => {
    await updatePreferences({ customMessage: message });
  }, [updatePreferences]);

  const updateAutomation = useCallback(async (automation: Partial<UserPreferences['automation']>) => {
    const current = preferencesRef.current;
    if (!current) return;
    await updatePreferences({
      automation: { ...current.automation, ...automation }
    });
  }, [updatePreferences]);

  const resetPreferences = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/preferences`, {
        method:  'DELETE',
        headers: getHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setPreferences(data.preferences);
        applyTheme(data.preferences.theme);
      }
    } catch (error) {
      console.error('❌ Erro ao resetar preferências:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, getHeaders]);

  const refreshPreferences = useCallback(async () => {
    await loadPreferences();
  }, [loadPreferences]);

  return (
    <UserPreferencesContext.Provider value={{
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
    }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (!context) throw new Error('useUserPreferences deve ser usado dentro de UserPreferencesProvider');
  return context;
}