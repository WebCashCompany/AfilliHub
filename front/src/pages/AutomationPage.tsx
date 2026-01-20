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

  // ═══════════════════════════════════════════════════════════
  // ✅ EFEITO PARA NOTIFICAÇÃO DE CONCLUSÃO
  // ═══════════════════════════════════════════════════════════
  
  useEffect(() => {
    // Detecta quando scraping completa
    if (!scrapingStatus.isRunning && scrapingStatus.progress === 100 && scrapingStatus.itemsCollected > 0) {
      // Notificação de sucesso
      toast({
        title: "✅ Automação concluída!",
        description: `${formatNumber(scrapingStatus.itemsCollected)} novos produtos foram adicionados.`,
        className: "bg-green-600 text-white border-none shadow-lg",
      });

      // Notificação do navegador (se permitido)
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

    // ✅ INICIA O SCRAPING (progresso será atualizado via SSE)
    await runScraping(scrapingConfig);
  };

  const totalToCollect = Object.entries(config.marketplaces)
    .filter(([_, cfg]) => cfg.enabled)
    .reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);

  const hasActiveFilters = (filters?: MarketplaceFilters) => {
    if (!filters) return false;
    return !!(filters.categoria || filters.palavraChave || filters.frete_gratis);
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

                  {/* Quantidade */}
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

                  {/* Resumo de Filtros */}
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

        {/* Status Panel - SINCRONIZADO */}
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
                  <div className="relative inline-flex items-center justify-center w-28 h-28 mb-4">
                    {/* SVG Progress Circle */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle 
                        cx="56" 
                        cy="56" 
                        r="50" 
                        stroke="currentColor" 
                        strokeWidth="6" 
                        fill="transparent" 
                        className="text-muted/20" 
                      />
                      <circle 
                        cx="56" 
                        cy="56" 
                        r="50" 
                        stroke="currentColor" 
                        strokeWidth="6" 
                        fill="transparent" 
                        strokeDasharray="314.159"
                        strokeDashoffset={314.159 - (314.159 * scrapingStatus.progress) / 100}
                        className="text-primary transition-all duration-300 ease-out"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-2xl font-black">{Math.round(scrapingStatus.progress)}%</span>
                  </div>
                  <p className="font-bold text-sm animate-pulse">Coletando produtos agora...</p>
                  {scrapingStatus.currentMarketplace && (
                    <div className="mt-2 flex justify-center">
                      <MarketplaceBadge marketplace={scrapingStatus.currentMarketplace} />
                    </div>
                  )}
                </div>
                <Progress value={scrapingStatus.progress} className="h-2 transition-all duration-300" />
                <div className="text-center text-xs text-muted-foreground font-medium">
                  {scrapingStatus.itemsCollected} de {scrapingStatus.totalItems} itens processados
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Zap className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Configure e inicie o scraping para ver o progresso em tempo real
                </p>
              </div>
            )}

            {/* Recent Activity */}
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
              Configure filtros específicos para este marketplace. Use os sliders ou digite o valor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Filtros de Preço e Desconto */}
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

            {/* Filtros Específicos ML */}
            {currentMarketplace === 'mercadolivre' && (
              <>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="modal-categoria">Categoria</Label>
                    <select
                      id="modal-categoria"
                      value={tempFilters.categoria || ''}
                      onChange={(e) => setTempFilters(prev => ({ ...prev, categoria: e.target.value }))}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Todas as categorias</option>
                      <option value="celulares">📱 Celulares</option>
                      <option value="beleza">💄 Beleza</option>
                      <option value="eletrodomesticos">🏠 Eletrodomésticos</option>
                      <option value="casa_decoracao">🛋️ Casa e Decoração</option>
                      <option value="calcados_roupas">👟 Calçados e Roupas</option>
                      <option value="informatica">💻 Informática</option>
                      <option value="games">🎮 Games</option>
                      <option value="eletronicos">📺 Eletrônicos</option>
                      <option value="joias_relogios">⌚ Joias e Relógios</option>
                      <option value="esportes">⚽ Esportes</option>
                      <option value="ferramentas">🔧 Ferramentas</option>
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