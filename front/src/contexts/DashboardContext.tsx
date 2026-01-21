// src/contexts/DashboardContext.tsx - ATUALIZADO

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

import { scrapingService } from '@/api/services/scraping.service';
import type { ScrapingRequestPayload } from '@/types/api.types';
import { useToast } from '@/hooks/use-toast';

/* ===============================
   CONFIG
================================ */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/* ===============================
   TYPES
================================ */

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

/* ===============================
   CONTEXT
================================ */

const DashboardContext = createContext<DashboardContextType | undefined>(
  undefined
);

/* ===============================
   PROVIDER
================================ */

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [trashedProducts] = useState<Product[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [categoryMetrics, setCategoryMetrics] = useState<CategoryMetrics[]>([]);
  const [marketplaceMetrics, setMarketplaceMetrics] =
    useState<MarketplaceMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [scrapingStatus, setScrapingStatus] = useState<ScrapingStatus>({
    isRunning: false,
    progress: 0,
    currentMarketplace: null,
    itemsCollected: 0,
    totalItems: 0
  });

  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);

  /* ===============================
     HELPERS
  ================================ */

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

  /* ===============================
     LOAD PRODUCTS
  ================================ */

  const refreshProducts = async () => {
    setIsLoading(true);

    const url = `${API_BASE_URL}/api/products`;
    console.log('📡 Buscando produtos em:', url);

    try {
      const res = await fetch(url);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      console.log('📦 Resposta API:', json);

      const items = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data?.items)
        ? json.data.items
        : [];

      const formatted: Product[] = items.map((p: any) => ({
        id: p._id || p.id,
        name: p.nome || p.title || 'Produto',
        image: p.imagem || p.thumbnail || '',
        category: p.categoria || 'Geral',
        marketplace: normalizeMarketplace(p.marketplace),
        price: Number(p.preco_para || p.price) || 0,
        discount: Number(p.desconto || p.discount) || 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        stock: 100,
        status: 'active',
        addedAt: new Date(p.createdAt || Date.now())
      }));

      setProducts(formatted);
      setDailyMetrics(generateDailyMetrics(30));
      setCategoryMetrics(generateCategoryMetrics(formatted));
      setMarketplaceMetrics(generateMarketplaceMetrics(formatted));

      console.log(`✅ ${formatted.length} produtos carregados`);
    } catch (err) {
      console.error('❌ Erro ao carregar produtos:', err);
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
    return () => eventSourceRef.current?.close();
  }, []);

  /* ===============================
     DELETE
  ================================ */

  const deleteProducts = async (ids: string[]) => {
    await fetch(`${API_BASE_URL}/api/products/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });

    await refreshProducts();
  };

  /* ===============================
     CLEANUP
  ================================ */

  const runCleanup = async (): Promise<number> => {
    await fetch(`${API_BASE_URL}/api/products/cleanup/all`, {
      method: 'DELETE'
    });

    await refreshProducts();
    return 0;
  };

  /* ===============================
     SCRAPING COM STATUS
  ================================ */

  const runScraping = async (config: ScrapingConfig): Promise<number> => {
    // Calcula total esperado
    const totalItems = Object.values(config.marketplaces)
      .filter(mp => mp.enabled)
      .reduce((sum, mp) => sum + mp.quantity, 0);

    // Inicia status
    setScrapingStatus({
      isRunning: true,
      progress: 0,
      currentMarketplace: null,
      itemsCollected: 0,
      totalItems
    });

    try {
      const payload: ScrapingRequestPayload = {
        marketplaces: config.marketplaces,
        minDiscount: config.minDiscount,
        maxPrice: config.maxPrice,
        filters: config.filters
      };

      // Simula progresso (você pode integrar com SSE real se tiver)
      const progressInterval = setInterval(() => {
        setScrapingStatus(prev => {
          if (prev.progress >= 95) {
            clearInterval(progressInterval);
            return prev;
          }
          return {
            ...prev,
            progress: Math.min(95, prev.progress + Math.random() * 10)
          };
        });
      }, 1000);

      const res = await scrapingService.start(payload);

      clearInterval(progressInterval);

      if (res.success) {
        // Finaliza
        setScrapingStatus({
          isRunning: false,
          progress: 100,
          currentMarketplace: null,
          itemsCollected: res.data?.total || 0,
          totalItems
        });

        await refreshProducts();

        // Reset após 2s
        setTimeout(() => {
          setScrapingStatus({
            isRunning: false,
            progress: 0,
            currentMarketplace: null,
            itemsCollected: 0,
            totalItems: 0
          });
        }, 2000);

        return res.data?.total || 0;
      }

      throw new Error('Scraping falhou');
    } catch (error) {
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

/* ===============================
   HOOK
================================ */

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard fora do Provider');
  return ctx;
}