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

      // 🔍 DEBUG: Ver produto RAW do Magalu
      const magaluProduct = items.find((p: any) => p.marketplace === 'magalu' || p.marketplace === 'Magalu');
      if (magaluProduct) {
        console.log('🔍 PRODUTO RAW DO MAGALU:', magaluProduct);
        console.log('   📊 preco_de (RAW):', magaluProduct.preco_de, '| type:', typeof magaluProduct.preco_de);
        console.log('   📊 preco_para (RAW):', magaluProduct.preco_para, '| type:', typeof magaluProduct.preco_para);
        console.log('   📊 desconto:', magaluProduct.desconto);
      }

      const formatted: Product[] = items.map((p: any) => {
        // Função helper para converter preço → number
        const parsePrice = (priceValue: any): number => {
          // Se for Infinity, retorna 0
          if (priceValue === Infinity || priceValue === 'Infinity') {
            console.log('⚠️ Preço Infinity detectado, retornando 0');
            return 0;
          }
          
          if (!priceValue) return 0;
          
          // Converte para string para processar
          const valueStr = priceValue.toString().trim();
          
          // Se é só números (sem R$, sem vírgula, sem ponto) = Magalu em centavos
          if (/^\d+$/.test(valueStr)) {
            const numValue = parseInt(valueStr);
            // Se >= 100 e não é múltiplo de 100, divide (2999 → 29.99)
            if (numValue >= 100 && numValue % 100 !== 0) {
              const result = numValue / 100;
              console.log(`🔄 Magalu: ${numValue} → R$ ${result.toFixed(2)}`);
              return result;
            }
            return numValue;
          }
          
          // Se tem R$ ou vírgula = formato normal
          const cleaned = valueStr
            .replace('R$', '')
            .replace(/\s/g, '')
            .trim();
          
          // Se tem vírgula E ponto: R$ 1.234,56 → 1234.56
          if (cleaned.includes('.') && cleaned.includes(',')) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
          }
          
          // Se tem só vírgula: R$ 1234,56 → 1234.56
          if (cleaned.includes(',')) {
            return parseFloat(cleaned.replace(',', '.'));
          }
          
          // Se tem só ponto ou já está limpo
          return parseFloat(cleaned) || 0;
        };

        const result = {
          id: p._id || p.id,
          name: p.nome || p.title || 'Produto',
          image: p.imagem || p.thumbnail || '',
          category: p.categoria || 'Geral',
          marketplace: normalizeMarketplace(p.marketplace),
          price: parsePrice(p.preco_para || p.price),
          oldPrice: parsePrice(p.preco_de || p.oldPrice),
          discount: parseInt((p.desconto || '0').toString().replace('%', '').trim()) || 0,
          clicks: 0,
          conversions: 0,
          revenue: 0,
          stock: 100,
          status: 'active',
          addedAt: new Date(p.createdAt || Date.now())
        };

        // Log do primeiro produto Magalu após conversão
        if (p.marketplace === 'magalu' && !window.__magaluLogged) {
          console.log('✅ PRODUTO MAGALU CONVERTIDO:', {
            nome: result.name,
            price: result.price,
            oldPrice: result.oldPrice,
            discount: result.discount
          });
          (window as any).__magaluLogged = true;
        }

        return result;
      });

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
    console.log('🚀 runScraping iniciado');
    
    // Calcula total esperado
    const totalItems = Object.values(config.marketplaces)
      .filter(mp => mp.enabled)
      .reduce((sum, mp) => sum + mp.quantity, 0);

    // Marketplaces habilitados
    const enabledMarketplaces = Object.entries(config.marketplaces)
      .filter(([_, mp]) => mp.enabled)
      .map(([key]) => key as Marketplace);

    // ✅ PASSO 1: Define isRunning como TRUE IMEDIATAMENTE
    console.log('📊 Setando isRunning = true');
    setScrapingStatus({
      isRunning: true,
      progress: 5,
      currentMarketplace: enabledMarketplaces[0] || null,
      itemsCollected: 0,
      totalItems
    });

    // ✅ PASSO 2: Aguarda React re-renderizar
    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      const payload: ScrapingRequestPayload = {
        marketplaces: config.marketplaces,
        minDiscount: config.minDiscount,
        maxPrice: config.maxPrice,
        filters: config.filters
      };

      // ✅ PASSO 3: Inicia simulação de progresso que dura ~40 segundos
      console.log('⏳ Iniciando simulação de progresso');
      let currentProgress = 5;
      let currentMpIndex = 0;
      
      // Progresso lento: 90% em 35 segundos = ~2.5% a cada segundo
      const progressInterval = setInterval(() => {
        setScrapingStatus(prev => {
          if (!prev.isRunning) {
            clearInterval(progressInterval);
            return prev;
          }

          // Avança 2-3% a cada 2 segundos (vai dar ~35-40s para chegar em 90%)
          const increment = Math.random() * 1 + 2; // Entre 2% e 3%
          currentProgress = Math.min(90, currentProgress + increment);

          // Simula mudança de marketplace
          const progressPerMarketplace = 90 / enabledMarketplaces.length;
          const expectedMpIndex = Math.floor(currentProgress / progressPerMarketplace);
          
          if (expectedMpIndex !== currentMpIndex && expectedMpIndex < enabledMarketplaces.length) {
            currentMpIndex = expectedMpIndex;
          }

          return {
            ...prev,
            progress: currentProgress,
            currentMarketplace: enabledMarketplaces[currentMpIndex] || prev.currentMarketplace,
            itemsCollected: Math.floor((currentProgress / 100) * prev.totalItems)
          };
        });
      }, 2000); // A cada 2 segundos

      // ✅ PASSO 4: Executa scraping real
      console.log('🔄 Chamando API de scraping...');
      const res = await scrapingService.start(payload);
      console.log('✅ Scraping concluído:', res);

      // Para a simulação
      clearInterval(progressInterval);

      if (res.success) {
        // Finaliza com 100% mas MANTÉM a tela
        setScrapingStatus({
          isRunning: true, // MANTÉM TRUE
          progress: 100,
          currentMarketplace: null,
          itemsCollected: res.data?.total || 0,
          totalItems
        });

        // Aguarda 2s mostrando 100%
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Atualiza produtos (ignora erro se backend cair)
        try {
          await refreshProducts();
        } catch (refreshError) {
          console.warn('⚠️ Falha ao atualizar produtos, mas scraping foi concluído');
        }

        // Agora sim fecha a tela
        setScrapingStatus({
          isRunning: false,
          progress: 100,
          currentMarketplace: null,
          itemsCollected: res.data?.total || 0,
          totalItems
        });

        // Reset após 3s
        setTimeout(() => {
          setScrapingStatus({
            isRunning: false,
            progress: 0,
            currentMarketplace: null,
            itemsCollected: 0,
            totalItems: 0
          });
        }, 3000);

        return res.data?.total || 0;
      }

      throw new Error('Scraping falhou');
    } catch (error) {
      console.error('❌ Erro no scraping:', error);
      
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