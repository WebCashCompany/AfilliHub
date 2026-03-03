import { useState, useEffect, useRef } from 'react';
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

  // ============================
  // STATE
  // ============================

  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState(true);
  const [allMarketplaces, setAllMarketplaces] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const startLockRef = useRef(false);

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  // ============================
  // EFFECTS
  // ============================

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (!open) {
      startLockRef.current = false;
      setIsStarting(false);
    }
  }, [open]);

  // ============================
  // HANDLERS
  // ============================

  const handleIntervalChange = (value: number) => {
    if (!value || isNaN(value)) return;
    setIntervalMinutes(Math.max(value, MIN_INTERVAL));
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const toggleMarketplace = (marketplace: string) => {
    setSelectedMarketplaces(prev =>
      prev.includes(marketplace)
        ? prev.filter(m => m !== marketplace)
        : [...prev, marketplace]
    );
  };

  const handleStart = () => {
    if (startLockRef.current) return;

    startLockRef.current = true;
    setIsStarting(true);

    onStart({
      intervalMinutes,
      categories: allCategories ? ['all'] : selectedCategories,
      marketplaces: allMarketplaces ? ['all'] : selectedMarketplaces,
    });

    onClose();
  };

  const canStart =
    intervalMinutes >= MIN_INTERVAL &&
    (allCategories || selectedCategories.length > 0) &&
    (allMarketplaces || selectedMarketplaces.length > 0);

  const perDay = Math.floor(1440 / intervalMinutes);

  // ============================
  // RENDER
  // ============================

  return (
    <>
      <Dialog open={open && !isMobile} onOpenChange={onClose}>
        <DialogContent className="flex flex-col max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl">
                  Configurar Automação
                </DialogTitle>
                <DialogDescription>
                  Defina como o bot irá divulgar seus produtos automaticamente
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4">

            {/* Intervalo */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Intervalo de Envio
              </Label>

              <div className="relative">
                <Input
                  type="number"
                  min={MIN_INTERVAL}
                  max={1440}
                  value={intervalMinutes}
                  onChange={e => handleIntervalChange(Number(e.target.value))}
                  className="pr-20 text-lg font-medium"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  minutos
                </span>
              </div>

              <div className="flex gap-2">
                {QUICK_INTERVALS.map(qi => (
                  <Button
                    key={qi.value}
                    size="sm"
                    variant="outline"
                    onClick={() => setIntervalMinutes(qi.value)}
                  >
                    {qi.label}
                  </Button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                {perDay} envios por dia
              </p>
            </div>

            {/* Categorias */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  Categorias
                </Label>

                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allCategories}
                    onCheckedChange={(checked) => {
                      setAllCategories(checked as boolean);
                      if (checked) setSelectedCategories([]);
                    }}
                  />
                  <span className="text-sm">Todas</span>
                </div>
              </div>

              {!allCategories && (
                <ScrollArea className="h-32 w-full rounded-lg border p-3">
                  <div className="space-y-2">
                    {availableCategories.map(category => (
                      <div
                        key={category}
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => toggleCategory(category)}
                      >
                        <Checkbox
                          checked={selectedCategories.includes(category)}
                        />
                        <span className="text-sm">{category}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Marketplaces */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                  Marketplaces
                </Label>

                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allMarketplaces}
                    onCheckedChange={(checked) => {
                      setAllMarketplaces(checked as boolean);
                      if (checked) setSelectedMarketplaces([]);
                    }}
                  />
                  <span className="text-sm">Todos</span>
                </div>
              </div>

              {!allMarketplaces && (
                <div className="grid grid-cols-2 gap-2">
                  {availableMarketplaces.map(marketplace => (
                    <div
                      key={marketplace}
                      className="flex items-center gap-2 border rounded-lg p-2 cursor-pointer"
                      onClick={() => toggleMarketplace(marketplace)}
                    >
                      <Checkbox
                        checked={selectedMarketplaces.includes(marketplace)}
                      />
                      <span className="text-sm">{marketplace}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resumo  */}
            <div className="p-4 bg-muted/40 rounded-lg border">
              <div className="flex flex-wrap gap-2">
                <Badge>A cada {intervalMinutes} min</Badge>
                <Badge>
                  {allCategories ? 'Todas categorias' : `${selectedCategories.length} categorias`}
                </Badge>
                <Badge>
                  {allMarketplaces ? 'Todos marketplaces' : `${selectedMarketplaces.length} marketplaces`}
                </Badge>
              </div>
            </div>

          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>

            <Button
              onClick={handleStart}
              disabled={!canStart || isStarting}
              className="flex-1 gap-2"
            >
              <Zap className="w-4 h-4" />
              {isStarting ? 'Iniciando...' : 'Iniciar Automação'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
