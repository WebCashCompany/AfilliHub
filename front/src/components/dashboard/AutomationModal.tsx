// src/components/dashboard/AutomationModal.tsx - MOBILE REWORK

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
import { Bot, Clock, Zap, Package, ShoppingBag, X, Check } from 'lucide-react';

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

const QUICK_INTERVALS = [
  { label: '5min', value: 5 },
  { label: '15min', value: 15 },
  { label: '30min', value: 30 },
  { label: '1h', value: 60 },
];

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
    return Math.max(parsed, MIN_INTERVAL);
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('automation_modal_categories');
    if (saved) { try { return JSON.parse(saved); } catch { return []; } }
    return [];
  });

  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>(() => {
    const saved = localStorage.getItem('automation_modal_marketplaces');
    if (saved) { try { return JSON.parse(saved); } catch { return []; } }
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

  useEffect(() => { localStorage.setItem('automation_modal_interval', String(intervalMinutes)); }, [intervalMinutes]);
  useEffect(() => { localStorage.setItem('automation_modal_categories', JSON.stringify(selectedCategories)); }, [selectedCategories]);
  useEffect(() => { localStorage.setItem('automation_modal_marketplaces', JSON.stringify(selectedMarketplaces)); }, [selectedMarketplaces]);
  useEffect(() => { localStorage.setItem('automation_modal_all_categories', String(allCategories)); }, [allCategories]);
  useEffect(() => { localStorage.setItem('automation_modal_all_marketplaces', String(allMarketplaces)); }, [allMarketplaces]);

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
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const toggleMarketplace = (marketplace: string) => {
    setSelectedMarketplaces(prev =>
      prev.includes(marketplace) ? prev.filter(m => m !== marketplace) : [...prev, marketplace]
    );
  };

  const canStart =
    intervalMinutes >= MIN_INTERVAL &&
    (allCategories || selectedCategories.length > 0) &&
    (allMarketplaces || selectedMarketplaces.length > 0);

  const perDay = Math.floor(1440 / intervalMinutes);

  // Detect mobile via window width to avoid rendering Dialog on mobile at all
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <>
      {/* ════════════════════════════════════════ */}
      {/* DESKTOP (md+) — original layout         */}
      {/* ════════════════════════════════════════ */}
      <Dialog open={open && !isMobile} onOpenChange={onClose}>
        <DialogContent className="flex flex-col max-w-2xl">
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
            {/* Interval */}
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
                      onChange={e => handleIntervalChange(Number(e.target.value))}
                      onBlur={e => { if (Number(e.target.value) < MIN_INTERVAL) setIntervalMinutes(MIN_INTERVAL); }}
                      className="pr-20 text-lg font-medium"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">minutos</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Mínimo {MIN_INTERVAL} minutos · Envios a cada {intervalMinutes} minuto{intervalMinutes > 1 ? 's' : ''} ({perDay} por dia)
                  </p>
                </div>
                <div className="flex gap-2">
                  {QUICK_INTERVALS.map(qi => (
                    <Button
                      key={qi.value}
                      variant="outline"
                      size="sm"
                      onClick={() => setIntervalMinutes(qi.value)}
                      className={intervalMinutes === qi.value ? 'border-primary' : ''}
                    >
                      {qi.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  Categorias
                </Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="all-categories" checked={allCategories} onCheckedChange={checked => { setAllCategories(checked as boolean); if (checked) setSelectedCategories([]); }} />
                  <Label htmlFor="all-categories" className="text-sm font-normal cursor-pointer">Todas as categorias</Label>
                </div>
              </div>
              {!allCategories && (
                <ScrollArea className="h-32 w-full rounded-lg border p-3">
                  <div className="space-y-2">
                    {availableCategories.map(category => (
                      <div key={category} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => toggleCategory(category)}>
                        <Checkbox id={`cat-${category}`} checked={selectedCategories.includes(category)} onCheckedChange={() => toggleCategory(category)} />
                        <Label htmlFor={`cat-${category}`} className="flex-1 cursor-pointer font-normal">{category}</Label>
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

            {/* Marketplaces */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                  Marketplaces
                </Label>
                <div className="flex items-center gap-2">
                  <Checkbox id="all-marketplaces" checked={allMarketplaces} onCheckedChange={checked => { setAllMarketplaces(checked as boolean); if (checked) setSelectedMarketplaces([]); }} />
                  <Label htmlFor="all-marketplaces" className="text-sm font-normal cursor-pointer">Todos os marketplaces</Label>
                </div>
              </div>
              {!allMarketplaces && (
                <div className="grid grid-cols-2 gap-2">
                  {availableMarketplaces.map(marketplace => (
                    <div key={marketplace} className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => toggleMarketplace(marketplace)}>
                      <Checkbox id={`mp-${marketplace}`} checked={selectedMarketplaces.includes(marketplace)} onCheckedChange={() => toggleMarketplace(marketplace)} />
                      <Label htmlFor={`mp-${marketplace}`} className="flex-1 cursor-pointer font-medium text-sm">{marketplace}</Label>
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
                    <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />A cada {intervalMinutes} min</Badge>
                    <Badge variant="secondary" className="gap-1"><Package className="w-3 h-3" />{allCategories ? 'Todas categorias' : `${selectedCategories.length} categorias`}</Badge>
                    <Badge variant="secondary" className="gap-1"><ShoppingBag className="w-3 h-3" />{allMarketplaces ? 'Todos marketplaces' : `${selectedMarketplaces.length} marketplaces`}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">⚡ Os produtos serão enviados em ordem sequencial, sem repetir até o final da lista</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={handleStart} className="flex-1 gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700" disabled={!canStart}>
              <Zap className="w-4 h-4" />
              Iniciar Automação
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════ */}
      {/* MOBILE — bottom sheet                   */}
      {/* ════════════════════════════════════════ */}
      {open && isMobile && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <div
            className="relative bg-background rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '92dvh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-muted-foreground/25 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-base leading-tight">Configurar Automação</h2>
                <p className="text-xs text-muted-foreground mt-0.5">O bot enviará ofertas automaticamente</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

              {/* ── Intervalo ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-violet-500" />
                  <span className="font-semibold text-sm">Intervalo de Envio</span>
                </div>

                {/* Quick picks */}
                <div className="grid grid-cols-4 gap-2">
                  {QUICK_INTERVALS.map(qi => (
                    <button
                      key={qi.value}
                      onClick={() => setIntervalMinutes(qi.value)}
                      className={`
                        py-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95
                        ${intervalMinutes === qi.value
                          ? 'bg-violet-500 text-white border-violet-500 shadow-md shadow-violet-500/30'
                          : 'bg-muted/50 border-border text-foreground'
                        }
                      `}
                    >
                      {qi.label}
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/40 border">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Personalizado</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={MIN_INTERVAL}
                        max={1440}
                        value={intervalMinutes}
                        onChange={e => handleIntervalChange(Number(e.target.value))}
                        onBlur={e => { if (Number(e.target.value) < MIN_INTERVAL) setIntervalMinutes(MIN_INTERVAL); }}
                        className="w-20 text-2xl font-bold bg-transparent border-none outline-none text-foreground"
                      />
                      <span className="text-sm text-muted-foreground">minutos</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Por dia</p>
                    <p className="text-lg font-bold text-violet-600">{perDay}x</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground px-1">
                  Mínimo {MIN_INTERVAL} minutos entre cada envio
                </p>
              </div>

              {/* ── Categorias ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-violet-500" />
                    <span className="font-semibold text-sm">Categorias</span>
                  </div>
                  <button
                    onClick={() => { setAllCategories(!allCategories); if (!allCategories) setSelectedCategories([]); }}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                      ${allCategories ? 'bg-violet-500 text-white border-violet-500' : 'bg-muted border-border'}
                    `}
                  >
                    {allCategories && <Check className="w-3 h-3" />}
                    Todas
                  </button>
                </div>

                {allCategories ? (
                  <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800">
                    <Zap className="w-4 h-4 text-violet-500 flex-shrink-0" />
                    <p className="text-sm text-violet-700 dark:text-violet-300">Todas as categorias incluídas</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableCategories.map(category => {
                      const isSelected = selectedCategories.includes(category);
                      return (
                        <button
                          key={category}
                          onClick={() => toggleCategory(category)}
                          className={`
                            flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all active:scale-95
                            ${isSelected
                              ? 'bg-violet-500 text-white border-violet-500'
                              : 'bg-muted/50 border-border'
                            }
                          `}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                          {category}
                        </button>
                      );
                    })}
                    {availableCategories.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhuma categoria disponível</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Marketplaces ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-violet-500" />
                    <span className="font-semibold text-sm">Marketplaces</span>
                  </div>
                  <button
                    onClick={() => { setAllMarketplaces(!allMarketplaces); if (!allMarketplaces) setSelectedMarketplaces([]); }}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                      ${allMarketplaces ? 'bg-violet-500 text-white border-violet-500' : 'bg-muted border-border'}
                    `}
                  >
                    {allMarketplaces && <Check className="w-3 h-3" />}
                    Todos
                  </button>
                </div>

                {allMarketplaces ? (
                  <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800">
                    <Zap className="w-4 h-4 text-violet-500 flex-shrink-0" />
                    <p className="text-sm text-violet-700 dark:text-violet-300">Todos os marketplaces incluídos</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {availableMarketplaces.map(marketplace => {
                      const isSelected = selectedMarketplaces.includes(marketplace);
                      return (
                        <button
                          key={marketplace}
                          onClick={() => toggleMarketplace(marketplace)}
                          className={`
                            flex items-center gap-2 p-3.5 rounded-2xl border transition-all active:scale-95 text-left
                            ${isSelected
                              ? 'bg-violet-500 text-white border-violet-500'
                              : 'bg-muted/50 border-border'
                            }
                          `}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-white bg-white/20' : 'border-muted-foreground/40'}`}>
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="text-sm font-semibold">{marketplace}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Summary card ── */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border border-violet-200 dark:border-violet-800">
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="w-4 h-4 text-violet-600" />
                  <span className="font-semibold text-sm">Resumo</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Badge variant="secondary" className="gap-1 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-0">
                    <Clock className="w-3 h-3" />A cada {intervalMinutes} min
                  </Badge>
                  <Badge variant="secondary" className="gap-1 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-0">
                    <Package className="w-3 h-3" />{allCategories ? 'Todas categorias' : `${selectedCategories.length} categorias`}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-0">
                    <ShoppingBag className="w-3 h-3" />{allMarketplaces ? 'Todos marketplaces' : `${selectedMarketplaces.length} marketplaces`}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">⚡ Envio sequencial — sem repetir até o final da lista</p>
              </div>

              {/* Bottom padding for safe area */}
              <div className="h-2" />
            </div>

            {/* ── Sticky footer ── */}
            <div className="flex gap-3 px-5 py-4 border-t bg-background flex-shrink-0">
              <Button variant="outline" onClick={onClose} className="flex-1 h-12 rounded-2xl">
                Cancelar
              </Button>
              <Button
                onClick={handleStart}
                disabled={!canStart}
                className="flex-1 h-12 rounded-2xl gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-500/25 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                Iniciar Automação
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}