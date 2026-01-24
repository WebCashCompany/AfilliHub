// src/contexts/DashboardContext.tsx - COM POLLING REAL DO BACKEND

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef
} from 'react';

import {
  Product,
  DailyMetrics,
  CategoryMetrics,
  MarketplaceMetrics,
  generateDailyMetrics,
  generateCategoryMetrics,
  generateMarketplaceMetrics,
  Marketplace
} from '@/lib/mockData';

import { parsePriceToCents, getDiscount } from '@/lib/priceUtils';
import { scrapingService } from '@/api/services/scraping.service';
import type { ScrapingRequestPayload } from '@/types/api.types';
import { useToast } from '@/hooks/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface DashboardContextType {
  products: Product[];
  dailyMetrics: DailyMetrics[];
  categoryMetrics: CategoryMetrics[];
  marketplaceMetrics: MarketplaceMetrics[];
  trashedProducts: Product[];
  isLoading: boolean;
  deleteProducts: (ids: string[]) => Promise<void>;
  runCleanup: () => Promise<number>;
  refreshProducts: () => Promise<void>;
  runScraping: (config: ScrapingConfig) => Promise<number>;
  scrapingStatus: ScrapingStatus;
}

export interface ScrapingConfig {
  marketplaces: {
    mercadolivre: { enabled: boolean; quantity: number; filters?: any };
    amazon: { enabled: boolean; quantity: number; filters?: any };
    magalu: { enabled: boolean; quantity: number; filters?: any };
    shopee: { enabled: boolean; quantity: number; filters?: any };
  };
  minDiscount: number;
  maxPrice: number;
  filters?: any;
}

