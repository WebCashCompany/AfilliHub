// src/pages/MLCallbackPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ENV } from '@/config/environment';

const API_URL = `${ENV.API_BASE_URL}/api`;

export function MLCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const code  = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setErrorMsg(error);
      setTimeout(() => navigate('/settings?ml_error=' + error), 2500);
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMsg('Código de autorização não recebido.');
      setTimeout(() => navigate('/settings?ml_error=no_code'), 2500);
      return;
    }

    axios.post(`${API_URL}/ml/exchange-code`, { code })
      .then(() => {
        setStatus('success');
        setTimeout(() => navigate('/settings?ml_connected=true'), 1500);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'Falha ao autenticar.');
        setTimeout(() => navigate('/settings?ml_error=token_exchange_failed'), 2500);
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-lg font-semibold">Autenticando com Mercado Livre...</p>
            <p className="text-sm text-muted-foreground">Aguarde, estamos salvando suas credenciais.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-green-600">Conectado com sucesso!</p>
            <p className="text-sm text-muted-foreground">Redirecionando para Configurações...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-red-600">Falha na autenticação</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <p className="text-xs text-muted-foreground">Redirecionando...</p>
          </>
        )}
      </div>
    </div>
  );
}