import { useState } from 'react';
import { useDashboard, ScrapingConfig } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { Zap, Play, Settings2, Loader2, CheckCircle, Package, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatNumber, getMarketplaceName, Marketplace } from '@/lib/mockData';

export function AutomationPage() {
  const { runScraping, scrapingStatus, products } = useDashboard();
  const { toast } = useToast();

  const [config, setConfig] = useState<ScrapingConfig>({
    marketplaces: {
      mercadolivre: { enabled: true, quantity: 50 },
      amazon: { enabled: true, quantity: 50 },
      magalu: { enabled: false, quantity: 30 },
      shopee: { enabled: true, quantity: 40 },
    },
    minDiscount: 20,
    maxPrice: 500,
  });

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
    setConfig(prev => ({
      ...prev,
      marketplaces: {
        ...prev.marketplaces,
        [mp]: {
          ...prev.marketplaces[mp],
          quantity
        }
      }
    }));
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
      title: "Scraping iniciado",
      description: "A coleta de produtos foi iniciada. Aguarde...",
    });

    const collected = await runScraping(config);

    toast({
      title: "Scraping concluído!",
      description: `${formatNumber(collected)} novos produtos foram adicionados.`,
    });
  };

  const totalToCollect = Object.entries(config.marketplaces)
    .filter(([_, cfg]) => cfg.enabled)
    .reduce((sum, [_, cfg]) => sum + cfg.quantity, 0);

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
              Selecione os marketplaces e configure a quantidade de itens para coleta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Marketplaces */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Object.entries(config.marketplaces) as [Marketplace, { enabled: boolean; quantity: number }][]).map(([mp, mpConfig]) => (
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
                    {mpConfig.enabled && (
                      <CheckCircle className="w-5 h-5 text-status-active" />
                    )}
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
                        id={`qty-${mp}`}
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
                        max={300}
                        value={mpConfig.quantity}
                        onChange={(e) => handleQuantityChange(mp, Number(e.target.value))}
                        disabled={!mpConfig.enabled}
                        className="w-20"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Desconto mínimo (%)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={0}
                    max={90}
                    step={5}
                    value={[config.minDiscount]}
                    onValueChange={([v]) => setConfig(prev => ({ ...prev, minDiscount: v }))}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-12 text-right">{config.minDiscount}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Preço máximo (R$)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={50}
                    max={5000}
                    step={50}
                    value={[config.maxPrice]}
                    onValueChange={([v]) => setConfig(prev => ({ ...prev, maxPrice: v }))}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-20 text-right">R$ {config.maxPrice}</span>
                </div>
              </div>
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
                  <div className="relative inline-flex items-center justify-center w-24 h-24 mb-4">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
                    <div 
                      className="absolute inset-0 border-4 border-primary rounded-full animate-spin"
                      style={{ 
                        clipPath: `polygon(50% 50%, 50% 0, ${50 + 50 * Math.sin(scrapingStatus.progress * Math.PI / 50)}% ${50 - 50 * Math.cos(scrapingStatus.progress * Math.PI / 50)}%, 50% 50%)`
                      }}
                    />
                    <span className="text-xl font-bold">{Math.round(scrapingStatus.progress)}%</span>
                  </div>
                  <p className="font-medium">Coletando produtos...</p>
                  {scrapingStatus.currentMarketplace && (
                    <div className="mt-2">
                      <MarketplaceBadge marketplace={scrapingStatus.currentMarketplace} />
                    </div>
                  )}
                </div>
                <Progress value={scrapingStatus.progress} className="h-2" />
                <div className="text-center text-sm text-muted-foreground">
                  {scrapingStatus.itemsCollected} de {scrapingStatus.totalItems} itens
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Zap className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">
                  Configure e inicie o scraping para ver o progresso
                </p>
              </div>
            )}

            {/* Recent Activity */}
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3">Atividade Recente</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <CheckCircle className="w-4 h-4 text-status-active mt-0.5" />
                  <div>
                    <p className="font-medium">Scraping concluído</p>
                    <p className="text-muted-foreground">150 produtos - ML</p>
                    <p className="text-xs text-muted-foreground">Há 2 horas</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <CheckCircle className="w-4 h-4 text-status-active mt-0.5" />
                  <div>
                    <p className="font-medium">Scraping concluído</p>
                    <p className="text-muted-foreground">80 produtos - Amazon</p>
                    <p className="text-xs text-muted-foreground">Há 4 horas</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <AlertCircle className="w-4 h-4 text-status-risk mt-0.5" />
                  <div>
                    <p className="font-medium">Limite de requisições</p>
                    <p className="text-muted-foreground">Shopee - aguardando 5min</p>
                    <p className="text-xs text-muted-foreground">Ontem</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
