import { useState, useEffect } from 'react';
import axios from 'axios';
import { ENV } from '@/config/environment';

const API_URL = `${ENV.API_BASE_URL}/api`;

export type Marketplace = 'mercadolivre' | 'amazon' | 'magalu' | 'shopee';

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
      const [mlResponse, magaluResponse] = await Promise.allSettled([
        axios.get(`${API_URL}/ml/status`),
        axios.get(`${API_URL}/integrations/magalu`),
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