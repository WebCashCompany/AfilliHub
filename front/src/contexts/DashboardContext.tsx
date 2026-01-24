// src/contexts/DashboardContext.tsx - COM SSE E SYNC REAL

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
  resetScrapingStatus: () => void;
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
  lastProducts?: Array<{
    name: string;
    image: string;
    price: number;
    oldPrice: number;
    discount: number;
  }>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

function getInitialScrapingStatus(): ScrapingStatus {
  return {
    isRunning: false,
    progress: 0,
    currentMarketplace: null,
    itemsCollected: 0,
    totalItems: 0,
    lastProducts: []
  };
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [trashedProducts] = useState<Product[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [categoryMetrics, setCategoryMetrics] = useState<CategoryMetrics[]>([]);
  const [marketplaceMetrics, setMarketplaceMetrics] = useState<MarketplaceMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scrapingStatus, setScrapingStatus] = useState<ScrapingStatus>(getInitialScrapingStatus);

  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(null);

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

  function formatNumber(num: number): string {
    return new Intl.NumberFormat('pt-BR').format(num);
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
      console.error('Erro ao carregar produtos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProducts();
    
    // Verifica status inicial do backend
    const checkInitialStatus = async () => {
      try {
        const response = await scrapingService.getStatus();
        if (response.success && response.data) {
          const backendStatus = response.data as any;
          
          if (backendStatus.status === 'running' && backendStatus.sessionId) {
            console.log('🔄 Scraping ativo detectado, conectando SSE...');
            sessionIdRef.current = backendStatus.sessionId;
            connectSSE(backendStatus.sessionId);
          }
        }
      } catch (error) {
        console.log('Backend não disponível ou sem scraping ativo');
      }
    };

    checkInitialStatus();

    return () => {
      disconnectSSE();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // SSE - SERVER SENT EVENTS
  // ═══════════════════════════════════════════════════════════
  const connectSSE = (sessionId: string) => {
    disconnectSSE(); // Garante que não há conexão anterior

    const sseUrl = `${API_BASE_URL}/api/scraping/progress/${sessionId}`;
    console.log('📡 Conectando SSE:', sseUrl);

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📊 SSE recebido:', data);

        setScrapingStatus({
          isRunning: data.status === 'running',
          progress: data.progress || 0,
          currentMarketplace: data.currentMarketplace 
            ? normalizeMarketplace(data.currentMarketplace)
            : null,
          itemsCollected: data.itemsCollected || 0,
          totalItems: data.totalItems || 0,
          lastProducts: data.lastProducts || []
        });

        // Se completou, desconecta
        if (data.status === 'completed') {
          console.log('✅ Scraping concluído via SSE');
          
          toast({
            title: "✅ Automação concluída!",
            description: `${formatNumber(data.itemsCollected)} novos produtos foram adicionados.`,
            className: "bg-green-600 text-white border-none shadow-lg",
          });

          setTimeout(() => {
            disconnectSSE();
            refreshProducts();
            
            setTimeout(() => {
              setScrapingStatus(getInitialScrapingStatus());
            }, 3000);
          }, 1000);
        }
      } catch (error) {
        console.error('❌ Erro ao processar SSE:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ Erro SSE:', error);
      disconnectSSE();
    };

    eventSourceRef.current = eventSource;
  };

  const disconnectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      console.log('⏹️ SSE desconectado');
    }
  };

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

  const resetScrapingStatus = () => {
    console.log('🔄 Reset manual do status');
    disconnectSSE();
    setScrapingStatus(getInitialScrapingStatus());
    sessionIdRef.current = null;
    
    toast({
      title: "Status resetado",
      description: "O status de scraping foi reinicializado.",
    });
  };

  const runScraping = async (config: ScrapingConfig): Promise<number> => {
    const totalItems = Object.values(config.marketplaces)
      .filter(mp => mp.enabled)
      .reduce((sum, mp) => sum + mp.quantity, 0);

    const enabledMarketplaces = Object.entries(config.marketplaces)
      .filter(([_, mp]) => mp.enabled)
      .map(([key]) => key as Marketplace);

    // Estado inicial otimista
    setScrapingStatus({
      isRunning: true,
      progress: 0,
      currentMarketplace: enabledMarketplaces[0] || null,
      itemsCollected: 0,
      totalItems,
      lastProducts: []
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

      console.log('🚀 Iniciando scraping...');
      const res = await scrapingService.start(payload);

      if (res.success && res.data?.sessionId) {
        sessionIdRef.current = res.data.sessionId;
        console.log('✅ Scraping iniciado, conectando SSE...');
        connectSSE(res.data.sessionId);
        return res.data.total || 0;
      }

      throw new Error('Scraping falhou');
    } catch (error) {
      console.error('❌ Erro ao iniciar scraping:', error);
      setScrapingStatus(getInitialScrapingStatus());
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
        scrapingStatus,
        resetScrapingStatus
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