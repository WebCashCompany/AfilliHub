import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDashboard, ScrapingConfig } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { ScrapingLiveProducts } from '@/components/dashboard/ScrapingLiveProducts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Zap, Play, Settings2, Loader2, CheckCircle, Package, Filter,
  Search, X, RotateCcw, ArrowRight, Clock, Tag, AlertCircle, StopCircle
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { formatNumber, getMarketplaceName, Marketplace } from '@/lib/mockData';
import { useMarketplaceConnections } from '@/hooks/useMarketplaceConnections.ts';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface MarketplaceFilters {
  categoria?: string;
  categoryKey?: string;
  searchTerm?: string;
  frete_gratis?: boolean;
  minDiscount?: number;
  maxPrice?: number;
}

interface MarketplaceConfig {
  enabled: boolean;
  quantity: number;
  filters?: MarketplaceFilters;
}

// ─────────────────────────────────────────────
// CATEGORIAS
// ─────────────────────────────────────────────

const MAGALU_CATEGORIES = [
  { value: '', label: 'Todas as categorias', key: '', icon: '📦' },
  { value: 'ofertas-do-dia', label: 'Ofertas do Dia', key: 'OFERTAS_DIA', icon: '🔥' },
  { value: 'internacional', label: 'Internacional', key: 'INTERNACIONAL', icon: '🌎' },
  { value: 'casa-utilidades', label: 'Casa - Utilidades', key: 'CASA_UTILIDADES', icon: '🏠' },
  { value: 'casa-construcao', label: 'Casa - Construção', key: 'CASA_CONSTRUCAO', icon: '🏗️' },
  { value: 'casa-moveis', label: 'Casa - Móveis', key: 'CASA_MOVEIS', icon: '🪑' },
  { value: 'ferramentas', label: 'Ferramentas', key: 'FERRAMENTAS', icon: '🔧' },
  { value: 'eletroportateis', label: 'Eletroportáteis', key: 'ELETROPORTATEIS', icon: '🔌' },
  { value: 'brinquedos', label: 'Brinquedos', key: 'BRINQUEDOS', icon: '🧸' },
  { value: 'automotivo', label: 'Automotivo', key: 'AUTOMOTIVO', icon: '🚗' },
  { value: 'domesticos', label: 'Domésticos', key: 'DOMESTICOS', icon: '🧹' },
];