export interface ScrapingStatus {
  isRunning: boolean;
  progress: number;
  currentMarketplace: Marketplace | null;
  itemsCollected: number;
  totalItems: number;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [trashedProducts] = useState<Product[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [categoryMetrics, setCategoryMetrics] = useState<CategoryMetrics[]>([]);
  const [marketplaceMetrics, setMarketplaceMetrics] = useState<MarketplaceMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [scrapingStatus, setScrapingStatus] = useState<ScrapingStatus>(() => {
    const saved = localStorage.getItem('scraping_status');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao carregar scraping status:', e);
      }
    }
    return {
      isRunning: false,
      progress: 0,
      currentMarketplace: null,
      itemsCollected: 0,
      totalItems: 0
    };
  });

  const { toast } = useToast();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem('scraping_status', JSON.stringify(scrapingStatus));
  }, [scrapingStatus]);

  function normalizeMarketplace(mp: string): Marketplace {
    const map: Record<string, Marketplace> = {
      ML: 'mercadolivre',
      mercadolivre: 'mercadolivre',
      shopee: 'shopee',
      amazon: 'amazon',
      magalu: 'magalu'
    };
    return map[mp] || 'mercadolivre';
  }

  const refreshProducts = async () => {
    setIsLoading(true);
    const url = `${API_BASE_URL}/api/products`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const items = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data?.items)
        ? json.data.items
        : [];

      const formatted: Product[] = items.map((p: any) => {
        const priceCents = parsePriceToCents(p.preco_para || p.price || 0);
        const oldPriceCents = parsePriceToCents(p.preco_de || p.oldPrice || 0);
        const discount = getDiscount(p);

        return {
          id: p._id || p.id,
          name: p.nome || p.title || 'Produto',
          image: p.imagem || p.thumbnail || '',
          category: p.categoria || 'Geral',
          marketplace: normalizeMarketplace(p.marketplace),
          price: priceCents,
          oldPrice: oldPriceCents,
          discount: discount,
          affiliateLink: p.link_afiliado || '',
          clicks: 0,
          conversions: 0,
          revenue: 0,
          stock: 100,
          status: 'active',
          addedAt: new Date(p.createdAt || Date.now())
        };
      });

      setProducts(formatted);
      setDailyMetrics(generateDailyMetrics(30));
      setCategoryMetrics(generateCategoryMetrics(formatted));
      setMarketplaceMetrics(generateMarketplaceMetrics(formatted));
    } catch (err) {
      toast({
        title: 'Erro ao carregar produtos',
        description: 'Falha ao buscar /api/products',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProducts();
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const deleteProducts = async (ids: string[]) => {
    await fetch(`${API_BASE_URL}/api/products/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    await refreshProducts();
  };

  const runCleanup = async (): Promise<number> => {
    await fetch(`${API_BASE_URL}/api/products/cleanup/all`, { method: 'DELETE' });
    await refreshProducts();
    return 0;
  };

  // ═══════════════════════════════════════════════════════════
  // POLLING EM TEMPO REAL DO STATUS DO BACKEND
  // ═══════════════════════════════════════════════════════════
  const startStatusPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log('🔄 Iniciando polling de status do scraping...');

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await scrapingService.getStatus();
        
        if (response.success && response.data) {
          const backendStatus = response.data as any;
          
          // ✅ MAPEAR STATUS DO BACKEND CORRETAMENTE
          const isRunning = backendStatus.status === 'running';
          const isCompleted = backendStatus.status === 'completed';
          
          setScrapingStatus(prev => ({
            isRunning: isRunning,
            progress: backendStatus.progress || 0,
            currentMarketplace: backendStatus.currentMarketplace 
              ? normalizeMarketplace(backendStatus.currentMarketplace)
              : null,
            itemsCollected: backendStatus.itemsCollected || 0,
            totalItems: backendStatus.totalItems || prev.totalItems
          }));

          // Para o polling se o scraping terminou
          if (isCompleted && prev.isRunning) {
            console.log('✅ Scraping finalizado pelo backend, parando polling');
            stopStatusPolling();
            
            // Atualiza produtos após conclusão
            setTimeout(() => {
              refreshProducts();
              
              // Limpa o status após 3 segundos
              setTimeout(() => {
                setScrapingStatus({
                  isRunning: false,
                  progress: 0,
                  currentMarketplace: null,
                  itemsCollected: 0,
                  totalItems: 0
                });
              }, 3000);
            }, 1000);
          }
        }
      } catch (error) {
        console.error('❌ Erro ao buscar status do backend:', error);
      }
    }, 2000); // Poll a cada 2 segundos
  };

  const stopStatusPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('⏹️ Polling parado');
    }
  };

  const runScraping = async (config: ScrapingConfig): Promise<number> => {
    const totalItems = Object.values(config.marketplaces)
      .filter(mp => mp.enabled)
      .reduce((sum, mp) => sum + mp.quantity, 0);

    const enabledMarketplaces = Object.entries(config.marketplaces)
      .filter(([_, mp]) => mp.enabled)
      .map(([key]) => key as Marketplace);

    // Inicia status local
    setScrapingStatus({
      isRunning: true,
      progress: 0,
      currentMarketplace: enabledMarketplaces[0] || null,
      itemsCollected: 0,
      totalItems
    });

    try {
      const payload: ScrapingRequestPayload = {
        marketplaces: Object.fromEntries(
          Object.entries(config.marketplaces).map(([key, mp]) => {
            return [
              key,
              {
                enabled: mp.enabled,
                quantity: mp.quantity,
                filters: mp.filters || {}
              }
            ];
          })
        ),
        minDiscount: config.minDiscount,
        maxPrice: config.maxPrice,
        filters: config.filters || {}
      };

      // Inicia o scraping no backend
      const res = await scrapingService.start(payload);

      if (res.success) {
        // ✅ INICIA POLLING EM TEMPO REAL
        startStatusPolling();
        
        return res.data?.total || 0;
      }

      throw new Error('Scraping falhou');
    } catch (error) {
      stopStatusPolling();
      
      setScrapingStatus({
        isRunning: false,
        progress: 0,
        currentMarketplace: null,
        itemsCollected: 0,
        totalItems: 0
      });
      
      throw error;
    }
  };

  return (
    <DashboardContext.Provider
      value={{
        products,
        dailyMetrics,
        categoryMetrics,
        marketplaceMetrics,
        trashedProducts,
        isLoading,
        deleteProducts,
        runCleanup,
        refreshProducts,
        runScraping,
        scrapingStatus
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard fora do Provider');
  return ctx;
};