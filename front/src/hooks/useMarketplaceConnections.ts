import { useState, useEffect } from 'react';
import axios from 'axios';
import { ENV } from '@/config/environment';
import { supabase } from '@/lib/supabase';

const API_URL = `${ENV.API_BASE_URL}/api`;

export type Marketplace = 'mercadolivre' | 'amazon' | 'magalu' | 'shopee';

// ─── Helper: headers com JWT + ngrok ────────────────────────────────────────
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'ngrok-skip-browser-warning': 'true',
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export function useMarketplaceConnections() {
  const [connections, setConnections] = useState<Record<Marketplace, boolean>>({
    mercadolivre: false,
    amazon: false,
    magalu: false,
    shopee: false,
  });

  const [loading, setLoading] = useState(true);

  const checkConnections = async () => {
    try {
      const headers = await getAuthHeaders();

      const [mlResponse, magaluResponse] = await Promise.allSettled([
        axios.get(`${API_URL}/ml/status`, { headers }),
        axios.get(`${API_URL}/integrations/magalu`, { headers }),
      ]);

      const hasActiveMl =
        mlResponse.status === 'fulfilled' &&
        mlResponse.value.data.authenticated === true;

      const hasMagalu =
        magaluResponse.status === 'fulfilled' &&
        !!(magaluResponse.value.data?.affiliateId);

      setConnections({
        mercadolivre: hasActiveMl,
        amazon: false,
        magalu: hasMagalu,
        shopee: false,
      });
    } catch (error) {
      console.error('Erro ao verificar conexões:', error);
      setConnections({ mercadolivre: false, amazon: false, magalu: false, shopee: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnections();

    window.addEventListener('magalu-config-updated', checkConnections);
    window.addEventListener('ml-connected', checkConnections);

    const interval = setInterval(checkConnections, 30000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('magalu-config-updated', checkConnections);
      window.removeEventListener('ml-connected', checkConnections);
    };
  }, []);

  return { connections, loading, refresh: checkConnections };
}