const MERCADOLIVRE_CATEGORIES = [
  { value: 'todas', label: 'Todas as Ofertas', icon: '🎯' },
  { value: 'celulares', label: 'Celulares', icon: '📱' },
  { value: 'beleza', label: 'Beleza', icon: '💄' },
  { value: 'ofertas_relampago', label: 'Ofertas Relâmpago', icon: '⚡' },
  { value: 'ofertas_dia', label: 'Ofertas do Dia', icon: '🌟' },
  { value: 'informatica', label: 'Informática', icon: '💻' },
  { value: 'precos_imbativeis', label: 'Preços Imbatíveis', icon: '💥' },
  { value: 'eletrodomesticos', label: 'Eletrodomésticos', icon: '🏠' },
  { value: 'casa_decoracao', label: 'Casa e Decoração', icon: '🛋️' },
  { value: 'joias_relogios', label: 'Joias e Relógios', icon: '⌚' },
  { value: 'esportes', label: 'Esportes e Fitness', icon: '⚽' },
  { value: 'games', label: 'Games', icon: '🎮' },
  { value: 'ferramentas', label: 'Ferramentas', icon: '🔧' },
  { value: 'calcados_roupas', label: 'Calçados e Roupas', icon: '👟' },
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - new Date(date).getTime();
  const diffInMinutes = Math.floor(diffInMs / 60000);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) return 'Agora';
  if (diffInMinutes < 60) return `Há ${diffInMinutes} min`;
  if (diffInHours < 24) return `Há ${diffInHours}h`;
  if (diffInDays < 7) return `Há ${diffInDays}d`;
  return new Date(date).toLocaleDateString('pt-BR');
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}min ${secs}s`;
}

// ─────────────────────────────────────────────
// HOOK: SMOOTH PROGRESS
// ─────────────────────────────────────────────

function useSmoothProgress(targetProgress: number, isRunning: boolean) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const currentRef = useRef(0);
  const targetRef = useRef(0);

  useEffect(() => { targetRef.current = targetProgress; }, [targetProgress]);

  useEffect(() => {
    if (!isRunning) {
      if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
      currentRef.current = 0;
      setDisplayProgress(0);
    }
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const SPEED = 0.4;
    const MIN_CRAWL = 0.03;

    const animate = () => {
      const target = targetRef.current;
      const current = currentRef.current;
      const diff = target - current;
      let next: number;

      if (diff > 0.1) {
        const step = Math.max(diff * SPEED * 0.1, MIN_CRAWL);
        next = Math.min(current + step, target);
      } else if (diff < -0.1) {
        next = target;
      } else {
        next = target < 100
          ? Math.min(current + MIN_CRAWL * 0.5, target + 3)
          : Math.min(current + MIN_CRAWL, 100);
      }

      currentRef.current = next;
      setDisplayProgress(next);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; } };
  }, [isRunning]);

  return displayProgress;
}

// ─────────────────────────────────────────────
// BADGE: filtro ativo
// ─────────────────────────────────────────────

function ActiveFilterBadge({ filters }: { filters?: MarketplaceFilters }) {
  if (!filters) return null;
  const hasSearch = !!filters.searchTerm?.trim();
  const hasCategory = !!(filters.categoria && filters.categoria !== 'todas' && filters.categoria !== '');

  if (hasSearch) {
    return (
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-1 bg-blue-500/15 text-blue-600 border-0 max-w-[100px]">
        <Search className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="truncate">{filters.searchTerm}</span>
      </Badge>
    );
  }
  if (hasCategory) {
    return (
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-1 bg-primary/15 text-primary border-0 max-w-[100px]">
        <Tag className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="truncate">{filters.categoria}</span>
      </Badge>
    );
  }
  return null;
}

// ─────────────────────────────────────────────
// MOBILE: Marketplace Card
// ─────────────────────────────────────────────

function MobileMarketplaceCard({
  mp,
  mpConfig,
  onToggle,
  onQuantityChange,
  onOpenFilters,
  onOpenSearch,
}: {
  mp: Marketplace;
  mpConfig: MarketplaceConfig;
  onToggle: () => void;
  onQuantityChange: (v: number) => void;
  onOpenFilters: () => void;
  onOpenSearch: () => void;
}) {
  const hasActiveFilter = !!(
    mpConfig.filters?.searchTerm?.trim() ||
    (mpConfig.filters?.categoria && mpConfig.filters.categoria !== 'todas' && mpConfig.filters.categoria !== '')
  );
  const hasSearch = !!mpConfig.filters?.searchTerm?.trim();

  return (
    <div
      id={`marketplace-${mp}`}
      className={`relative rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
        mpConfig.enabled
          ? 'border-primary/60 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent shadow-sm shadow-primary/10'
          : 'border-border/60 bg-card'
      }`}
    >
      {/* Accent line top */}
      {mpConfig.enabled && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
      )}

      <div className="p-4">
        {/* Row 1: toggle + badge + settings */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Custom toggle */}
            <button
              onClick={onToggle}
              className={`relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0 ${
                mpConfig.enabled ? 'bg-primary shadow-inner shadow-primary/30' : 'bg-muted-foreground/20'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
                  mpConfig.enabled ? 'left-[calc(100%-21px)]' : 'left-0.5'
                }`}
              />
            </button>
            <MarketplaceBadge marketplace={mp} />
          </div>

          <div className="flex items-center gap-1.5">
            <ActiveFilterBadge filters={mpConfig.filters} />
            {/* Search shortcut button */}
            <button
              onClick={onOpenSearch}
              className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                hasSearch
                  ? 'bg-blue-500/15 text-blue-600'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              {hasSearch && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-background" />
              )}
            </button>
            {/* Filters button */}
            <button
              onClick={onOpenFilters}
              className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                hasActiveFilter && !hasSearch
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              {hasActiveFilter && !hasSearch && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border-2 border-background" />
              )}
            </button>
          </div>
        </div>

        {/* Row 2: quantity */}
        {mpConfig.enabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Quantidade</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onQuantityChange(Math.max(1, mpConfig.quantity - 10))}
                  className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted-foreground/20 active:scale-90 transition-all text-sm font-bold"
                >−</button>
                <span className="text-sm font-black w-10 text-center tabular-nums">{mpConfig.quantity}</span>
                <button
                  onClick={() => onQuantityChange(Math.min(300, mpConfig.quantity + 10))}
                  className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted-foreground/20 active:scale-90 transition-all text-sm font-bold"
                >+</button>
              </div>
            </div>
            <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(mpConfig.quantity / 300) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export function AutomationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { runScraping, scrapingStatus, products, resetScrapingStatus, finalizeScraping } = useDashboard();
  const { connections, loading: connectionsLoading } = useMarketplaceConnections();
  const { toast } = useToast();

  // Estado de controle do processo de finalização
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [config, setConfig] = useState<{
    marketplaces: Record<Marketplace, MarketplaceConfig>;
  }>(() => {
    const saved = localStorage.getItem('automation_config');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      marketplaces: {
        mercadolivre: { enabled: true, quantity: 50, filters: { minDiscount: 20, maxPrice: 20000 } },
        amazon:       { enabled: true, quantity: 50, filters: { minDiscount: 20, maxPrice: 20000 } },
        magalu:       { enabled: false, quantity: 30, filters: { minDiscount: 20, maxPrice: 20000 } },
        shopee:       { enabled: true, quantity: 40, filters: { minDiscount: 20, maxPrice: 20000 } },
      },
    };
  });

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [currentMarketplace, setCurrentMarketplace] = useState<Marketplace | null>(null);
  const [tempFilters, setTempFilters] = useState<MarketplaceFilters>({});
  const [focusSearchOnOpen, setFocusSearchOnOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const smoothProgress = useSmoothProgress(scrapingStatus.progress, scrapingStatus.isRunning);
  const isSearchActive = !!(tempFilters.searchTerm?.trim());

  const getCategoriesForMarketplace = (mp: Marketplace | null) => {
    if (mp === 'magalu') return MAGALU_CATEGORIES;
    if (mp === 'mercadolivre') return MERCADOLIVRE_CATEGORIES;
    return [];
  };

  const marketplaceHasAdvancedFilters = (mp: Marketplace | null) =>
    mp === 'mercadolivre' || mp === 'magalu';

  useEffect(() => {
    const state = location.state as { highlightMarketplace?: Marketplace } | null;
    if (state?.highlightMarketplace) {
      setTimeout(() => {
        const el = document.getElementById(`marketplace-${state.highlightMarketplace}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('animate-pulse-slow');
          setTimeout(() => el.classList.remove('animate-pulse-slow'), 3000);
        }
      }, 300);
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    localStorage.setItem('automation_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!scrapingStatus.isRunning && scrapingStatus.progress === 100 && scrapingStatus.itemsCollected > 0) {
      toast({
        title: "✅ Automação concluída!",
        description: `${formatNumber(scrapingStatus.itemsCollected)} novos produtos foram adicionados.`,
        className: "bg-green-600 text-white border-none shadow-lg",
      });
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Automação Concluída", { body: `${scrapingStatus.itemsCollected} produtos coletados.`, icon: "/favicon.ico" });
      }
    }
  }, [scrapingStatus.isRunning, scrapingStatus.progress, scrapingStatus.itemsCollected]);

  const handleMarketplaceToggle = (mp: Marketplace) =>
    setConfig(prev => ({
      ...prev,
      marketplaces: {
        ...prev.marketplaces,
        [mp]: { ...prev.marketplaces[mp], enabled: !prev.marketplaces[mp].enabled },
      },
    }));

  const handleQuantityChange = (mp: Marketplace, quantity: number) =>
    setConfig(prev => ({
      ...prev,
      marketplaces: {
        ...prev.marketplaces,
        [mp]: { ...prev.marketplaces[mp], quantity: isNaN(quantity) ? 0 : quantity },
      },
    }));

  const openFiltersModal = (mp: Marketplace, focusSearch = false) => {
    setCurrentMarketplace(mp);
    setTempFilters(config.marketplaces[mp].filters || {});
    setFocusSearchOnOpen(focusSearch);
    setConfigModalOpen(true);
    if (focusSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 150);
    }
  };

  const handleCategoryChange = (value: string) => {
    if (isSearchActive) return;
    if (currentMarketplace === 'magalu') {
      const cat = MAGALU_CATEGORIES.find(c => c.value === value);
      setTempFilters(prev => ({ ...prev, categoryKey: cat?.key || '', categoria: value }));
    } else {
      setTempFilters(prev => ({ ...prev, categoria: value }));
    }
  };

  const handleSearchTermChange = (value: string) => {
    setTempFilters(prev => ({
      ...prev,
      searchTerm: value,
      ...(value.trim() ? { categoria: '', categoryKey: '' } : {}),
    }));
  };

  const clearFilters = () => {
    setTempFilters({ minDiscount: 20, maxPrice: 20000, searchTerm: '', categoria: '', categoryKey: '' });
  };

  const saveFilters = () => {
    if (!currentMarketplace) return;
    const finalFilters: MarketplaceFilters = { ...tempFilters };
    if (finalFilters.searchTerm?.trim()) {
      finalFilters.categoria = undefined;
      finalFilters.categoryKey = undefined;
    } else {
      finalFilters.searchTerm = undefined;
    }
    setConfig(prev => ({
      ...prev,
      marketplaces: {
        ...prev.marketplaces,
        [currentMarketplace]: { ...prev.marketplaces[currentMarketplace], filters: finalFilters },
      },
    }));
    setConfigModalOpen(false);
    toast({
      title: "✅ Filtros salvos",
      description: `Configurações do ${getMarketplaceName(currentMarketplace)} atualizadas.`,
      className: "bg-green-600 text-white border-none",
    });
  };

  const handleStartScraping = async () => {
    const enabledAndConnected = Object.entries(config.marketplaces)
      .filter(([mp, cfg]) => cfg.enabled && connections[mp as Marketplace]);

    if (enabledAndConnected.length === 0) {
      toast({ title: "⚠️ Nenhum marketplace disponível", description: "Habilite e configure pelo menos um marketplace.", variant: "destructive" });
      return;
    }

    const marketplacesConfig: Record<string, any> = {};
    for (const [mp, mpCfg] of Object.entries(config.marketplaces)) {
      const marketplace = mp as Marketplace;
      if (!mpCfg.enabled || !connections[marketplace]) continue;
      const f = mpCfg.filters || {};
      const hasSearch = !!f.searchTerm?.trim();
      marketplacesConfig[marketplace] = {
        enabled: true,
        quantity: mpCfg.quantity,
        searchTerm: hasSearch ? f.searchTerm!.trim() : undefined,
        categoria: !hasSearch ? (f.categoria || undefined) : undefined,
        categoryKey: !hasSearch ? (f.categoryKey || undefined) : undefined,
        minDiscount: f.minDiscount ?? 20,
        maxPrice: f.maxPrice ?? 20000,
        frete_gratis: f.frete_gratis,
      };
    }

    toast({ title: "🚀 Automação Iniciada", description: `Coletando de ${enabledAndConnected.length} marketplace(s).`, className: "bg-zinc-900 text-white border-primary" });
    await runScraping({ marketplaces: marketplacesConfig as any, minDiscount: 20, maxPrice: 20000 });
  };

  // ─────────────────────────────────────────────
  // HANDLER: Finalizar processo e salvar no banco
  // ─────────────────────────────────────────────

  const handleFinalizeScraping = async () => {
    if (isFinalizing) return;

    const collectedCount = scrapingStatus.itemsCollected;
    const liveProducts = scrapingStatus.liveProducts ?? [];

    setIsFinalizing(true);

    try {
      // Para o processo de scraping em andamento
      resetScrapingStatus();

      // Envia os produtos coletados para o banco de dados
      // A função `finalizeScraping` deve ser exposta pelo DashboardContext
      // e é responsável por persistir os dados no banco
      if (typeof finalizeScraping === 'function') {
        await finalizeScraping(liveProducts);
      }

      toast({
        title: "✅ Processo finalizado!",
        description: collectedCount > 0
          ? `${formatNumber(collectedCount)} produto(s) enviado(s) ao banco de dados com sucesso.`
          : 'Processo de scraping encerrado.',
        className: "bg-green-600 text-white border-none shadow-lg",
      });
    } catch (error) {
      console.error('[AutomationPage] Erro ao finalizar scraping:', error);
      toast({
        title: "❌ Erro ao finalizar",
        description: "Não foi possível salvar os dados. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  const totalToCollect = Object.entries(config.marketplaces)
    .filter(([mp, cfg]) => cfg.enabled && connections[mp as Marketplace])
    .reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);

  const connectedMarketplaces = (Object.entries(config.marketplaces) as [Marketplace, MarketplaceConfig][])
    .filter(([mp]) => connections[mp]);

  const disconnectedMarketplaces = (Object.entries(config.marketplaces) as [Marketplace, MarketplaceConfig][])
    .filter(([mp]) => !connections[mp]);

  const CIRCLE_CIRCUMFERENCE = 351.858;
  const circleDashoffset = CIRCLE_CIRCUMFERENCE - (CIRCLE_CIRCUMFERENCE * smoothProgress) / 100;

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">

      {/* ══════════════════════════════════════════
          DESKTOP LAYOUT
          ══════════════════════════════════════════ */}
      <div className="hidden md:block p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Automação</h1>
            <p className="text-muted-foreground">Configure e execute a coleta automatizada de produtos</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{formatNumber(products.length)} produtos no catálogo</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-primary" />
                Configuração de Scraping
              </CardTitle>
              <CardDescription>Selecione os marketplaces e configure filtros individuais</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {connectedMarketplaces.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {connectedMarketplaces.map(([mp, mpConfig]) => (
                    <div key={mp} id={`marketplace-${mp}`}
                      className={`relative overflow-hidden rounded-xl border-2 transition-all ${mpConfig.enabled ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-muted-foreground/30'}`}>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <Checkbox id={mp} checked={mpConfig.enabled} onCheckedChange={() => handleMarketplaceToggle(mp)} />
                            <MarketplaceBadge marketplace={mp} />
                          </div>
                          <div className="flex items-center gap-2">
                            <ActiveFilterBadge filters={mpConfig.filters} />
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 relative ${mpConfig.filters?.searchTerm?.trim() ? 'text-blue-600 bg-blue-500/10 hover:bg-blue-500/20' : ''}`}
                              onClick={() => openFiltersModal(mp, true)}
                              title="Busca por palavra-chave"
                            >
                              <Search className="w-4 h-4" />
                              {mpConfig.filters?.searchTerm?.trim() && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border-2 border-background" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFiltersModal(mp)}>
                              <Settings2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Quantidade:</span>
                            <span className="text-sm font-medium text-primary">{mpConfig.quantity} itens</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Slider min={1} max={300} step={1} value={[mpConfig.quantity]} onValueChange={([v]) => handleQuantityChange(mp, v)} disabled={!mpConfig.enabled} className="flex-1" />
                            <Input type="number" min={1} max={1000} value={mpConfig.quantity} onChange={(e) => handleQuantityChange(mp, parseInt(e.target.value))} disabled={!mpConfig.enabled} className="w-20 h-8 text-center" />
                          </div>
                        </div>
                        {mpConfig.filters && (
                          <div className="mt-3 pt-3 border-t space-y-1">
                            {mpConfig.filters.searchTerm?.trim() ? (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Modo:</span>
                                <span className="font-medium text-blue-600 flex items-center gap-1"><Search className="w-3 h-3" />Busca global</span>
                              </div>
                            ) : mpConfig.filters.categoria && mpConfig.filters.categoria !== 'todas' && mpConfig.filters.categoria !== '' ? (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Categoria:</span>
                                <span className="font-medium text-primary">{mpConfig.filters.categoria}</span>
                              </div>
                            ) : null}
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Desconto:</span>
                              <span className="font-medium">{mpConfig.filters.minDiscount ?? 0}%+</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Preço máx:</span>
                              <span className="font-medium">R$ {(mpConfig.filters.maxPrice ?? 20000).toLocaleString('pt-BR')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !connectionsLoading && (
                  <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed rounded-xl border-muted-foreground/20">
                    <Package className="w-10 h-10 text-muted-foreground mb-3" />
                    <p className="font-medium text-sm">Nenhum marketplace configurado</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">Configure pelo menos um marketplace para iniciar a coleta</p>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate('/settings')}>
                      Ir para Configurações <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                )
              )}
              {disconnectedMarketplaces.length > 0 && (
                <div className="pt-2 border-t flex items-center gap-2 text-xs text-muted-foreground/50">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                  <span>{disconnectedMarketplaces.length} marketplace{disconnectedMarketplaces.length > 1 ? 's' : ''} não configurado{disconnectedMarketplaces.length > 1 ? 's' : ''} — em breve disponível</span>
                </div>
              )}
              <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
                <div>
                  <span className="text-sm text-muted-foreground">Total a coletar:</span>
                  <span className="ml-2 font-bold text-lg">{formatNumber(totalToCollect)} itens</span>
                </div>
                {/* ── Botões de ação: Iniciar / Finalizar (Desktop) ── */}
                <div className="flex items-center gap-2">
                  {scrapingStatus.isRunning && (
                    <Button
                      size="lg"
                      variant="destructive"
                      onClick={handleFinalizeScraping}
                      disabled={isFinalizing}
                      className="gap-2"
                    >
                      {isFinalizing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
                      ) : (
                        <><StopCircle className="w-4 h-4" />Finalizar</>
                      )}
                    </Button>
                  )}
                  <Button size="lg" onClick={handleStartScraping} disabled={scrapingStatus.isRunning || totalToCollect === 0} className="gap-2">
                    {scrapingStatus.isRunning
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Coletando...</>
                      : <><Play className="w-4 h-4" />Iniciar Scraping</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />Status da Execução
                </CardTitle>
                {scrapingStatus.isRunning && (
                  <Button variant="ghost" size="icon" onClick={resetScrapingStatus} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {scrapingStatus.isRunning ? (
                <>
                  <div className="text-center py-4">
                    <div className="relative inline-flex items-center justify-center w-32 h-32 mb-4">
                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/20" />
                        <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={CIRCLE_CIRCUMFERENCE} strokeDashoffset={circleDashoffset} className="text-primary" strokeLinecap="round" />
                      </svg>
                      <div className="flex flex-col items-center">
                        <Loader2 className="w-10 h-10 animate-spin text-primary mb-1" />
                        <span className="text-xl font-bold">{Math.round(smoothProgress)}%</span>
                      </div>
                    </div>
                    <p className="font-bold text-sm mb-3 animate-pulse">Coletando produtos...</p>
                    {scrapingStatus.currentMarketplace && (
                      <div className="flex justify-center mb-4">
                        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
                          <span className="text-xs text-muted-foreground">Marketplace:</span>
                          <MarketplaceBadge marketplace={scrapingStatus.currentMarketplace} />
                        </div>
                      </div>
                    )}
                  </div>
                  <Progress value={smoothProgress} className="h-3" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-secondary rounded-lg">
                      <p className="text-2xl font-bold text-primary">{formatNumber(scrapingStatus.itemsCollected)}</p>
                      <p className="text-xs text-muted-foreground">Coletados</p>
                    </div>
                    <div className="text-center p-3 bg-secondary rounded-lg">
                      <p className="text-2xl font-bold text-primary">{formatNumber(scrapingStatus.totalItems)}</p>
                      <p className="text-xs text-muted-foreground">Esperados</p>
                    </div>
                  </div>
                  {scrapingStatus.liveProducts?.length > 0 && (
                    <div className="mt-4 border-t pt-4">
                      <ScrapingLiveProducts products={scrapingStatus.liveProducts} />
                    </div>
                  )}
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-2 bg-blue-500/10 text-blue-600 rounded-lg">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                      <p className="text-xs font-medium">{scrapingStatus.liveProducts?.length > 0 ? 'Processando em tempo real...' : 'Conectando...'}</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <Zap className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm">Configure e inicie o scraping para ver o progresso em tempo real</p>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3 text-sm">Atividade Recente</h4>
                    <div className="space-y-3">
                      {scrapingStatus.recentHistory?.length > 0 ? (
                        scrapingStatus.recentHistory.slice(0, 3).map((session) => (
                          <div key={session.id} className="flex items-start gap-3 text-sm">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">Scraping concluído</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{formatNumber(session.itemsCollected)} produtos</span>
                                <span>•</span>
                                <MarketplaceBadge marketplace={session.marketplace} />
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                                <Clock className="w-3 h-3" />
                                <span>{getTimeAgo(session.completedAt)}</span>
                                {session.duration > 0 && (<><span>•</span><span>{formatDuration(session.duration)}</span></>)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-start gap-3 text-sm">
                          <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center mt-0.5">
                            <span className="text-[10px]">📦</span>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Nenhuma atividade recente</p>
                            <p className="text-[10px] text-muted-foreground">Execute um scraping para ver o histórico</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MOBILE LAYOUT — Premium redesign
          ══════════════════════════════════════════ */}
      <div className="md:hidden w-full pb-8">

        {/* ── Mobile Header ── */}
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[26px] font-black tracking-tight leading-none">Automação</h1>
              <p className="text-[12px] text-muted-foreground mt-1 font-medium">Coleta automatizada de produtos</p>
            </div>
            {/* Catalog count pill */}
            <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-xl px-3 py-1.5 flex-shrink-0">
              <Package className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-bold text-primary tabular-nums">{formatNumber(products.length)}</span>
            </div>
          </div>
        </div>


        {/* ── Section: Marketplaces ── */}
        <div className="px-4 mb-2 flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Marketplaces</span>
        </div>

        <div className="px-4 space-y-3 mb-5">
          {connectedMarketplaces.length > 0 ? (
            connectedMarketplaces.map(([mp, mpConfig]) => (
              <MobileMarketplaceCard
                key={mp}
                mp={mp}
                mpConfig={mpConfig}
                onToggle={() => handleMarketplaceToggle(mp)}
                onQuantityChange={(v) => handleQuantityChange(mp, v)}
                onOpenFilters={() => openFiltersModal(mp)}
                onOpenSearch={() => openFiltersModal(mp, true)}
              />
            ))
          ) : (
            !connectionsLoading && (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-2xl border-2 border-dashed border-muted-foreground/20">
                <Package className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="font-bold text-sm">Nenhum marketplace configurado</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Configure um marketplace para iniciar</p>
                <button
                  onClick={() => navigate('/settings')}
                  className="flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary/20 bg-primary/5 px-4 py-2 rounded-xl active:scale-95 transition-transform"
                >
                  Ir para Configurações <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )
          )}

          {disconnectedMarketplaces.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
              <span>
                {disconnectedMarketplaces.length} marketplace{disconnectedMarketplaces.length > 1 ? 's' : ''} em breve
              </span>
            </div>
          )}
        </div>

        {/* ── CTA: Iniciar / Finalizar scraping (Mobile) ── */}
        <div className="px-4 mb-5">
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Total a coletar</p>
                <p className="text-xl font-black text-foreground tabular-nums leading-none mt-0.5">
                  {formatNumber(totalToCollect)}
                  <span className="text-xs font-semibold text-muted-foreground ml-1">itens</span>
                </p>
              </div>
              {!scrapingStatus.isRunning && (
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
              )}
            </div>

            {/* Botão Finalizar — visível apenas durante a coleta (Mobile) */}
            {scrapingStatus.isRunning && (
              <button
                onClick={handleFinalizeScraping}
                disabled={isFinalizing}
                className={`w-full py-3.5 rounded-xl font-black text-[14px] tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2.5 mb-2.5 ${
                  isFinalizing
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/25 hover:shadow-destructive/40'
                }`}
              >
                {isFinalizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando no banco...
                  </>
                ) : (
                  <>
                    <StopCircle className="w-4 h-4" />
                    Finalizar e Salvar
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleStartScraping}
              disabled={scrapingStatus.isRunning || totalToCollect === 0}
              className={`w-full py-4 rounded-xl font-black text-[15px] tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2.5 ${
                scrapingStatus.isRunning || totalToCollect === 0
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40'
              }`}
            >
              {scrapingStatus.isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Coletando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Iniciar Scraping
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Status da Execução (Mobile) ── */}
        <div className="px-4 mb-4">
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-sm font-bold">Status da Execução</span>
              </div>
              {scrapingStatus.isRunning && (
                <button onClick={resetScrapingStatus} className="w-7 h-7 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors active:scale-90">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {scrapingStatus.isRunning ? (
              <div className="p-4 space-y-4">
                <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full transition-all duration-300" style={{ width: `${smoothProgress}%` }} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative flex-shrink-0 w-24 h-24">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-muted/20" />
                      <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray="251.33" strokeDashoffset={251.33 - (251.33 * smoothProgress) / 100} className="text-primary transition-all duration-300" strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-primary mb-0.5" />
                      <span className="text-lg font-black leading-none">{Math.round(smoothProgress)}%</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground font-medium">Coletados</span>
                      <span className="text-2xl font-black text-primary tabular-nums">{formatNumber(scrapingStatus.itemsCollected)}</span>
                    </div>
                    <div className="w-full h-px bg-border/40" />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground font-medium">Esperados</span>
                      <span className="text-2xl font-black tabular-nums">{formatNumber(scrapingStatus.totalItems)}</span>
                    </div>
                  </div>
                </div>
                {scrapingStatus.currentMarketplace && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary/8 rounded-xl">
                    <span className="text-[11px] text-muted-foreground">Coletando via:</span>
                    <MarketplaceBadge marketplace={scrapingStatus.currentMarketplace} />
                  </div>
                )}
                <div className="flex items-center justify-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-full border border-blue-500/20">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                    <p className="text-[11px] font-semibold text-blue-600">
                      {scrapingStatus.liveProducts?.length > 0 ? 'Processando em tempo real' : 'Conectando...'}
                    </p>
                  </div>
                </div>
                {scrapingStatus.liveProducts?.length > 0 && (
                  <div className="pt-3 border-t border-border/40">
                    <ScrapingLiveProducts products={scrapingStatus.liveProducts} />
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
                    <Zap className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-xs text-muted-foreground">Inicie o scraping para ver o progresso em tempo real</p>
                </div>
                {scrapingStatus.recentHistory?.length > 0 ? (
                  <div className="border-t border-border/40 pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Atividade Recente</p>
                    <div className="space-y-3">
                      {scrapingStatus.recentHistory.slice(0, 3).map((session: any) => (
                        <div key={session.id} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] font-bold">{formatNumber(session.itemsCollected)} produtos</span>
                              <MarketplaceBadge marketplace={session.marketplace} />
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{getTimeAgo(session.completedAt)}</span>
                              {session.duration > 0 && (<><span className="text-muted-foreground/40 text-[10px]">·</span><span className="text-[10px] text-muted-foreground">{formatDuration(session.duration)}</span></>)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-border/40 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Atividade Recente</p>
                    <p className="text-[11px] text-muted-foreground/60">Nenhuma atividade ainda. Execute um scraping.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════
          MODAL DE FILTROS (shared desktop + mobile)
          ══════════════════════════════════════════ */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-2xl mx-auto rounded-2xl flex flex-col max-h-[90dvh] p-0 overflow-hidden">
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-primary" />
                Filtros — {currentMarketplace && getMarketplaceName(currentMarketplace)}
              </DialogTitle>
              <DialogDescription />
            </DialogHeader>
          </div>

          <ScrollArea className="flex-1 overflow-y-auto">
          <div className="space-y-5 p-6">
            {marketplaceHasAdvancedFilters(currentMarketplace) && (
              <div className="rounded-xl border bg-muted/30 overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/50 flex items-center justify-between">
                  <p className="text-sm font-semibold">Modo de busca</p>
                  {isSearchActive && (
                    <Badge className="bg-blue-500/15 text-blue-600 border-0 text-xs gap-1 font-medium">
                      <Search className="w-3 h-3" />Busca global ativa
                    </Badge>
                  )}
                  {!isSearchActive && tempFilters.categoria && tempFilters.categoria !== 'todas' && tempFilters.categoria !== '' && (
                    <Badge className="bg-primary/15 text-primary border-0 text-xs gap-1 font-medium">
                      <Tag className="w-3 h-3" />Categoria ativa
                    </Badge>
                  )}
                  {!isSearchActive && (!tempFilters.categoria || tempFilters.categoria === 'todas' || tempFilters.categoria === '') && (
                    <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">Geral</Badge>
                  )}
                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="modal-search" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-blue-500" />Palavra-chave
                    </Label>
                    <div className="relative">
                      <Input
                        id="modal-search"
                        ref={searchInputRef}
                        placeholder="Ex: smartphone, tênis nike..."
                        value={tempFilters.searchTerm || ''}
                        onChange={(e) => handleSearchTermChange(e.target.value)}
                        className="pr-8 text-sm h-10"
                        autoComplete="off"
                        autoFocus={focusSearchOnOpen}
                      />
                      {tempFilters.searchTerm && (
                        <button
                          onClick={() => setTempFilters(prev => ({ ...prev, searchTerm: '' }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          type="button" tabIndex={-1}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Pesquisa em <strong>todo o marketplace</strong>, independente de categoria
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 transition-opacity duration-200 ${isSearchActive ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                      <Tag className={`w-3.5 h-3.5 transition-colors ${isSearchActive ? 'text-muted-foreground/40' : 'text-primary'}`} />Categoria
                    </Label>
                    <div className={`relative transition-opacity duration-200 ${isSearchActive ? 'opacity-40 pointer-events-none' : ''}`}>
                      <select
                        value={tempFilters.categoria || ''}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        disabled={isSearchActive}
                        className={`w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors ${isSearchActive ? 'cursor-not-allowed bg-muted' : 'cursor-pointer hover:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary'}`}
                      >
                        {getCategoriesForMarketplace(currentMarketplace).map(cat => (
                          <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
                        ))}
                      </select>
                    </div>
                    {isSearchActive ? (
                      <p className="text-[11px] text-blue-500 flex items-center gap-1 leading-snug">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />Desativado enquanto há palavra-chave
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground leading-snug">Filtra dentro de uma seção específica do site</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border bg-muted/30 overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/50">
                <p className="text-sm font-semibold">Filtros de qualidade</p>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desconto mínimo</Label>
                    <div className="flex items-center gap-1 bg-background border rounded-md px-2 py-0.5">
                      <Input
                        type="number"
                        value={tempFilters.minDiscount ?? 20}
                        onChange={(e) => setTempFilters(prev => ({ ...prev, minDiscount: Math.min(90, Math.max(0, parseInt(e.target.value) || 0)) }))}
                        className="w-10 h-6 border-0 p-0 text-center text-xs focus-visible:ring-0 shadow-none"
                        min={0} max={90}
                      />
                      <span className="text-xs text-muted-foreground font-medium">%</span>
                    </div>
                  </div>
                  <Slider
                    min={0} max={90} step={1}
                    value={[tempFilters.minDiscount ?? 20]}
                    onValueChange={([v]) => setTempFilters(prev => ({ ...prev, minDiscount: v }))}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60">
                    <span>Sem mínimo</span><span>90% off</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preço máximo</Label>
                    <div className="flex items-center gap-1 bg-background border rounded-md px-2 py-0.5">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        value={tempFilters.maxPrice ?? 20000}
                        onChange={(e) => setTempFilters(prev => ({ ...prev, maxPrice: Math.max(50, parseInt(e.target.value) || 50) }))}
                        className="w-16 h-6 border-0 p-0 text-center text-xs focus-visible:ring-0 shadow-none"
                        min={50}
                      />
                    </div>
                  </div>
                  <Slider
                    min={50} max={20000} step={50}
                    value={[tempFilters.maxPrice ?? 20000]}
                    onValueChange={([v]) => setTempFilters(prev => ({ ...prev, maxPrice: v }))}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60">
                    <span>R$ 50</span><span>R$ 20.000</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          </ScrollArea>
          <div className="flex-shrink-0 flex gap-3 p-4 border-t bg-background">
            <Button variant="outline" onClick={clearFilters} className="gap-2">
              <X className="w-4 h-4" /> Limpar tudo
            </Button>
            <Button onClick={saveFilters} className="flex-1 gap-2">
              <CheckCircle className="w-4 h-4" /> Salvar configurações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.02); }
        }
        .animate-pulse-slow { animation: pulse-slow 1.5s cubic-bezier(0.4, 0, 0.6, 1) 3; }
      `}</style>
    </div>
  );
}
