// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  // ✅ Busca perfil APENAS na tabela profiles — sem fallback
  // Se não encontrar, retorna null e o login é bloqueado
  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, role, avatar_url, created_at')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[Auth] Perfil não encontrado na tabela profiles:', error.message);
        return null;
      }

      return data as UserProfile;
    } catch (e) {
      console.warn('[Auth] Erro ao buscar perfil:', e);
      return null;
    }
  };

  useEffect(() => {
    const hardTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 6000);

    const init = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn('[Auth] Erro na sessão, limpando cache:', sessionError.message);
          clearSupabaseCache();
          await supabase.auth.signOut();
          return;
        }

        if (!session) return;

        // Valida token no servidor
        const { data: { user: freshUser }, error: userError } = await supabase.auth.getUser();

        if (userError || !freshUser) {
          console.warn('[Auth] Token inválido, limpando...');
          clearSupabaseCache();
          await supabase.auth.signOut();
          return;
        }

        // Busca perfil — SEM fallback
        const prof = await fetchProfile(freshUser.id);

        if (!prof) {
          // Usuário existe no auth mas não tem perfil cadastrado → desloga
          console.warn('[Auth] Usuário sem perfil cadastrado, deslogando...');
          clearSupabaseCache();
          await supabase.auth.signOut();
          return;
        }

        setSession(session);
        setUser(freshUser);
        setProfile(prof);

      } catch (e) {
        console.error('[Auth] Erro crítico:', e);
        clearSupabaseCache();
        await supabase.auth.signOut();
      } finally {
        clearTimeout(hardTimeout);
        setIsLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT' || !session) {
        setSession(null);
        setUser(null);
        setProfile(null);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const prof = await fetchProfile(session.user.id);

        if (!prof) {
          // Sem perfil → desloga imediatamente
          console.warn('[Auth] Login sem perfil bloqueado.');
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
      }
    });

    return () => {
      clearTimeout(hardTimeout);
      subscription.unsubscribe();
    };
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

      if (!data.user) return { error: 'Erro inesperado. Tente novamente.' };

      // Verifica se tem perfil cadastrado antes de liberar
      const prof = await fetchProfile(data.user.id);

      if (!prof) {
        await supabase.auth.signOut();
        return { error: 'Acesso não autorizado. Solicite ao administrador.' };
      }

      return { error: null };
    } catch {
      return { error: 'Erro inesperado. Tente novamente.' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearSupabaseCache();
    setProfile(null);
    setUser(null);
    setSession(null);
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