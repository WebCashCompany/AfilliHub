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

// 1️⃣ INTERFACE ATUALIZADA COM liveProducts
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
  liveProducts?: Array<{  // 🔥 ADICIONADO
    name: string;
    image: string;
    price: number;
    oldPrice: number;
    discount: number;
    status: 'processing' | 'saved' | 'error';
  }>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

// 2️⃣ FUNÇÃO getInitialScrapingStatus ATUALIZADA
function getInitialScrapingStatus(): ScrapingStatus {
  return {
    isRunning: false,
    progress: 0,
    currentMarketplace: null,
    itemsCollected: 0,
    totalItems: 0,
    lastProducts: [],
    liveProducts: []  // 🔥 ADICIONADO
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
    disconnectSSE();

    const sseUrl = `${API_BASE_URL}/api/scraping/progress/${sessionId}`;
    console.log('🔌 CONECTANDO SSE:', sseUrl);
    console.log('🔌 Session ID:', sessionId);

    const eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      console.log('✅ SSE CONECTADO COM SUCESSO!');
      // ✅ INICIA POLLING PARALELO COMO BACKUP
      startBackupPolling();
    };

    // 3️⃣ eventSource.onmessage ATUALIZADO
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📊 ===== SSE RECEBIDO =====');
        console.log('Progress:', data.progress);
        console.log('Items:', data.itemsCollected, '/', data.totalItems);
        console.log('Marketplace:', data.currentMarketplace);
        console.log('Last Products:', data.lastProducts?.length || 0);
        console.log('Live Products:', data.liveProducts?.length || 0);  // 🔥 ADICIONADO
        console.log('Status:', data.status);
        console.log('==========================');

        setScrapingStatus({
          isRunning: data.status === 'running',
          progress: data.progress || 0,
          currentMarketplace: data.currentMarketplace 
            ? normalizeMarketplace(data.currentMarketplace)
            : null,
          itemsCollected: data.itemsCollected || 0,
          totalItems: data.totalItems || 0,
          lastProducts: data.lastProducts || [],
          liveProducts: data.liveProducts || []  // 🔥 ADICIONADO
        });

        if (data.status === 'completed') {
          console.log('🎉 SCRAPING COMPLETADO!');
          
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
        console.error('❌ ERRO AO PROCESSAR SSE:', error, event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ ERRO SSE CONNECTION:', error);
      console.error('ReadyState:', eventSource.readyState);
      
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('⚠️ SSE fechou, usando apenas polling...');
        disconnectSSE();
      }
    };

    eventSourceRef.current = eventSource;
  };

  // ═══════════════════════════════════════════════════════════
  // BACKUP POLLING (roda em paralelo ao SSE)
  // ═══════════════════════════════════════════════════════════
  const backupPollingRef = useRef<NodeJS.Timeout | null>(null);

  const startBackupPolling = () => {
    if (backupPollingRef.current) {
      clearInterval(backupPollingRef.current);
    }

    console.log('🔄 Iniciando polling de backup (1s)...');

    backupPollingRef.current = setInterval(async () => {
      try {
        const url = `${API_BASE_URL}/api/scraping/status`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.success && json.data) {
          const data = json.data;
          
          console.log('📡 BACKUP POLLING:', {
            progress: data.progress,
            items: data.itemsCollected,
            status: data.status
          });

          // 4️⃣ BACKUP POLLING ATUALIZADO
          setScrapingStatus({
            isRunning: data.status === 'running',
            progress: data.progress || 0,
            currentMarketplace: data.currentMarketplace 
              ? normalizeMarketplace(data.currentMarketplace)
              : null,
            itemsCollected: data.itemsCollected || 0,
            totalItems: data.totalItems || 0,
            lastProducts: data.lastProducts || [],
            liveProducts: data.liveProducts || []  // 🔥 ADICIONADO
          });

          if (data.status === 'completed') {
            stopBackupPolling();
            disconnectSSE();
            
            toast({
              title: "✅ Automação concluída!",
              description: `${formatNumber(data.itemsCollected)} novos produtos foram adicionados.`,
              className: "bg-green-600 text-white border-none shadow-lg",
            });

            setTimeout(() => {
              refreshProducts();
              setTimeout(() => {
                setScrapingStatus(getInitialScrapingStatus());
              }, 3000);
            }, 1000);
          }
        }
      } catch (error) {
        console.error('❌ Erro backup polling:', error);
      }
    }, 1000); // ✅ Polling agressivo de 1 segundo
  };

  const stopBackupPolling = () => {
    if (backupPollingRef.current) {
      clearInterval(backupPollingRef.current);
      backupPollingRef.current = null;
      console.log('⏹️ Backup polling parado');
    }
  };

  // ═══════════════════════════════════════════════════════════
  // FALLBACK POLLING (caso SSE falhe)
  // ═══════════════════════════════════════════════════════════
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startFallbackPolling = (sessionId: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log('🔄 Iniciando fallback polling...');

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const url = `${API_BASE_URL}/api/scraping/status`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.success && json.data) {
          const data = json.data;
          
          console.log('📡 POLLING:', {
            progress: data.progress,
            items: data.itemsCollected,
            status: data.status
          });

          // 5️⃣ FALLBACK POLLING ATUALIZADO
          setScrapingStatus({
            isRunning: data.status === 'running',
            progress: data.progress || 0,
            currentMarketplace: data.currentMarketplace 
              ? normalizeMarketplace(data.currentMarketplace)
              : null,
            itemsCollected: data.itemsCollected || 0,
            totalItems: data.totalItems || 0,
            lastProducts: data.lastProducts || [],
            liveProducts: data.liveProducts || []  // 🔥 ADICIONADO
          });

          if (data.status === 'completed') {
            stopFallbackPolling();
            
            toast({
              title: "✅ Automação concluída!",
              description: `${formatNumber(data.itemsCollected)} novos produtos foram adicionados.`,
              className: "bg-green-600 text-white border-none shadow-lg",
            });

            setTimeout(() => {
              refreshProducts();
              setTimeout(() => {
                setScrapingStatus(getInitialScrapingStatus());
              }, 3000);
            }, 1000);
          }
        }
      } catch (error) {
        console.error('❌ Erro polling:', error);
      }
    }, 2000);
  };

  const stopFallbackPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('⏹️ Polling parado');
    }
  };

  const disconnectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      console.log('⏹️ SSE desconectado');
    }
    stopFallbackPolling();
    stopBackupPolling();
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

    // 6️⃣ ESTADO INICIAL OTIMISTA ATUALIZADO
    setScrapingStatus({
      isRunning: true,
      progress: 0,
      currentMarketplace: enabledMarketplaces[0] || null,
      itemsCollected: 0,
      totalItems,
      lastProducts: [],
      liveProducts: []  // 🔥 ADICIONADO
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
      console.log('📦 Payload:', payload);
      
      const res = await scrapingService.start(payload);

      console.log('📥 Resposta do backend:', res);

      if (res.success && res.data?.sessionId) {
        sessionIdRef.current = res.data.sessionId;
        console.log('✅ Session ID recebida:', res.data.sessionId);
        console.log('🔌 Tentando conectar SSE...');
        connectSSE(res.data.sessionId);
        return res.data.total || 0;
      } else {
        console.warn('⚠️ Sem sessionId, usando fallback polling');
        startFallbackPolling('latest');
        return res.data?.total || 0;
      }
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