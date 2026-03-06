// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, UserProfile, UserRole } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  hasAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Hierarquia: basico < premium < max
// - basico: acesso apenas a produtos e automação
// - premium: acesso ampliado (sem analytics/relatórios avançados)
// - max: acesso total
const ROLE_ROUTES: Record<UserRole, string[]> = {
  basico:   ['/products', '/automation'],
  premium:  ['/products', '/automation', '/distribution', '/reports', '/goals', '/settings', '/trash'],
  max:      ['*'],
};

const clearSupabaseCache = () => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* silencioso */ }
};

// Chave usada para sinalizar que a sessão NÃO deve ser persistida entre abas/reloads
const SESSION_ONLY_FLAG = 'sb-session-only';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initDone = useRef(false);

  // ⚠️ FIX CRÍTICO: sempre filtra pelo userId passado explicitamente,
  // nunca confia em filtros implícitos. Isso evita que uma conta
  // veja dados de outra quando o RLS não está configurado corretamente.
  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, role, avatar_url, created_at')
        .eq('id', userId)   // ← filtro explícito por userId
        .single();

      if (error) {
        console.warn('[Auth] Perfil não encontrado:', error.message);
        return null;
      }

      // Validação extra: garante que o perfil retornado realmente pertence ao usuário
      if (!data || data.id !== userId) {
        console.error('[Auth] Perfil retornado não corresponde ao usuário autenticado!');
        return null;
      }

      return data as UserProfile;
    } catch (e) {
      console.warn('[Auth] Erro ao buscar perfil:', e);
      return null;
    }
  };

  const applySession = async (session: Session) => {
    const prof = await fetchProfile(session.user.id);

    if (!prof) {
      console.warn('[Auth] Usuário sem perfil, deslogando...');
      await supabase.auth.signOut();
      clearSupabaseCache();
      sessionStorage.removeItem(SESSION_ONLY_FLAG);
      setSession(null);
      setUser(null);
      setProfile(null);
      return;
    }

    setSession(session);
    setUser(session.user);
    setProfile(prof);
  };

  const clearSession = () => {
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] Evento:', event);

      if (!initDone.current) return;

      if (event === 'SIGNED_OUT' || !session) {
        clearSession();
        return;
      }

      if (event === 'SIGNED_IN') {
        await applySession(session);
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        setSession(session);
        setUser(session.user);
        setProfile(prev => {
          if (prev) return prev;
          fetchProfile(session.user.id).then(prof => {
            if (prof) setProfile(prof);
          });
          return prev;
        });
      }
    });

    const init = async () => {
      try {
        const sessionOnly = sessionStorage.getItem(SESSION_ONLY_FLAG);

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn('[Auth] Erro ao recuperar sessão:', sessionError.message);
          clearSupabaseCache();
          clearSession();
          return;
        }

        if (!session && !sessionOnly) {
          clearSession();
          return;
        }

        if (!session) {
          sessionStorage.removeItem(SESSION_ONLY_FLAG);
          clearSession();
          return;
        }

        // ⚠️ FIX: verifica se a sessão recuperada realmente pertence a um usuário válido
        // antes de aplicar. Evita sessões "fantasmas" de outros usuários.
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser || currentUser.id !== session.user.id) {
          console.error('[Auth] Sessão inconsistente detectada, limpando...');
          await supabase.auth.signOut();
          clearSupabaseCache();
          clearSession();
          return;
        }

        await applySession(session);
      } catch (e) {
        console.error('[Auth] Erro crítico no init:', e);
        clearSession();
      } finally {
        initDone.current = true;
        setIsLoading(false);
      }
    };

    init();

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (
    email: string,
    password: string,
    rememberMe: boolean = true,
  ): Promise<{ error: string | null }> => {
    try {
      // ⚠️ FIX: limpa qualquer sessão/cache anterior ANTES de fazer login,
      // evitando que dados de um usuário anterior "contaminem" o novo login.
      clearSupabaseCache();
      sessionStorage.removeItem(SESSION_ONLY_FLAG);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.includes('Invalid login credentials')) return { error: 'E-mail ou senha incorretos.' };
        if (error.message.includes('Email not confirmed')) return { error: 'E-mail não confirmado. Verifique sua caixa de entrada.' };
        if (error.message.includes('Database error')) return { error: 'Erro no servidor. Tente novamente.' };
        return { error: error.message };
      }

      if (!data.user || !data.session) return { error: 'Erro inesperado. Tente novamente.' };

      const prof = await fetchProfile(data.user.id);

      if (!prof) {
        await supabase.auth.signOut();
        return { error: 'Acesso não autorizado. Solicite ao administrador.' };
      }

      if (!rememberMe) {
        clearSupabaseCache();
        sessionStorage.setItem(SESSION_ONLY_FLAG, '1');
      } else {
        sessionStorage.removeItem(SESSION_ONLY_FLAG);
      }

      setSession(data.session);
      setUser(data.user);
      setProfile(prof);

      return { error: null };
    } catch {
      return { error: 'Erro inesperado. Tente novamente.' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearSupabaseCache();
    sessionStorage.removeItem(SESSION_ONLY_FLAG);
    clearSession();
  };

  const resetPassword = async (email: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) return { error: error.message };
      return { error: null };
    } catch {
      return { error: 'Erro ao enviar e-mail. Tente novamente.' };
    }
  };

  const hasAccess = (path: string): boolean => {
    if (!profile) return false;
    const allowed = ROLE_ROUTES[profile.role];
    if (allowed.includes('*')) return true;
    return allowed.some(route => path.startsWith(route));
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      session,
      isLoading,
      isAuthenticated: !!session && !!profile,
      role: profile?.role ?? null,
      signIn,
      signOut,
      resetPassword,
      hasAccess,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}

export { ROLE_ROUTES };