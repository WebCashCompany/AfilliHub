import { useState, useEffect } from 'react';
import axios from 'axios';
import { ENV } from '@/config/environment';

const API_URL = `${ENV.API_BASE_URL}/api`;

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

      // 🔥 VERIFICA MAGALU - Busca o ID do Parceiro
      const magaluResponse = await axios.get(`${API_URL}/integrations/magalu`).catch(() => ({ data: null }));
      const hasMagalu = !!(magaluResponse.data && magaluResponse.data.affiliateId);

      setConnections({
        mercadolivre: hasActiveMl,
        amazon: false, // Em breve
        magalu: hasMagalu, // 🔥 AGORA VERIFICA SE TEM ID CONFIGURADO
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
    
    // 🔥 ESCUTA EVENTO CUSTOMIZADO disparado quando salva config do Magalu
    const handleMagaluUpdate = () => {
      checkConnections();
    };
    window.addEventListener('magalu-config-updated', handleMagaluUpdate);

    // Revalidar a cada 30 segundos
    const interval = setInterval(checkConnections, 30000);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('magalu-config-updated', handleMagaluUpdate);
    };
  }, []);

  return {
    connections,
    loading,
    refresh: checkConnections,
  };
}