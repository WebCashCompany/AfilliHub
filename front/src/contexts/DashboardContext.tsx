// src/contexts/DashboardContext.tsx - COM SSE E HISTÓRICO REAL - VERSÃO CORRIGIDA  
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
import { useToast } from '@/hooks/useToast';
import { ENV } from '@/config/environment';

const API_BASE_URL = ENV.API_BASE_URL;

const DEFAULT_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

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
    mercadolivre?: { enabled: boolean; quantity: number; searchTerm?: string; categoria?: string; categoryKey?: string; minDiscount?: number; maxPrice?: number; };
    amazon?:       { enabled: boolean; quantity: number; searchTerm?: string; categoria?: string; categoryKey?: string; minDiscount?: number; maxPrice?: number; };
    magalu?:       { enabled: boolean; quantity: number; searchTerm?: string; categoria?: string; categoryKey?: string; minDiscount?: number; maxPrice?: number; };
    shopee?:       { enabled: boolean; quantity: number; searchTerm?: string; categoria?: string; categoryKey?: string; minDiscount?: number; maxPrice?: number; };
    [key: string]: any;
  };
  minDiscount: number;
  maxPrice: number;
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
  liveProducts?: Array<{
    name: string;
    image: string;
    price: number;
    oldPrice: number;
    discount: number;
    status: 'processing' | 'saved' | 'error';
  }>;
  recentHistory?: Array<{
    id: string;
    marketplace: Marketplace;
    itemsCollected: number;
    completedAt: Date;
    duration: number;
  }>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

