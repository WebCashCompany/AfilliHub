import { useState, useEffect } from 'react';
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
import { Zap, Play, Settings2, Loader2, CheckCircle, Package, Filter, Search, X, RotateCcw, Lock, ArrowRight, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatNumber, getMarketplaceName, Marketplace } from '@/lib/mockData';
import { useMarketplaceConnections } from '@/hooks/useMarketplaceConnections';

interface MarketplaceFilters {
  categoria?: string;
  categoryKey?: string;
  palavraChave?: string;
  frete_gratis?: boolean;
  minDiscount?: number;
  maxPrice?: number;
}

interface MarketplaceConfig {
  enabled: boolean;
  quantity: number;
  filters?: MarketplaceFilters;
}

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

// 🔥 HELPER PARA TEMPO RELATIVO
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

// 🔥 HELPER PARA FORMATAR DURAÇÃO
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}min ${secs}s`;
}

export function AutomationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { runScraping, scrapingStatus, products, resetScrapingStatus } = useDashboard();
  const { connections, loading: connectionsLoading, refresh: refreshConnections } = useMarketplaceConnections();
  const { toast } = useToast();

  const [config, setConfig] = useState<{
    marketplaces: Record<Marketplace, MarketplaceConfig>;
  }>(() => {
    const saved = localStorage.getItem('automation_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao carregar config salva:', e);
      }
    }
    return {
      marketplaces: {
        mercadolivre: { 
          enabled: true, 
          quantity: 50,
          filters: { minDiscount: 20, maxPrice: 20000 }
        },
        amazon: { 
          enabled: true, 
          quantity: 50,
          filters: { minDiscount: 20, maxPrice: 20000 }
        },
        magalu: { 
          enabled: false, 
          quantity: 30,
          filters: { minDiscount: 20, maxPrice: 20000 }
        },
        shopee: { 
          enabled: true, 
          quantity: 40,
          filters: { minDiscount: 20, maxPrice: 20000 }
        },
      },
    };
  });

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [currentMarketplace, setCurrentMarketplace] = useState<Marketplace | null>(null);
  const [tempFilters, setTempFilters] = useState<MarketplaceFilters>({});

  useEffect(() => {
    const state = location.state as { highlightMarketplace?: Marketplace } | null;
    if (state?.highlightMarketplace) {
      setTimeout(() => {
        const element = document.getElementById(`marketplace-${state.highlightMarketplace}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('animate-pulse-slow');
          setTimeout(() => element.classList.remove('animate-pulse-slow'), 3000);
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
        new Notification("Automação Concluída", {
          body: `${scrapingStatus.itemsCollected} produtos foram coletados com sucesso.`,
          icon: "/favicon.ico"
        });
      }
    }
  }, [scrapingStatus.isRunning, scrapingStatus.progress, scrapingStatus.itemsCollected]);

  const handleMarketplaceToggle = (mp: Marketplace) => {
    if (!connections[mp]) {
      toast({
        title: "⚠️ Marketplace não conectado",
        description: `Configure uma conta do ${getMarketplaceName(mp)} primeiro.`,
        variant: "destructive",
      });
      navigate('/settings', { state: { highlightMarketplace: mp } });
      return;
    }

    setConfig(prev => ({
      ...prev,
      marketplaces: {
        ...prev.marketplaces,
        [mp]: {
          ...prev.marketplaces[mp],
          enabled: !prev.marketplaces[mp].enabled
        }
      }
    }));
  };

  const handleQuantityChange = (mp: Marketplace, quantity: number) => {
    const val = isNaN(quantity) ? 0 : quantity;
    setConfig(prev => ({
      ...prev,
      marketplaces: {
        ...prev.marketplaces,
        [mp]: {
          ...prev.marketplaces[mp],
          quantity: val
        }
      }
    }));
  };

  const openFiltersModal = (mp: Marketplace) => {
    if (!connections[mp]) {
      toast({
        title: "⚠️ Marketplace não conectado",
        description: `Configure uma conta do ${getMarketplaceName(mp)} primeiro.`,
        variant: "destructive",
      });
      navigate('/settings', { state: { highlightMarketplace: mp } });
      return;
    }

    setCurrentMarketplace(mp);
    setTempFilters(config.marketplaces[mp].filters || {});
    setConfigModalOpen(true);
  };

  const saveFilters = () => {
    if (!currentMarketplace) return;
    
    setConfig(prev => ({
      ...prev,
      marketplaces: {
        ...prev.marketplaces,
        [currentMarketplace]: {
          ...prev.marketplaces[currentMarketplace],
          filters: tempFilters
        }
      }
    }));
    
    setConfigModalOpen(false);
    toast({
      title: "✅ Filtros salvos",
      description: `Configurações do ${getMarketplaceName(currentMarketplace)} atualizadas.`,
      className: "bg-green-600 text-white border-none",
    });
  };

  const clearFilters = () => {
    setTempFilters({
      minDiscount: 20,
      maxPrice: 20000
    });
  };

  const handleStartScraping = async () => {
    const enabledMarketplaces = Object.entries(config.marketplaces).filter(([_, cfg]) => cfg.enabled);
    
    if (enabledMarketplaces.length === 0) {
      toast({
        title: "Selecione pelo menos um marketplace",
        description: "Você precisa selecionar ao menos um marketplace para iniciar a coleta.",
        variant: "destructive"
      });
      return;
    }

    const disconnectedMarketplaces = enabledMarketplaces
      .filter(([mp]) => !connections[mp as Marketplace])
      .map(([mp]) => getMarketplaceName(mp as Marketplace));

    if (disconnectedMarketplaces.length > 0) {
      toast({
        title: "⚠️ Marketplaces desconectados",
        description: `Configure suas contas: ${disconnectedMarketplaces.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "🚀 Automação Iniciada",
      description: "A coleta de produtos foi iniciada. Acompanhe o progresso em tempo real.",
      className: "bg-zinc-900 text-white border-primary",
    });

    const scrapingConfig: ScrapingConfig = {
      marketplaces: config.marketplaces as any,
      minDiscount: 20,
      maxPrice: 20000,
    };

    await runScraping(scrapingConfig);
  };

  const totalToCollect = Object.entries(config.marketplaces)
    .filter(([mp, cfg]) => cfg.enabled && connections[mp as Marketplace])
    .reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);

  const hasActiveFilters = (filters?: MarketplaceFilters) => {
    if (!filters) return false;
    return !!(filters.categoria || filters.categoryKey || filters.palavraChave || filters.frete_gratis);
  };

  const getCategoriesForMarketplace = (mp: Marketplace | null) => {
    if (mp === 'magalu') return MAGALU_CATEGORIES;
    if (mp === 'mercadolivre') return MERCADOLIVRE_CATEGORIES;
    return [];
  };

  const marketplaceHasAdvancedFilters = (mp: Marketplace | null) => {
    return mp === 'mercadolivre' || mp === 'magalu';
  };

  const handleCategoryChange = (value: string) => {
    if (currentMarketplace === 'magalu') {
      const category = MAGALU_CATEGORIES.find(cat => cat.value === value);
      setTempFilters(prev => ({ 
        ...prev, 
        categoryKey: category?.key || '',
        categoria: value
      }));
    } else {
      setTempFilters(prev => ({ ...prev, categoria: value }));
    }
  };

  const handleGoToSettings = (mp: Marketplace) => {
    navigate('/settings', { state: { highlightMarketplace: mp } });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automação</h1>
          <p className="text-muted-foreground">Configure e execute a coleta automatizada de produtos</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {formatNumber(products.length)} produtos no catálogo
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scraping Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Configuração de Scraping
            </CardTitle>
            <CardDescription>
              Selecione os marketplaces e configure filtros individuais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Object.entries(config.marketplaces) as [Marketplace, MarketplaceConfig][]).map(([mp, mpConfig]) => {
                const isConnected = connections[mp];
                
                return (
                  <div 
                    key={mp}
                    id={`marketplace-${mp}`}
                    className={`relative overflow-hidden rounded-xl border-2 transition-all ${
                      !isConnected
                        ? 'border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-transparent'
                        : mpConfig.enabled 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border bg-card hover:border-muted-foreground/30'
                    }`}
                  >
                    {!isConnected && (
                      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mb-4 border-2 border-orange-500/30">
                          <Lock className="w-8 h-8 text-orange-400" />
                        </div>
                        <h4 className="text-white font-semibold text-lg mb-2">
                          Marketplace não conectado
                        </h4>
                        <p className="text-white/70 text-sm mb-6 max-w-[200px]">
                          Configure sua conta para usar este marketplace
                        </p>
                        <Button
                          onClick={() => handleGoToSettings(mp)}
                          className="bg-orange-500 hover:bg-orange-600 text-white gap-2 shadow-lg"
                          size="sm"
                        >
                          Configurar agora
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    <div className={`p-4 ${!isConnected ? 'opacity-30' : ''}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={mp}
                            checked={mpConfig.enabled && isConnected}
                            onCheckedChange={() => handleMarketplaceToggle(mp)}
                            disabled={!isConnected}
                          />
                          <MarketplaceBadge marketplace={mp} />
                        </div>
                        <div className="flex items-center gap-2">
                          {hasActiveFilters(mpConfig.filters) && (
                            <div className="w-2 h-2 bg-primary rounded-full" title="Filtros ativos" />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openFiltersModal(mp)}
                            disabled={!isConnected}
                          >
                            <Settings2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`qty-${mp}`} className="text-sm">Quantidade</Label>
                          <span className="text-sm font-medium text-primary">{mpConfig.quantity} itens</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Slider
                            min={1}
                            max={300}
                            step={1}
                            value={[mpConfig.quantity]}
                            onValueChange={([v]) => handleQuantityChange(mp, v)}
                            disabled={!mpConfig.enabled || !isConnected}
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            min={1}
                            max={1000}
                            value={mpConfig.quantity}
                            onChange={(e) => handleQuantityChange(mp, parseInt(e.target.value))}
                            disabled={!mpConfig.enabled || !isConnected}
                            className="w-20 h-8 text-center"
                          />
                        </div>
                      </div>

                      {mpConfig.filters && (
                        <div className="mt-3 pt-3 border-t space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Desconto:</span>
                            <span className="font-medium">{mpConfig.filters.minDiscount || 0}%+</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Preço máx:</span>
                            <span className="font-medium">R$ {(mpConfig.filters.maxPrice || 20000).toLocaleString('pt-BR')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
              <div>
                <span className="text-sm text-muted-foreground">Total a coletar:</span>
                <span className="ml-2 font-bold text-lg">{formatNumber(totalToCollect)} itens</span>
              </div>
              <Button 
                size="lg" 
                onClick={handleStartScraping}
                disabled={scrapingStatus.isRunning || totalToCollect === 0}
                className="gap-2"
              >
                {scrapingStatus.isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Coletando...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Iniciar Scraping
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* STATUS PANEL */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Status da Execução
              </CardTitle>
              
              {scrapingStatus.isRunning && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={resetScrapingStatus}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Resetar status (usar se travou)"
                >
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
                      <circle 
                        cx="64" 
                        cy="64" 
                        r="56" 
                        stroke="currentColor" 
                        strokeWidth="8" 
                        fill="transparent" 
                        className="text-muted/20" 
                      />
                      <circle 
                        cx="64" 
                        cy="64" 
                        r="56" 
                        stroke="currentColor" 
                        strokeWidth="8" 
                        fill="transparent" 
                        strokeDasharray="351.858"
                        strokeDashoffset={351.858 - (351.858 * scrapingStatus.progress) / 100}
                        className="text-primary transition-all duration-500 ease-out"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="flex flex-col items-center">
                      <Loader2 className="w-10 h-10 animate-spin text-primary mb-1" />
                      <span className="text-xl font-bold">{Math.round(scrapingStatus.progress)}%</span>
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

                <Progress value={scrapingStatus.progress} className="h-3" />

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

                {scrapingStatus.liveProducts && scrapingStatus.liveProducts.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <ScrapingLiveProducts products={scrapingStatus.liveProducts} />
                  </div>
                )}

                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-2 bg-blue-500/10 text-blue-600 rounded-lg">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                    <p className="text-xs font-medium">
                      {scrapingStatus.liveProducts && scrapingStatus.liveProducts.length > 0 
                        ? 'Processando produtos em tempo real...' 
                        : 'Conectando...'}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Zap className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Configure e inicie o scraping para ver o progresso em tempo real
                  </p>
                </div>

                {/* 🔥 ATIVIDADE RECENTE COM DADOS REAIS */}
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-3 text-sm">Atividade Recente</h4>
                  <div className="space-y-3">
                    {scrapingStatus.recentHistory && scrapingStatus.recentHistory.length > 0 ? (
                      scrapingStatus.recentHistory.slice(0, 3).map((session) => {
                        const timeAgo = getTimeAgo(session.completedAt);
                        
                        return (
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
                                <span>{timeAgo}</span>
                                {session.duration > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{formatDuration(session.duration)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-start gap-3 text-sm">
                        <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center mt-0.5">
                          <span className="text-[10px]">📦</span>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">
                            Nenhuma atividade recente
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Execute um scraping para ver o histórico
                          </p>
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

      {/* Modal de Filtros */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              Filtros - {currentMarketplace && getMarketplaceName(currentMarketplace)}
            </DialogTitle>
            <DialogDescription>
              Configure filtros específicos para este marketplace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Desconto mínimo (%)</Label>
                  <Input 
                    type="number"
                    value={tempFilters.minDiscount || 0}
                    onChange={(e) => setTempFilters(prev => ({ ...prev, minDiscount: parseInt(e.target.value) }))}
                    className="w-16 h-8 text-center text-xs"
                  />
                </div>
                <Slider
                  min={0}
                  max={90}
                  step={1}
                  value={[tempFilters.minDiscount || 20]}
                  onValueChange={([v]) => setTempFilters(prev => ({ ...prev, minDiscount: v }))}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Preço máximo (R$)</Label>
                  <Input 
                    type="number"
                    value={tempFilters.maxPrice || 0}
                    onChange={(e) => setTempFilters(prev => ({ ...prev, maxPrice: parseInt(e.target.value) }))}
                    className="w-24 h-8 text-center text-xs"
                  />
                </div>
                <Slider
                  min={50}
                  max={20000}
                  step={10}
                  value={[tempFilters.maxPrice || 20000]}
                  onValueChange={([v]) => setTempFilters(prev => ({ ...prev, maxPrice: v }))}
                />
              </div>
            </div>

            {marketplaceHasAdvancedFilters(currentMarketplace) && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="modal-categoria">Categoria</Label>
                  <select
                    id="modal-categoria"
                    value={tempFilters.categoria || ''}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {getCategoriesForMarketplace(currentMarketplace).map(cat => (
                      <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modal-palavra">Palavra-chave</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="modal-palavra"
                      placeholder="Ex: smartphone..."
                      value={tempFilters.palavraChave || ''}
                      onChange={(e) => setTempFilters(prev => ({ ...prev, palavraChave: e.target.value }))}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={clearFilters} className="gap-2">
              <X className="w-4 h-4" /> Limpar
            </Button>
            <Button onClick={saveFilters} className="flex-1 gap-2">
              <CheckCircle className="w-4 h-4" /> Salvar Filtros
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSS para animação */}
      <style>{`
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.02);
          }
        }
        .animate-pulse-slow {
          animation: pulse-slow 1.5s cubic-bezier(0.4, 0, 0.6, 1) 3;
        }
      `}</style>
    </div>
  );
}