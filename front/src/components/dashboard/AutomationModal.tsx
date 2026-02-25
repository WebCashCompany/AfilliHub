// src/components/dashboard/AutomationModal.tsx - TIMER MÍNIMO 5 MINUTOS

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Clock, Zap, Package, ShoppingBag } from 'lucide-react';

interface AutomationConfig {
  intervalMinutes: number;
  categories: string[];
  marketplaces: string[];
}

interface AutomationModalProps {
  open: boolean;
  onClose: () => void;
  onStart: (config: AutomationConfig) => void;
  availableCategories: string[];
  availableMarketplaces: string[];
}

const MIN_INTERVAL = 5;

export function AutomationModal({
  open,
  onClose,
  onStart,
  availableCategories,
  availableMarketplaces,
}: AutomationModalProps) {
  const [intervalMinutes, setIntervalMinutes] = useState(() => {
    const saved = localStorage.getItem('automation_modal_interval');
    const parsed = saved ? parseInt(saved) : 30;
    return Math.max(parsed, MIN_INTERVAL); // garante mínimo mesmo no storage
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('automation_modal_categories');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });

  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>(() => {
    const saved = localStorage.getItem('automation_modal_marketplaces');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });

  const [allCategories, setAllCategories] = useState(() => {
    const saved = localStorage.getItem('automation_modal_all_categories');
    return saved === 'false' ? false : true;
  });

  const [allMarketplaces, setAllMarketplaces] = useState(() => {
    const saved = localStorage.getItem('automation_modal_all_marketplaces');
    return saved === 'false' ? false : true;
  });

  useEffect(() => {
    localStorage.setItem('automation_modal_interval', String(intervalMinutes));
  }, [intervalMinutes]);

  useEffect(() => {
    localStorage.setItem('automation_modal_categories', JSON.stringify(selectedCategories));
  }, [selectedCategories]);

  useEffect(() => {
    localStorage.setItem('automation_modal_marketplaces', JSON.stringify(selectedMarketplaces));
  }, [selectedMarketplaces]);

  useEffect(() => {
    localStorage.setItem('automation_modal_all_categories', String(allCategories));
  }, [allCategories]);

  useEffect(() => {
    localStorage.setItem('automation_modal_all_marketplaces', String(allMarketplaces));
  }, [allMarketplaces]);

  const handleIntervalChange = (value: number) => {
    setIntervalMinutes(Math.max(value, MIN_INTERVAL));
  };

  const handleStart = () => {
    onStart({
      intervalMinutes,
      categories: allCategories ? ['all'] : selectedCategories,
      marketplaces: allMarketplaces ? ['all'] : selectedMarketplaces,
    });
    onClose();
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const toggleMarketplace = (marketplace: string) => {
    setSelectedMarketplaces((prev) =>
      prev.includes(marketplace) ? prev.filter((m) => m !== marketplace) : [...prev, marketplace]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl">Configurar Automação</DialogTitle>
              <DialogDescription>
                Defina como o bot irá divulgar seus produtos automaticamente
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Interval Configuration */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Intervalo de Envio
            </Label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Input
                    type="number"
                    min={MIN_INTERVAL}
                    max={1440}
                    value={intervalMinutes}
                    onChange={(e) => handleIntervalChange(Number(e.target.value))}
                    onBlur={(e) => {
                      // garante mínimo ao sair do campo
                      if (Number(e.target.value) < MIN_INTERVAL) {
                        setIntervalMinutes(MIN_INTERVAL);
                      }
                    }}
                    className="pr-20 text-lg font-medium"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    minutos
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Mínimo {MIN_INTERVAL} minutos · Envios a cada {intervalMinutes} minuto{intervalMinutes > 1 ? 's' : ''} ({Math.floor(1440 / intervalMinutes)} por dia)
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIntervalMinutes(5)}
                  className={intervalMinutes === 5 ? 'border-primary' : ''}
                >
                  5min
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIntervalMinutes(15)}
                  className={intervalMinutes === 15 ? 'border-primary' : ''}
                >
                  15min
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIntervalMinutes(30)}
                  className={intervalMinutes === 30 ? 'border-primary' : ''}
                >
                  30min
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIntervalMinutes(60)}
                  className={intervalMinutes === 60 ? 'border-primary' : ''}
                >
                  1h
                </Button>
              </div>
            </div>
          </div>

          {/* Categories Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Categorias
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="all-categories"
                  checked={allCategories}
                  onCheckedChange={(checked) => {
                    setAllCategories(checked as boolean);
                    if (checked) setSelectedCategories([]);
                  }}
                />
                <Label htmlFor="all-categories" className="text-sm font-normal cursor-pointer">
                  Todas as categorias
                </Label>
              </div>
            </div>

            {!allCategories && (
              <ScrollArea className="h-32 w-full rounded-lg border p-3">
                <div className="space-y-2">
                  {availableCategories.map((category) => (
                    <div
                      key={category}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => toggleCategory(category)}
                    >
                      <Checkbox
                        id={`cat-${category}`}
                        checked={selectedCategories.includes(category)}
                        onCheckedChange={() => toggleCategory(category)}
                      />
                      <Label htmlFor={`cat-${category}`} className="flex-1 cursor-pointer font-normal">
                        {category}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {allCategories && (
              <div className="p-4 bg-muted/50 rounded-lg border-2 border-dashed">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Zap className="w-4 h-4" />
                  <span>Todas as categorias serão incluídas na automação</span>
                </div>
              </div>
            )}
          </div>

          {/* Marketplaces Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-primary" />
                Marketplaces
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="all-marketplaces"
                  checked={allMarketplaces}
                  onCheckedChange={(checked) => {
                    setAllMarketplaces(checked as boolean);
                    if (checked) setSelectedMarketplaces([]);
                  }}
                />
                <Label htmlFor="all-marketplaces" className="text-sm font-normal cursor-pointer">
                  Todos os marketplaces
                </Label>
              </div>
            </div>

            {!allMarketplaces && (
              <div className="grid grid-cols-2 gap-2">
                {availableMarketplaces.map((marketplace) => (
                  <div
                    key={marketplace}
                    className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => toggleMarketplace(marketplace)}
                  >
                    <Checkbox
                      id={`mp-${marketplace}`}
                      checked={selectedMarketplaces.includes(marketplace)}
                      onCheckedChange={() => toggleMarketplace(marketplace)}
                    />
                    <Label htmlFor={`mp-${marketplace}`} className="flex-1 cursor-pointer font-medium text-sm">
                      {marketplace}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {allMarketplaces && (
              <div className="p-4 bg-muted/50 rounded-lg border-2 border-dashed">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Zap className="w-4 h-4" />
                  <span>Todos os marketplaces serão incluídos na automação</span>
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 rounded-lg border border-violet-200 dark:border-violet-800">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 space-y-2">
                <h4 className="font-semibold text-sm">Resumo da Automação</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="w-3 h-3" />
                    A cada {intervalMinutes} min
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <Package className="w-3 h-3" />
                    {allCategories ? 'Todas categorias' : `${selectedCategories.length} categorias`}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <ShoppingBag className="w-3 h-3" />
                    {allMarketplaces ? 'Todos marketplaces' : `${selectedMarketplaces.length} marketplaces`}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  ⚡ Os produtos serão enviados em ordem sequencial, sem repetir até o final da lista
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleStart}
            className="flex-1 gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            disabled={
              intervalMinutes < MIN_INTERVAL ||
              (!allCategories && selectedCategories.length === 0) ||
              (!allMarketplaces && selectedMarketplaces.length === 0)
            }
          >
            <Zap className="w-4 h-4" />
            Iniciar Automação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}