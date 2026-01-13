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
  
  // Scraping simulation
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

  useEffect(() => {
    // Initialize data
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

  const runScraping = async (config: ScrapingConfig): Promise<number> => {
    const enabledMarketplaces = (Object.entries(config.marketplaces) as [Marketplace, { enabled: boolean; quantity: number }][])
      .filter(([_, cfg]) => cfg.enabled);
    
    const totalItems = enabledMarketplaces.reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);
    
    setScrapingStatus({
      isRunning: true,
      progress: 0,
      currentMarketplace: null,
      itemsCollected: 0,
      totalItems
    });

    let collected = 0;

    for (const [marketplace, mpConfig] of enabledMarketplaces) {
      setScrapingStatus(prev => ({ ...prev, currentMarketplace: marketplace }));
      
      // Simulate scraping delay
      for (let i = 0; i < mpConfig.quantity; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        collected++;
        setScrapingStatus(prev => ({
          ...prev,
          itemsCollected: collected,
          progress: (collected / totalItems) * 100
        }));
      }
    }

    // Add new products
    const newProducts = generateProducts(totalItems).map(p => ({
      ...p,
      addedAt: new Date(),
      clicks: 0,
      conversions: 0,
      revenue: 0,
      ctr: 0
    }));

    setProducts(prev => [...newProducts, ...prev]);

    setScrapingStatus({
      isRunning: false,
      progress: 100,
      currentMarketplace: null,
      itemsCollected: totalItems,
      totalItems
    });

    return totalItems;
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
