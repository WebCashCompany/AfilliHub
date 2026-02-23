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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  hasAccess: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ROLE_ROUTES: Record<UserRole, string[]> = {
  administrador: ['*'],
  empresa: ['*'],
  colaborador: ['/products', '/automation'],
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Evita race conditions: se múltiplos eventos chegarem, apenas o último vence
  const initDone = useRef(false);

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, role, avatar_url, created_at')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[Auth] Perfil não encontrado:', error.message);
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
    // Listener de mudanças de auth — registrado ANTES do init para não perder eventos
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] Evento:', event);

      // O init() cuida do estado inicial — o listener não deve interferir
      if (!initDone.current) return;

      if (event === 'SIGNED_OUT' || !session) {
        clearSession();
        return;
      }

      if (event === 'SIGNED_IN') {
        await applySession(session);
        return;
      }

      // TOKEN_REFRESHED: apenas atualiza a sessão sem rebuscar perfil
      // (evita deslogar por falha de rede num refresh silencioso)
      if (event === 'TOKEN_REFRESHED' && session) {
        setSession(session);
        setUser(session.user);
        // Só rebusca perfil se ainda não tiver um carregado
        setProfile(prev => {
          if (prev) return prev;
          // Se não tiver perfil, busca em background
          fetchProfile(session.user.id).then(prof => {
            if (prof) setProfile(prof);
          });
          return prev;
        });
      }
    });

    const init = async () => {
      try {
        // getSession() lê do localStorage — rápido, sem chamada de rede
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn('[Auth] Erro ao recuperar sessão:', sessionError.message);
          clearSupabaseCache();
          clearSession();
          return;
        }

        if (!session) {
          // Nenhuma sessão salva — usuário não estava logado
          clearSession();
          return;
        }

        // Sessão existe: busca o perfil e seta o estado
        // Não chamamos getUser() aqui para evitar falhas de rede que desloguem
        // o usuário desnecessariamente. O token será validado naturalmente
        // quando fizer a primeira query autenticada.
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

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.includes('Invalid login credentials')) return { error: 'E-mail ou senha incorretos.' };
        if (error.message.includes('Email not confirmed')) return { error: 'E-mail não confirmado. Verifique sua caixa de entrada.' };
        if (error.message.includes('Database error')) return { error: 'Erro no servidor. Tente novamente.' };
        return { error: error.message };
      }

      if (!data.user || !data.session) return { error: 'Erro inesperado. Tente novamente.' };

      // Verifica perfil antes de liberar acesso
      const prof = await fetchProfile(data.user.id);

      if (!prof) {
        await supabase.auth.signOut();
        return { error: 'Acesso não autorizado. Solicite ao administrador.' };
      }

      // Aplica estado manualmente aqui para resposta imediata
      // (o onAuthStateChange também vai disparar SIGNED_IN, mas o initDone
      //  já estará true, então vai passar por applySession normalmente)
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