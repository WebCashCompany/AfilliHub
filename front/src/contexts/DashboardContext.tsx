// src/contexts/DashboardContext.tsx - VERSÃO COM SSE (Server-Sent Events)

/**
 * ═══════════════════════════════════════════════════════════
 * DASHBOARD CONTEXT - COM PROGRESSO EM TEMPO REAL
 * ═══════════════════════════════════════════════════════════
 * 
 * ✅ SSE para updates em tempo real
 * ✅ Sincronização suave do progresso
 * ✅ Fallback para polling se SSE falhar
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import {
  Product,
  DailyMetrics,
  CategoryMetrics,
  MarketplaceMetrics,
  generateProducts,
  generateDailyMetrics,
  generateCategoryMetrics,
  generateMarketplaceMetrics,
  Marketplace
} from '@/lib/mockData';
import { scrapingService } from '@/api/services/scraping.service';
import { productsService } from '@/api/services/products.service';
import type { ScrapingRequestPayload } from '@/types/api.types';
import { useToast } from '@/hooks/use-toast';

interface DashboardContextType {
  products: Product[];
  dailyMetrics: DailyMetrics[];
  categoryMetrics: CategoryMetrics[];
  marketplaceMetrics: MarketplaceMetrics[];
  trashedProducts: Product[];
  isLoading: boolean;
  
  // Actions
  addProduct: (product: Omit<Product, 'id'>) => void;
  deleteProducts: (ids: string[]) => void;
  protectProducts: (ids: string[]) => void;
  unprotectProducts: (ids: string[]) => void;
  restoreProducts: (ids: string[]) => void;
  permanentlyDeleteProducts: (ids: string[]) => void;
  runCleanup: (daysWithoutClicks: number, removeOutOfStock: boolean) => number;
  
  // Scraping - COM PROGRESSO EM TEMPO REAL
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
  filters?: {
    categoria?: string;
    palavraChave?: string;
    frete_gratis?: boolean;
  };
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
  const [trashedProducts, setTrashedProducts] = useState<Product[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [categoryMetrics, setCategoryMetrics] = useState<CategoryMetrics[]>([]);
  const [marketplaceMetrics, setMarketplaceMetrics] = useState<MarketplaceMetrics[]>([]);
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
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize data
    const initialProducts = generateProducts(500);
    setProducts(initialProducts);
    setDailyMetrics(generateDailyMetrics(30));
    setCategoryMetrics(generateCategoryMetrics(initialProducts));
    setMarketplaceMetrics(generateMarketplaceMetrics(initialProducts));
    setIsLoading(false);

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // ✅ ESCUTAR PROGRESSO EM TEMPO REAL VIA SSE
  // ═══════════════════════════════════════════════════════════
  
  const startProgressListener = (sessionId: string) => {
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
    const eventSource = new EventSource(`${apiUrl}/api/scraping/progress/${sessionId}`);
    
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Atualiza status com animação suave
        setScrapingStatus(prev => ({
          ...prev,
          progress: data.progress || prev.progress,
          currentMarketplace: data.currentMarketplace || prev.currentMarketplace,
          itemsCollected: data.itemsCollected || prev.itemsCollected,
          totalItems: data.totalItems || prev.totalItems,
        }));

        // Se completou, fecha conexão
        if (data.progress >= 100 || data.status === 'completed') {
          eventSource.close();
          eventSourceRef.current = null;
        }
      } catch (error) {
        console.error('❌ Erro ao parsear evento SSE:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.warn('⚠️ SSE error, iniciando fallback polling...', error);
      eventSource.close();
      eventSourceRef.current = null;
      
      // Fallback: polling a cada 1 segundo
      startPollingFallback(sessionId);
    };
  };

  // ═══════════════════════════════════════════════════════════
  // 📡 FALLBACK: POLLING CASO SSE FALHE
  // ═══════════════════════════════════════════════════════════
  
  const startPollingFallback = (sessionId: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await scrapingService.getStatus();
        
        if (response.success && response.data) {
          setScrapingStatus(prev => ({
            ...prev,
            progress: response.data.progress || prev.progress,
            currentMarketplace: response.data.currentMarketplace || prev.currentMarketplace,
            itemsCollected: response.data.itemsCollected || prev.itemsCollected,
            totalItems: response.data.totalItems || prev.totalItems,
          }));

          // Para polling quando completo
          if (response.data.progress >= 100 || response.data.status === 'completed') {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error('❌ Erro no polling:', error);
      }
    }, 1000); // Poll a cada 1 segundo
  };

  // ═══════════════════════════════════════════════════════════
  // 🚀 INICIAR SCRAPING
  // ═══════════════════════════════════════════════════════════

  const runScraping = async (config: ScrapingConfig): Promise<number> => {
    const enabledMarketplaces = (Object.entries(config.marketplaces) as [Marketplace, { enabled: boolean; quantity: number }][])
      .filter(([_, cfg]) => cfg.enabled);
    
    const totalItems = enabledMarketplaces.reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);
    
    // Inicia com 0% imediatamente
    setScrapingStatus({
      isRunning: true,
      progress: 0,
      currentMarketplace: enabledMarketplaces[0]?.[0] || null,
      itemsCollected: 0,
      totalItems
    });

    try {
      const payload: ScrapingRequestPayload = {
        marketplaces: config.marketplaces,
        minDiscount: config.minDiscount,
        maxPrice: config.maxPrice,
        filters: config.filters,
      };

      const response = await scrapingService.start(payload);

      if (response.success && response.data) {
        const sessionId = response.data.sessionId || 'default';

        // ✅ CONECTAR NO SSE PARA RECEBER UPDATES EM TEMPO REAL
        startProgressListener(sessionId);

        // Aguarda conclusão (o progresso será atualizado via SSE)
        const collected = response.data.total || 0;

        return collected;
      }

      throw new Error('Erro no scraping');

    } catch (error: any) {
      console.error('❌ Erro no scraping:', error);
      
      toast({
        title: "❌ Erro no scraping",
        description: error.message || 'Erro ao coletar produtos',
        variant: "destructive",
      });

      // Reset status
      setScrapingStatus({
        isRunning: false,
        progress: 0,
        currentMarketplace: null,
        itemsCollected: 0,
        totalItems: 0,
      });

      // Limpa listeners
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      return 0;
    }
  };

  // ═══════════════════════════════════════════════════════════
  // OUTRAS FUNÇÕES (sem alteração)
  // ═══════════════════════════════════════════════════════════

  const addProduct = (product: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      ...product,
      id: `prod_${Math.random().toString(36).substring(2, 11)}`
    };
    setProducts(prev => [newProduct, ...prev]);
  };

  const deleteProducts = (ids: string[]) => {
    const toDelete = products.filter(p => ids.includes(p.id) && p.status !== 'protected');
    setProducts(prev => prev.filter(p => !ids.includes(p.id) || p.status === 'protected'));
    setTrashedProducts(prev => [...toDelete.map(p => ({ ...p, status: 'inactive' as const })), ...prev]);
  };

  const protectProducts = (ids: string[]) => {
    setProducts(prev => prev.map(p => 
      ids.includes(p.id) ? { ...p, status: 'protected' as const } : p
    ));
  };

  const unprotectProducts = (ids: string[]) => {
    setProducts(prev => prev.map(p => 
      ids.includes(p.id) && p.status === 'protected' ? { ...p, status: 'active' as const } : p
    ));
  };

  const restoreProducts = (ids: string[]) => {
    const toRestore = trashedProducts.filter(p => ids.includes(p.id));
    setTrashedProducts(prev => prev.filter(p => !ids.includes(p.id)));
    setProducts(prev => [...toRestore.map(p => ({ ...p, status: 'active' as const })), ...prev]);
  };

  const permanentlyDeleteProducts = (ids: string[]) => {
    setTrashedProducts(prev => prev.filter(p => !ids.includes(p.id)));
  };

  const runCleanup = (daysWithoutClicks: number, removeOutOfStock: boolean): number => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysWithoutClicks);
    
    let removedCount = 0;
    const toRemove: string[] = [];

    products.forEach(product => {
      if (product.status === 'protected') return;
      
      const shouldRemove = 
        (product.clicks === 0 && product.addedAt < cutoffDate) ||
        (removeOutOfStock && product.stock === 0);
      
      if (shouldRemove) {
        toRemove.push(product.id);
        removedCount++;
      }
    });

    if (toRemove.length > 0) {
      deleteProducts(toRemove);
    }

    return removedCount;
  };

  return (
    <DashboardContext.Provider value={{
      products,
      dailyMetrics,
      categoryMetrics,
      marketplaceMetrics,
      trashedProducts,
      isLoading,
      addProduct,
      deleteProducts,
      protectProducts,
      unprotectProducts,
      restoreProducts,
      permanentlyDeleteProducts,
      runCleanup,
      runScraping,
      scrapingStatus
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}