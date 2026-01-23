import { useState, useEffect } from 'react';
import { useDashboard, ScrapingConfig } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Zap, Play, Settings2, Loader2, CheckCircle, Package, AlertCircle, Filter, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatNumber, getMarketplaceName, Marketplace } from '@/lib/mockData';

interface MarketplaceFilters {
  categoria?: string;
  categoryKey?: string; // 🆕 Para Magalu
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

// ═══════════════════════════════════════════════════════════
// 🆕 CATEGORIAS DO MAGAZINE LUIZA (lowercase para exibição, UPPERCASE para backend)
// ═══════════════════════════════════════════════════════════
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
  { value: '', label: 'Todas as categorias', icon: '📦' },
  { value: 'celulares', label: 'Celulares', icon: '📱' },
  { value: 'beleza', label: 'Beleza', icon: '💄' },
  { value: 'eletrodomesticos', label: 'Eletrodomésticos', icon: '🏠' },
  { value: 'casa_decoracao', label: 'Casa e Decoração', icon: '🛋️' },
  { value: 'calcados_roupas', label: 'Calçados e Roupas', icon: '👟' },
  { value: 'informatica', label: 'Informática', icon: '💻' },
  { value: 'games', label: 'Games', icon: '🎮' },
  { value: 'eletronicos', label: 'Eletrônicos', icon: '📺' },
  { value: 'joias_relogios', label: 'Joias e Relógios', icon: '⌚' },
  { value: 'esportes', label: 'Esportes', icon: '⚽' },
  { value: 'ferramentas', label: 'Ferramentas', icon: '🔧' },
];

