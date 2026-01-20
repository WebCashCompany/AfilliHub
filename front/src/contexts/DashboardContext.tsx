// src/contexts/DashboardContext.tsx - VERSÃO CONECTADA AO BACKEND

/**
 * ═══════════════════════════════════════════════════════════
 * DASHBOARD CONTEXT - INTEGRADO COM BACKEND
 * ═══════════════════════════════════════════════════════════
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  
  // Scraping - CONECTADO AO BACKEND
  runScraping: (config: ScrapingConfig) => Promise<number>;
  scrapingStatus: ScrapingStatus;
}

export interface ScrapingConfig {
  marketplaces: {
    mercadolivre: { enabled: boolean; quantity: number };
    amazon: { enabled: boolean; quantity: number };
    magalu: { enabled: boolean; quantity: number };
    shopee: { enabled: boolean; quantity: number };
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

  useEffect(() => {
    // Initialize data - AQUI PODE CARREGAR DO BACKEND
    const initialProducts = generateProducts(500);
    setProducts(initialProducts);
    setDailyMetrics(generateDailyMetrics(30));
    setCategoryMetrics(generateCategoryMetrics(initialProducts));
    setMarketplaceMetrics(generateMarketplaceMetrics(initialProducts));
    setIsLoading(false);
  }, []);

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

  // ═══════════════════════════════════════════════════════════
  // ✅ SCRAPING CONECTADO AO BACKEND
  // ═══════════════════════════════════════════════════════════

  const runScraping = async (config: ScrapingConfig): Promise<number> => {
    const enabledMarketplaces = (Object.entries(config.marketplaces) as [Marketplace, { enabled: boolean; quantity: number }][])
      .filter(([_, cfg]) => cfg.enabled);
    
    const totalItems = enabledMarketplaces.reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);
    
    setScrapingStatus({
      isRunning: true,
      progress: 0,
      currentMarketplace: enabledMarketplaces[0]?.[0] || null,
      itemsCollected: 0,
      totalItems
    });

    try {
      // ✅ CHAMAR O BACKEND
      const payload: ScrapingRequestPayload = {
        marketplaces: config.marketplaces,
        minDiscount: config.minDiscount,
        maxPrice: config.maxPrice,
        filters: config.filters,
      };

      const response = await scrapingService.start(payload);

      if (response.success && response.data) {
        const collected = response.data.total;

        // Simula progresso visual enquanto o backend processa
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          if (progress <= 90) {
            setScrapingStatus(prev => ({ ...prev, progress }));
          }
        }, 300);

        // Aguarda um pouco para dar tempo do backend processar
        await new Promise(resolve => setTimeout(resolve, 3000));

        clearInterval(interval);

        // Finaliza
        setScrapingStatus({
          isRunning: false,
          progress: 100,
          currentMarketplace: null,
          itemsCollected: collected,
          totalItems: collected,
        });

        // ✅ ATUALIZAR PRODUTOS NO FRONTEND (OPCIONAL)
        // Você pode buscar os produtos novamente do backend
        // await fetchProducts();

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

      setScrapingStatus({
        isRunning: false,
        progress: 0,
        currentMarketplace: null,
        itemsCollected: 0,
        totalItems: 0,
      });

      return 0;
    }
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