function getInitialScrapingStatus(): ScrapingStatus {
  const savedHistory = localStorage.getItem('scraping_history');
  let recentHistory = [];
  
  if (savedHistory) {
    try {
      const parsed = JSON.parse(savedHistory);
      recentHistory = parsed.map((item: any) => ({
        ...item,
        completedAt: new Date(item.completedAt)
      }));
    } catch (e) {
      console.error('Erro ao carregar histórico:', e);
    }
  }

  return {
    isRunning: false,
    progress: 0,
    currentMarketplace: null,
    itemsCollected: 0,
    totalItems: 0,
    lastProducts: [],
    liveProducts: [],
    recentHistory: recentHistory
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
  const eventSourceRef = useRef<any>(null);
  const sessionIdRef = useRef<string | null>(null);
  const scrapingStartTimeRef = useRef<number | null>(null);
  const isCompletedRef = useRef(false);

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

  const saveToHistory = (data: any) => {
    const duration = scrapingStartTimeRef.current 
      ? Math.floor((Date.now() - scrapingStartTimeRef.current) / 1000)
      : data.duration || 0;

    const completedSession = {
      id: sessionIdRef.current || Date.now().toString(),
      marketplace: data.currentMarketplace 
        ? normalizeMarketplace(data.currentMarketplace)
        : 'mercadolivre',
      itemsCollected: data.itemsCollected || 0,
      completedAt: new Date(),
      duration: duration
    };

    const currentHistory = scrapingStatus.recentHistory || [];
    const newHistory = [completedSession, ...currentHistory].slice(0, 10);
    localStorage.setItem('scraping_history', JSON.stringify(newHistory));
    return newHistory;
  };

  const refreshProducts = async () => {
    setIsLoading(true);
    const url = `${API_BASE_URL}/api/products`;

    try {
      const res = await fetch(url, {
        headers: DEFAULT_HEADERS,
      });

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

    const checkInitialStatus = async () => {
      try {
        const response = await scrapingService.getStatus();
        if (response.success && response.data) {
          const backendStatus = response.data as any;
          if (backendStatus.status === 'running' && backendStatus.sessionId) {
            console.log('🔄 Scraping ativo detectado, conectando SSE...');
            sessionIdRef.current = backendStatus.sessionId;
            scrapingStartTimeRef.current = Date.now();
            isCompletedRef.current = false;
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

  const checkIfCompleted = (data: any): boolean => {
    const statusCompleted = data.status === 'completed';
    const progressCompleted = data.progress >= 100;
    const itemsCompleted = data.totalItems > 0 && data.itemsCollected >= data.totalItems;
    return statusCompleted || progressCompleted || itemsCompleted;
  };

  const handleCompletion = (data: any) => {
    if (isCompletedRef.current) {
      console.log('⏭️ Completion já processado, ignorando...');
      return;
    }

    console.log('🎉 SCRAPING COMPLETADO!');
    isCompletedRef.current = true;

    const newHistory = saveToHistory(data);

    toast({
      title: "✅ Automação concluída!",
      description: `${formatNumber(data.itemsCollected)} novos produtos foram adicionados.`,
      className: "bg-green-600 text-white border-none shadow-lg",
    });

    setTimeout(() => {
      disconnectSSE();
      refreshProducts();

      setTimeout(() => {
        setScrapingStatus({
          ...getInitialScrapingStatus(),
          recentHistory: newHistory
        });
        scrapingStartTimeRef.current = null;
        sessionIdRef.current = null;
        isCompletedRef.current = false;
      }, 2000);
    }, 1000);
  };

  // ─────────────────────────────────────────────────────────
  // SSE via fetch — suporta headers customizados (ngrok)
  // ─────────────────────────────────────────────────────────
  const connectSSE = (sessionId: string) => {
    disconnectSSE();
    isCompletedRef.current = false;

    const sseUrl = `${API_BASE_URL}/api/scraping/progress/${sessionId}`;
    console.log('🔌 CONECTANDO SSE:', sseUrl);

    const controller = new AbortController();
    eventSourceRef.current = { close: () => controller.abort() };

    (async () => {
      try {
        const response = await fetch(sseUrl, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
            'Accept': 'text/event-stream',
          },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          console.error('❌ SSE falhou, usando fallback polling...');
          startFallbackPolling(sessionId);
          return;
        }

        console.log('✅ SSE CONECTADO COM SUCESSO!');
        startBackupPolling();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;

            try {
              const data = JSON.parse(raw);
              console.log('📊 SSE:', {
                progress: data.progress,
                items: `${data.itemsCollected}/${data.totalItems}`,
                status: data.status,
                marketplace: data.currentMarketplace
              });

              setScrapingStatus(prev => ({
                ...prev,
                isRunning: !checkIfCompleted(data),
                progress: Math.min(data.progress || 0, 100),
                currentMarketplace: data.currentMarketplace
                  ? normalizeMarketplace(data.currentMarketplace)
                  : prev.currentMarketplace,
                itemsCollected: data.itemsCollected || 0,
                totalItems: data.totalItems || prev.totalItems,
                lastProducts: data.lastProducts || prev.lastProducts,
                liveProducts: data.liveProducts || prev.liveProducts
              }));

              if (checkIfCompleted(data)) handleCompletion(data);
            } catch (e) {
              console.error('❌ ERRO AO PROCESSAR SSE:', e);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('⏹️ SSE abortado');
        } else {
          console.error('❌ ERRO SSE:', err);
          startFallbackPolling(sessionId);
        }
      }
    })();
  };

  // ─────────────────────────────────────────────────────────
  // BACKUP POLLING
  // ─────────────────────────────────────────────────────────
  const backupPollingRef = useRef<NodeJS.Timeout | null>(null);

  const startBackupPolling = () => {
    if (backupPollingRef.current) clearInterval(backupPollingRef.current);
    console.log('🔄 Iniciando polling de backup (2s)...');

    backupPollingRef.current = setInterval(async () => {
      if (isCompletedRef.current) { stopBackupPolling(); return; }

      try {
        const url = `${API_BASE_URL}/api/scraping/status`;
        const response = await fetch(url, { headers: DEFAULT_HEADERS });
        const json = await response.json();

        if (json.success && json.data) {
          const data = json.data;
          console.log('📡 BACKUP:', { progress: data.progress, items: `${data.itemsCollected}/${data.totalItems}`, status: data.status });

          setScrapingStatus(prev => ({
            ...prev,
            isRunning: !checkIfCompleted(data),
            progress: Math.min(data.progress || 0, 100),
            currentMarketplace: data.currentMarketplace
              ? normalizeMarketplace(data.currentMarketplace)
              : prev.currentMarketplace,
            itemsCollected: data.itemsCollected || 0,
            totalItems: data.totalItems || prev.totalItems,
            lastProducts: data.lastProducts || prev.lastProducts,
            liveProducts: data.liveProducts || prev.liveProducts
          }));

          if (checkIfCompleted(data)) handleCompletion(data);
        }
      } catch (error) {
        console.error('❌ Erro backup polling:', error);
      }
    }, 2000);
  };

  const stopBackupPolling = () => {
    if (backupPollingRef.current) {
      clearInterval(backupPollingRef.current);
      backupPollingRef.current = null;
      console.log('⏹️ Backup polling parado');
    }
  };

  // ─────────────────────────────────────────────────────────
  // FALLBACK POLLING
  // ─────────────────────────────────────────────────────────
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startFallbackPolling = (sessionId: string) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    console.log('🔄 Iniciando fallback polling...');
    isCompletedRef.current = false;

    pollingIntervalRef.current = setInterval(async () => {
      if (isCompletedRef.current) { stopFallbackPolling(); return; }

      try {
        const url = `${API_BASE_URL}/api/scraping/status`;
        const response = await fetch(url, { headers: DEFAULT_HEADERS });
        const json = await response.json();

        if (json.success && json.data) {
          const data = json.data;
          console.log('📡 POLLING:', { progress: data.progress, items: `${data.itemsCollected}/${data.totalItems}`, status: data.status });

          setScrapingStatus(prev => ({
            ...prev,
            isRunning: !checkIfCompleted(data),
            progress: Math.min(data.progress || 0, 100),
            currentMarketplace: data.currentMarketplace
              ? normalizeMarketplace(data.currentMarketplace)
              : prev.currentMarketplace,
            itemsCollected: data.itemsCollected || 0,
            totalItems: data.totalItems || prev.totalItems,
            lastProducts: data.lastProducts || prev.lastProducts,
            liveProducts: data.liveProducts || prev.liveProducts
          }));

          if (checkIfCompleted(data)) handleCompletion(data);
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
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ ids })
    });
    await refreshProducts();
  };

  const runCleanup = async (): Promise<number> => {
    await fetch(`${API_BASE_URL}/api/products/cleanup/all`, {
      method: 'DELETE',
      headers: DEFAULT_HEADERS,
    });
    await refreshProducts();
    return 0;
  };

  const resetScrapingStatus = () => {
    console.log('🔄 Reset manual do status');
    disconnectSSE();
    scrapingStartTimeRef.current = null;
    sessionIdRef.current = null;
    isCompletedRef.current = false;
    setScrapingStatus(getInitialScrapingStatus());

    toast({
      title: "Status resetado",
      description: "O status de scraping foi reinicializado.",
    });
  };

  const runScraping = async (config: ScrapingConfig): Promise<number> => {
    const totalItems = Object.values(config.marketplaces)
      .filter((mp: any) => mp?.enabled)
      .reduce((sum: number, mp: any) => sum + (mp.quantity || 0), 0);

    const enabledMarketplaces = Object.entries(config.marketplaces)
      .filter(([_, mp]: any) => mp?.enabled)
      .map(([key]) => key as Marketplace);

    isCompletedRef.current = false;
    scrapingStartTimeRef.current = Date.now();

    setScrapingStatus(prev => ({
      ...prev,
      isRunning: true,
      progress: 0,
      currentMarketplace: enabledMarketplaces[0] || null,
      itemsCollected: 0,
      totalItems,
      lastProducts: [],
      liveProducts: []
    }));

    try {
      const payload: ScrapingRequestPayload = {
        marketplaces: Object.fromEntries(
          Object.entries(config.marketplaces).map(([key, mp]: [string, any]) => {
            if (!mp) return [key, { enabled: false, quantity: 0 }];
            return [
              key,
              {
                enabled: mp.enabled ?? false,
                quantity: mp.quantity ?? 0,
                ...(mp.searchTerm  ? { searchTerm:  mp.searchTerm  } : {}),
                ...(mp.categoria   ? { categoria:   mp.categoria   } : {}),
                ...(mp.categoryKey ? { categoryKey: mp.categoryKey } : {}),
                minDiscount: mp.minDiscount ?? config.minDiscount ?? 20,
                maxPrice:    mp.maxPrice    ?? config.maxPrice    ?? 20000,
              }
            ];
          })
        ),
        minDiscount: config.minDiscount,
        maxPrice: config.maxPrice,
      } as any;

      console.log('🚀 Iniciando scraping...');
      console.log('📦 Payload enviado ao backend:', JSON.stringify(payload, null, 2));

      const res = await scrapingService.start(payload);

      console.log('📥 Resposta do backend:', res);

      if (res.success && res.data?.sessionId) {
        sessionIdRef.current = res.data.sessionId;
        console.log('✅ Session ID recebida:', res.data.sessionId);
        connectSSE(res.data.sessionId);
        return res.data.total || 0;
      } else {
        console.warn('⚠️ Sem sessionId, usando fallback polling');
        startFallbackPolling('latest');
        return res.data?.total || 0;
      }
    } catch (error) {
      console.error('❌ Erro ao iniciar scraping:', error);
      scrapingStartTimeRef.current = null;
      isCompletedRef.current = false;
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
        resetScrapingStatus,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('useDashboard must be used within DashboardProvider');
  return context;
}