export function AutomationPage() {
  const { runScraping, scrapingStatus, products } = useDashboard();
  const { toast } = useToast();

  const [config, setConfig] = useState<{
    marketplaces: Record<Marketplace, MarketplaceConfig>;
  }>({
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
  });

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [currentMarketplace, setCurrentMarketplace] = useState<Marketplace | null>(null);
  const [tempFilters, setTempFilters] = useState<MarketplaceFilters>({});

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
    const enabledCount = Object.values(config.marketplaces).filter(m => m.enabled).length;
    if (enabledCount === 0) {
      toast({
        title: "Selecione pelo menos um marketplace",
        description: "Você precisa selecionar ao menos um marketplace para iniciar a coleta.",
        variant: "destructive"
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
    .filter(([_, cfg]) => cfg.enabled)
    .reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);

  const hasActiveFilters = (filters?: MarketplaceFilters) => {
    if (!filters) return false;
    return !!(filters.categoria || filters.categoryKey || filters.palavraChave || filters.frete_gratis);
  };

  // ═══════════════════════════════════════════════════════════
  // 🆕 FUNÇÃO PARA OBTER CATEGORIAS BASEADO NO MARKETPLACE
  // ═══════════════════════════════════════════════════════════
  const getCategoriesForMarketplace = (mp: Marketplace | null) => {
    if (mp === 'magalu') {
      return MAGALU_CATEGORIES;
    } else if (mp === 'mercadolivre') {
      return MERCADOLIVRE_CATEGORIES;
    }
    return [];
  };

  // ═══════════════════════════════════════════════════════════
  // 🆕 VERIFICAR SE MARKETPLACE TEM FILTROS AVANÇADOS
  // ═══════════════════════════════════════════════════════════
  const marketplaceHasAdvancedFilters = (mp: Marketplace | null) => {
    return mp === 'mercadolivre' || mp === 'magalu';
  };

  // ═══════════════════════════════════════════════════════════
  // 🆕 HANDLER PARA MUDANÇA DE CATEGORIA (MAGALU USA categoryKey)
  // ═══════════════════════════════════════════════════════════
  const handleCategoryChange = (value: string) => {
    if (currentMarketplace === 'magalu') {
      // Encontra a categoria pelo value e extrai o key
      const category = MAGALU_CATEGORIES.find(cat => cat.value === value);
      setTempFilters(prev => ({ 
        ...prev, 
        categoryKey: category?.key || '', // UPPERCASE para backend
        categoria: value // lowercase para exibição
      }));
    } else {
      // Mercado Livre usa apenas categoria
      setTempFilters(prev => ({ ...prev, categoria: value }));
    }
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
            {/* Marketplaces */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Object.entries(config.marketplaces) as [Marketplace, MarketplaceConfig][]).map(([mp, mpConfig]) => (
                <div 
                  key={mp}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    mpConfig.enabled 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border bg-card hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={mp}
                        checked={mpConfig.enabled}
                        onCheckedChange={() => handleMarketplaceToggle(mp)}
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
                      >
                        <Settings2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`qty-${mp}`} className="text-sm">
                        Quantidade
                      </Label>
                      <span className="text-sm font-medium text-primary">
                        {mpConfig.quantity} itens
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider
                        id={`qty-slider-${mp}`}
                        min={1}
                        max={300}
                        step={1}
                        value={[mpConfig.quantity]}
                        onValueChange={([v]) => handleQuantityChange(mp, v)}
                        disabled={!mpConfig.enabled}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={mpConfig.quantity}
                        onChange={(e) => handleQuantityChange(mp, parseInt(e.target.value))}
                        disabled={!mpConfig.enabled}
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
                      {hasActiveFilters(mpConfig.filters) && (
                        <div className="text-xs text-primary font-medium flex items-center gap-1">
                          <Filter className="w-3 h-3" />
                          Filtros personalizados ativos
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
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

        {/* Status Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Status da Execução
            </CardTitle>
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
                    <p className="text-2xl font-bold text-primary">
                      {formatNumber(scrapingStatus.itemsCollected)}
                    </p>
                    <p className="text-xs text-muted-foreground">Coletados</p>
                  </div>
                  <div className="text-center p-3 bg-secondary rounded-lg">
                    <p className="text-2xl font-bold text-primary">
                      {formatNumber(scrapingStatus.totalItems)}
                    </p>
                    <p className="text-xs text-muted-foreground">Esperados</p>
                  </div>
                </div>

                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-2 bg-blue-500/10 text-blue-600 rounded-lg">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                    <p className="text-xs font-medium">Processando dados...</p>
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

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-3 text-sm">Atividade Recente</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Scraping concluído</p>
                        <p className="text-muted-foreground text-xs">150 produtos - ML</p>
                        <p className="text-[10px] text-muted-foreground">Há 2 horas</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Scraping concluído</p>
                        <p className="text-muted-foreground text-xs">80 produtos - Amazon</p>
                        <p className="text-[10px] text-muted-foreground">Há 4 horas</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Limite de requisições</p>
                        <p className="text-muted-foreground text-xs">Shopee - aguardando 5min</p>
                        <p className="text-[10px] text-muted-foreground">Ontem</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          🆕 MODAL DE FILTROS - COM SUPORTE A MAGALU (categoryKey) E MERCADO LIVRE
          ═══════════════════════════════════════════════════════════ */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              Filtros - {currentMarketplace && getMarketplaceName(currentMarketplace)}
            </DialogTitle>
            <DialogDescription>
              Configure filtros específicos para este marketplace. Use os sliders ou digite o valor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Filtros Básicos (Todos os marketplaces) */}
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

            {/* 🆕 Filtros Avançados (Mercado Livre e Magalu) */}
            {marketplaceHasAdvancedFilters(currentMarketplace) && (
              <>
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
                        placeholder={currentMarketplace === 'magalu' ? 'Ex: panela...' : 'Ex: smartphone...'}
                        value={tempFilters.palavraChave || ''}
                        onChange={(e) => setTempFilters(prev => ({ ...prev, palavraChave: e.target.value }))}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                {/* Checkbox de frete grátis */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="modal-frete"
                    checked={tempFilters.frete_gratis || false}
                    onCheckedChange={(checked) => setTempFilters(prev => ({ ...prev, frete_gratis: checked as boolean }))}
                  />
                  <Label htmlFor="modal-frete" className="cursor-pointer">
                    🚚 Apenas produtos com frete grátis
                  </Label>
                </div>

                {/* 🆕 Preview do filtro (Debug) */}
                {currentMarketplace === 'magalu' && tempFilters.categoryKey && (
                  <div className="flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="text-xs text-blue-700 dark:text-blue-400">
                      <p className="font-medium mb-1">✅ Categoria selecionada</p>
                      <p>Categoria: <strong>{tempFilters.categoria}</strong> → Backend: <strong>{tempFilters.categoryKey}</strong></p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={clearFilters} className="gap-2">
              <X className="w-4 h-4" />
              Limpar
            </Button>
            <Button onClick={saveFilters} className="flex-1 gap-2">
              <CheckCircle className="w-4 h-4" />
              Salvar Filtros
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}