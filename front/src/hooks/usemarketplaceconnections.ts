import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

export type Marketplace = 'mercadolivre' | 'amazon' | 'magalu' | 'shopee';

interface ConnectionStatus {
  marketplace: Marketplace;
  connected: boolean;
  hasActiveAccount: boolean;
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
      // Verifica Mercado Livre
      const mlResponse = await axios.get(`${API_URL}/sessions/ml`);
      const hasActiveMl = mlResponse.data.accounts?.some((acc: any) => acc.isActive && acc.status === 'valid');

      setConnections({
        mercadolivre: hasActiveMl,
        amazon: false, // Em breve
        magalu: false, // Em breve
        shopee: false, // Em breve
      });
    } catch (error) {
      console.error('Erro ao verificar conexões:', error);
      setConnections({
        mercadolivre: false,
        amazon: false,
        magalu: false,
        shopee: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnections();
    // Revalidar a cada 30 segundos
    const interval = setInterval(checkConnections, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    connections,
    loading,
    refresh: checkConnections,
  };
}