// src/pages/LoginPage.tsx
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import logo from '@/assets/logo.png';
import bgVideo from '@/assets/background.mp4';

type View = 'login' | 'reset' | 'reset-sent';

export function LoginPage() {
  const { signIn, resetPassword, isAuthenticated, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState('');

  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0d14]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Preencha todos os campos.');
      return;
    }
    setIsLoading(true);
    const { error } = await signIn(email.trim(), password, rememberMe);
    if (error) setError(error);
    setIsLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!resetEmail.trim()) {
      setError('Digite seu e-mail.');
      return;
    }
    setIsLoading(true);
    const { error } = await resetPassword(resetEmail.trim());
    if (error) {
      setError(error);
    } else {
      setView('reset-sent');
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden">

      {/* ── Vídeo de fundo ── */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        src={bgVideo}
      />

      {/* ── Overlay escuro para legibilidade ── */}
      <div className="absolute inset-0 bg-[#0a0d14]/70 backdrop-blur-[2px]" />

      {/* ── Gradientes decorativos sobre o vídeo ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-600/8 blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-blue-500/8 blur-[80px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-transparent via-blue-500/30 to-transparent" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-t from-transparent via-blue-500/30 to-transparent" />
      </div>

      {/* ── Card principal ── */}
      <div className="relative w-full max-w-[420px] mx-auto flex-shrink-0">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent pointer-events-none" />

        <div className="relative bg-[#0f1320]/80 backdrop-blur-xl rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/70 overflow-hidden">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />

          <div className="p-8">
            {/* VIEW: LOGIN */}
            {view === 'login' && (
              <>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 mb-5 relative">
                    <img
                      src={logo}
                      alt="Logo"
                      className="w-14 h-14 object-contain"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-blue-500/5 blur-sm" />
                  </div>
                  <h1 className="text-2xl font-bold text-white tracking-tight mb-1">
                    VANT
                  </h1>
                  <p className="text-sm text-slate-400">
                    Entre com sua conta para continuar
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      E-mail
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="pl-10 h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                        autoComplete="email"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="pl-10 pr-10 h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                        autoComplete="current-password"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(p => !p)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <button
                      type="button"
                      onClick={() => setRememberMe(prev => !prev)}
                      className="flex items-center gap-2.5 group"
                      disabled={isLoading}
                    >
                      <span
                        className={`relative flex-shrink-0 rounded flex items-center justify-center border transition-all duration-150 ${
                          rememberMe
                            ? 'bg-blue-600 border-blue-500'
                            : 'bg-white/[0.04] border-white/[0.12] group-hover:border-white/25'
                        }`}
                        style={{ width: '18px', height: '18px' }}
                      >
                        {rememberMe && (
                          <svg
                            className="w-2.5 h-2.5 text-white"
                            viewBox="0 0 10 8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M1 4l3 3 5-6" />
                          </svg>
                        )}
                      </span>
                      <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors select-none">
                        Lembrar-me
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setView('reset'); setError(null); setResetEmail(email); }}
                      className="text-sm text-slate-500 hover:text-blue-400 transition-colors underline-offset-4 hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 mt-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      'Entrar'
                    )}
                  </Button>
                </form>

                <div className="mt-6 pt-5 border-t border-white/[0.05]">
                  <p className="text-center text-xs text-slate-600">
                    Não tem conta? O acesso é fornecido pelo administrador.
                  </p>
                </div>
              </>
            )}

            {/* VIEW: RESET PASSWORD */}
            {view === 'reset' && (
              <>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 mb-5">
                    <Mail className="w-7 h-7 text-blue-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">Redefinir senha</h2>
                  <p className="text-sm text-slate-400">
                    Enviaremos um link de redefinição para seu e-mail
                  </p>
                </div>

                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      E-mail
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        className="pl-10 h-11 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                        disabled={isLoading}
                        autoFocus
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg shadow-blue-600/20"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      'Enviar link de redefinição'
                    )}
                  </Button>
                </form>

                <button
                  type="button"
                  onClick={() => { setView('login'); setError(null); }}
                  className="mt-5 w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar para o login
                </button>
              </>
            )}

            {/* VIEW: RESET SENT */}
            {view === 'reset-sent' && (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 mb-5">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">E-mail enviado!</h2>
                <p className="text-sm text-slate-400 mb-1">
                  Enviamos um link de redefinição para
                </p>
                <p className="text-sm font-medium text-blue-400 mb-6">{resetEmail}</p>
                <p className="text-xs text-slate-600 mb-6">
                  Verifique sua caixa de entrada e spam. O link expira em 1 hora.
                </p>
                <Button
                  variant="outline"
                  onClick={() => { setView('login'); setError(null); }}
                  className="border-white/10 text-slate-300 hover:bg-white/5 hover:text-white gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar para o login
                </Button>
              </div>
            )}
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          <div className="px-8 py-3 text-center">
            <p className="text-[10px] text-slate-700 tracking-wider uppercase">
              Plataforma segura · Acesso restrito
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}