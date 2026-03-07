// src/pages/DistributionPage.tsx - GRUPOS PERSISTIDOS VIA BACKEND (UserPreferencesContext)

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { formatCurrency, getCurrentPrice, getOldPrice, getDiscount } from '@/lib/priceUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { AutomationModal } from '@/components/dashboard/AutomationModal';
import { AutomationTimer } from '@/components/dashboard/AutomationTimer';
import { WhatsAppSettingsModal } from '@/components/modals/WhatsAppSettingsModal';
import {
  Send, MessageCircle, Search, CheckCircle, Eye, Copy,
  Smartphone, Zap, Bot, Settings, Loader2,
  Filter, Tag, X, SlidersHorizontal, Package,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Product } from '@/lib/mockData';
import { whatsappService, type WhatsAppGroup } from '@/api/services/whatsapp.service';
import { useWhatsApp } from '@/contexts/WhatsAppContext';
import { ENV } from '@/config/environment';
import { supabase } from '@/lib/supabase';
import { socketService } from '@/api/services/socket.service';

const API_BASE = ENV.API_BASE_URL;

interface AutomationConfig {
  intervalMinutes: number;
  categories: string[];
  marketplaces: string[];
}

type QuickFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'last30';
type SortField = 'price' | 'discount' | null;
type SortDirection = 'asc' | 'desc';

const quickFilterLabels: Record<QuickFilter, string> = {
  all: 'Qualquer data',
  today: 'Hoje',
  yesterday: 'Ontem',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
};

type MobileTab = 'ofertas' | 'canais' | 'preview';

async function callAutomationAPI(path: string, body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';

  const res = await fetch(`${API_BASE}/api/automation${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error(`[callAutomationAPI] Resposta não-JSON (${res.status}):`, text.slice(0, 200));
    throw new Error(`Erro ${res.status} em ${path}`);
  }
}

export function DistributionPage() {
  const { products } = useDashboard();
  const { toast } = useToast();
  const { getActiveSession, currentSessionId } = useWhatsApp();

  const {
    preferences,
    isLoading: prefsLoading,
    updateWhatsAppGroups,
    updateCustomMessage,
    updatePreferences,
  } = useUserPreferences();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('ofertas');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // ── Canal / envio ────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false);
  const [showWhatsAppSettings, setShowWhatsAppSettings] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);

  // ── Estado da automação ──────────────────────────────────────────────────
  const [automationActive, setAutomationActive] = useState(false);
  const [automationPaused, setAutomationPaused] = useState(false);
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig | null>(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [totalSent, setTotalSent] = useState(0);
  const [nextFireAt, setNextFireAt] = useState<number | null>(null);
  const [isAutoSending, setIsAutoSending] = useState(false);

  // ── Ref para não pedir estado da automação mais de uma vez por sessão ────
  const automationStateRequestedRef = useRef(false);

  // ── Derivados das preferências (fonte de verdade = backend) ─────────────
  const whatsappGroups: WhatsAppGroup[] = useMemo(() => {
    return (preferences?.whatsapp?.selectedGroups ?? []) as WhatsAppGroup[];
  }, [preferences?.whatsapp?.selectedGroups]);

  const whatsappEnabled: boolean = preferences?.whatsapp?.enabled ?? true;
  const customMessage: string = preferences?.customMessage ?? '';

  const activeSession = getActiveSession();
  const botConnected  = activeSession?.conectado || false;

  const setWhatsappEnabled = useCallback(async (enabled: boolean) => {
    await updatePreferences({
      whatsapp: { ...preferences!.whatsapp, enabled },
    });
  }, [updatePreferences, preferences]);

  const setCustomMessage = useCallback(async (message: string) => {
    await updateCustomMessage(message);
  }, [updateCustomMessage]);

  const handleGroupsSaved = useCallback(async (groups: WhatsAppGroup[]) => {
    const normalized = groups.map(g => ({
      id:            g.id,
      nome:          g.nome || (g as any).name || '',
      participantes: g.participantes ?? 0,
      sessionId:     currentSessionId ?? '',
    }));
    await updateWhatsAppGroups(normalized);
  }, [updateWhatsAppGroups, currentSessionId]);

  // ── Socket.IO — só pede estado da automação após bot conectar ────────────
  useEffect(() => {
    // Registra listeners sempre (independe de botConnected)
    const onState = (data: any) => {
      if (!data) return;
      setAutomationActive(!!data.active || !!data.intervalMinutes);
      setAutomationPaused(data.isPaused ?? false);
      setCurrentProductIndex(data.currentIndex ?? 0);
      setTotalSent(data.totalSent ?? 0);
      setNextFireAt(data.nextFireAt ?? null);
      if (data.intervalMinutes && !automationConfig) {
        setAutomationConfig({ intervalMinutes: data.intervalMinutes, categories: [], marketplaces: [] });
      }
    };

    const onProductSent = (data: any) => {
      setTotalSent(data.totalSent ?? 0);
      setCurrentProductIndex(data.currentIndex ?? 0);
      setNextFireAt(data.nextFireAt ?? null);
      setIsAutoSending(false);
      toast({
        title: '✅ Oferta enviada automaticamente',
        description: `${data.product?.nome || 'Produto'} enviado pelo bot`,
      });
    };

    const onError = (data: any) => {
      setIsAutoSending(false);
      toast({ title: '❌ Erro na automação', description: data.error, variant: 'destructive' });
    };

    const onCancelled = () => {
      setAutomationActive(false);
      setAutomationPaused(false);
      setAutomationConfig(null);
      setTotalSent(0);
      setCurrentProductIndex(0);
      setNextFireAt(null);
    };

    socketService.on('automation:state',        onState);
    socketService.on('automation:product-sent', onProductSent);
    socketService.on('automation:error',        onError);
    socketService.on('automation:cancelled',    onCancelled);
    socketService.on('automation:paused',       () => setAutomationPaused(true));
    socketService.on('automation:resumed',      () => setAutomationPaused(false));

    return () => {
      socketService.off('automation:state',        onState);
      socketService.off('automation:product-sent', onProductSent);
      socketService.off('automation:error',        onError);
      socketService.off('automation:cancelled',    onCancelled);
      socketService.off('automation:paused',       () => setAutomationPaused(true));
      socketService.off('automation:resumed',      () => setAutomationPaused(false));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Só pede estado da automação quando o bot estiver de fato conectado ───
  // Isso evita o erro "Sessão X não está conectada" ao recarregar a página
  useEffect(() => {
    if (!botConnected || automationStateRequestedRef.current) return;
    automationStateRequestedRef.current = true;
    console.log('🤖 Bot conectado — solicitando estado da automação');
    socketService.emit('automation:request-state', {});
  }, [botConnected]);

  // ── Dados ────────────────────────────────────────────────────────────────
  const activeProducts = products.filter(p => p.status === 'active' || p.status === 'protected');

  const availableCategories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  const availableMarketplaces = useMemo(() => {
    const mps = new Set(products.map(p => p.marketplace).filter(Boolean));
    return Array.from(mps).sort();
  }, [products]);

  const getActiveDateRange = (): { from: Date | null; to: Date | null } => {
    const now = new Date();
    switch (quickFilter) {
      case 'today':     return { from: startOfDay(now), to: endOfDay(now) };
      case 'yesterday': return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case 'last7':     return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case 'last30':    return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
      default:
        if (dateRange?.from) {
          return { from: startOfDay(dateRange.from), to: dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from) };
        }
        return { from: null, to: null };
    }
  };

  const isDateFilterActive = quickFilter !== 'all' || !!dateRange?.from;
  const clearDateFilter = () => { setQuickFilter('all'); setDateRange(undefined); };

  const filteredProducts = useMemo(() => {
    const { from, to } = getActiveDateRange();
    let result = activeProducts.filter(p => {
      const matchesSearch      = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesMarketplace = marketplaceFilter === 'all' || p.marketplace === marketplaceFilter;
      const matchesCategory    = categoryFilter === 'all' || p.category === categoryFilter;
      let matchesDate = true;
      if (from && to) {
        const rawDate = p.addedAt ?? (p as any).updatedAt ?? (p as any).updatedat ?? null;
        if (rawDate) {
          const d = new Date(rawDate);
          matchesDate = !isNaN(d.getTime()) ? d >= from && d <= to : false;
        } else {
          matchesDate = false;
        }
      }
      return matchesSearch && matchesMarketplace && matchesCategory && matchesDate;
    });

    if (sortField) {
      result = [...result].sort((a, b) => {
        const valA = sortField === 'price' ? (getCurrentPrice(a) ?? 0) : (getDiscount(a) ?? 0);
        const valB = sortField === 'price' ? (getCurrentPrice(b) ?? 0) : (getDiscount(b) ?? 0);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      });
    }

    return result;
  }, [activeProducts, search, marketplaceFilter, categoryFilter, sortField, sortDirection, quickFilter, dateRange]);

  const selectedProducts = products.filter(p => selectedIds.includes(p.id));

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const generateMessagePreview = (product: Product) => {
    const currentPriceCents = getCurrentPrice(product);
    const oldPriceCents     = getOldPrice(product);
    const discount          = getDiscount(product);
    const message = customMessage || `🔥 *PROMOFORIA ESTÁ NO AR!* 🔥`;
    const link    = (product as any).link_afiliado || product.affiliateLink || 'Link indisponível';
    return `${message}\n\n` +
      `📦 *${(product as any).nome || product.name}*\n\n` +
      `💰 De: ~${formatCurrency(oldPriceCents)}~\n` +
      `💵 Por: *${formatCurrency(currentPriceCents)}*\n` +
      `📉 Desconto: *${discount}%*\n\n` +
      `🔗 Link: ${link}`;
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) {
      toast({ title: 'Selecione produtos', description: 'Escolha pelo menos um produto para divulgar.', variant: 'destructive' });
      return;
    }
    if (!currentSessionId) {
      toast({ title: 'Conecte uma sessão', description: 'Conecte uma sessão do WhatsApp antes de enviar.', variant: 'destructive' });
      setShowWhatsAppSettings(true);
      return;
    }
    if (whatsappEnabled && whatsappGroups.length === 0) {
      toast({ title: 'Selecione grupos', description: 'Configure os grupos do WhatsApp antes de enviar.', variant: 'destructive' });
      setShowWhatsAppSettings(true);
      return;
    }
    setSending(true);
    try {
      if (whatsappEnabled) {
        for (const group of whatsappGroups) {
          const ofertas = selectedProducts.map(p => ({
            nome:     p.name,
            mensagem: generateMessagePreview(p),
            imagem:   p.image,
            link:     p.affiliateLink || (p as any).link_afiliado || 'Link indisponível',
          }));
          await whatsappService.sendOffers({ sessionId: currentSessionId, grupoId: group.id, ofertas });
        }
      }
      toast({ title: 'Ofertas enviadas!', description: `${selectedIds.length} oferta(s) enviada(s) para ${whatsappGroups.length} grupo(s).` });
      setSelectedIds([]);
    } catch (error: any) {
      toast({ title: 'Erro ao enviar', description: error.message || 'Não foi possível enviar as ofertas.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleStartAutomation = async (config: AutomationConfig) => {
    if (!currentSessionId) {
      toast({ title: 'Conecte uma sessão', description: 'WhatsApp precisa estar conectado.', variant: 'destructive' });
      return;
    }
    if (whatsappGroups.length === 0) {
      toast({ title: 'Configure grupos', description: 'Selecione os grupos antes de iniciar a automação.', variant: 'destructive' });
      return;
    }

    const eligible = (() => {
      let list = activeProducts;
      if (!config.categories.includes('all')) list = list.filter(p => config.categories.includes(p.category));
      if (!config.marketplaces.includes('all')) list = list.filter(p => config.marketplaces.includes(p.marketplace));
      return list;
    })();

    if (eligible.length === 0) {
      toast({ title: 'Sem produtos elegíveis', description: 'Nenhum produto corresponde aos filtros selecionados.', variant: 'destructive' });
      return;
    }

    const productsPayload = eligible.map(p => ({
      nome:          (p as any).nome || p.name,
      imagem:        (p as any).imagem || p.image || null,
      link_afiliado: (p as any).link_afiliado || p.affiliateLink || '',
      _mensagem:     generateMessagePreview(p),
    }));

    try {
      const result = await callAutomationAPI('/start', {
        sessionId:       currentSessionId,
        grupoIds:        whatsappGroups.map(g => g.id),
        products:        productsPayload,
        intervalMinutes: config.intervalMinutes,
      });

      if (!result.success) throw new Error(result.error);

      setAutomationConfig(config);
      setAutomationActive(true);
      setAutomationPaused(false);
      setCurrentProductIndex(0);
      setTotalSent(0);
      setNextFireAt(result.state?.nextFireAt ?? null);

      toast({ title: '🤖 Automação iniciada!', description: `Bot enviará ofertas a cada ${config.intervalMinutes} minuto(s) — mesmo com o browser fechado.` });
    } catch (error: any) {
      toast({ title: 'Erro ao iniciar automação', description: error.message, variant: 'destructive' });
    }
  };

  const handlePauseAutomation = async () => {
    await callAutomationAPI('/pause');
    setAutomationPaused(true);
    toast({ title: 'Automação pausada', description: 'O bot foi pausado.' });
  };

  const handleResumeAutomation = async () => {
    await callAutomationAPI('/resume');
    setAutomationPaused(false);
    toast({ title: 'Automação retomada', description: 'O bot voltou a enviar ofertas.' });
  };

  const handleCancelAutomation = async () => {
    await callAutomationAPI('/stop');
    setAutomationActive(false);
    setAutomationPaused(false);
    setAutomationConfig(null);
    setCurrentProductIndex(0);
    setTotalSent(0);
    setNextFireAt(null);
    toast({ title: 'Automação cancelada', description: 'O bot foi desativado.', variant: 'destructive' });
  };

  const handleSendNow = async () => {
    setIsAutoSending(true);
    try {
      await callAutomationAPI('/send-now');
    } catch (error: any) {
      setIsAutoSending(false);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const hasActiveFilters  = marketplaceFilter !== 'all' || categoryFilter !== 'all' || !!sortField || isDateFilterActive;
  const activeFilterCount = [marketplaceFilter !== 'all', categoryFilter !== 'all', !!sortField, isDateFilterActive].filter(Boolean).length;

  // ── Mobile Filter Sheet ───────────────────────────────────────────────────
  const MobileFilterSheet = () => (
    <>
      {mobileFiltersOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
      )}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out md:hidden ${mobileFiltersOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '85vh' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
        <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 40px)' }}>
          <div className="flex items-center justify-between py-3 border-b mb-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              <span className="font-semibold">Filtros & Ordenação</span>
              {activeFilterCount > 0 && (
                <Badge className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">{activeFilterCount}</Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setMobileFiltersOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2 mb-5">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Marketplace</Label>
            <div className="grid grid-cols-2 gap-2">
              {['all', ...availableMarketplaces].map(mp => (
                <button key={mp} onClick={() => setMarketplaceFilter(mp)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${marketplaceFilter === mp ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/50 border-border hover:border-muted-foreground/40'}`}>
                  {mp === 'all' ? 'Todos' : mp}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 mb-5">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Categoria</Label>
            <div className="flex flex-wrap gap-2">
              {['all', ...availableCategories].map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${categoryFilter === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 border-border hover:border-muted-foreground/40'}`}>
                  {cat === 'all' ? 'Todas' : cat}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 mb-5">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Período</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['all', 'today', 'yesterday', 'last7', 'last30'] as QuickFilter[]).map(q => (
                <button key={q} onClick={() => { setQuickFilter(q); setDateRange(undefined); }}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${quickFilter === q ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 border-border hover:border-muted-foreground/40'}`}>
                  {quickFilterLabels[q]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 sticky bottom-0 bg-background pt-3 border-t">
            <Button variant="outline" className="flex-1" onClick={() => { setMarketplaceFilter('all'); setCategoryFilter('all'); setSortField(null); clearDateFilter(); }}>
              Limpar tudo
            </Button>
            <Button className="flex-1" onClick={() => setMobileFiltersOpen(false)}>
              Ver {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  const MobileOfertasTab = () => (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 px-4 pt-4 pb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar produtos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10 rounded-xl bg-muted/50 border-transparent focus:border-primary" />
        </div>
        <Button variant="outline" size="icon" onClick={() => setMobileFiltersOpen(true)} className={`h-10 w-10 rounded-xl flex-shrink-0 relative ${hasActiveFilters ? 'border-primary bg-primary/5' : ''}`}>
          <SlidersHorizontal className={`w-4 h-4 ${hasActiveFilters ? 'text-primary' : ''}`} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">{activeFilterCount}</span>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground px-4 pb-2">
        {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
        {selectedIds.length > 0 && <span className="text-primary font-medium"> · {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}</span>}
      </p>
      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhum produto encontrado</p>
          </div>
        ) : filteredProducts.map(product => {
          const currentPriceCents = getCurrentPrice(product);
          const oldPriceCents = getOldPrice(product);
          const discount = getDiscount(product);
          const isSelected = selectedIds.includes(product.id);
          return (
            <div key={product.id} onClick={() => handleSelect(product.id)}
              className={`flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer ${isSelected ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10' : 'border-border bg-card hover:border-muted-foreground/30'}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                {isSelected && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
              </div>
              <img src={(product as any).imagem || product.image} alt={(product as any).nome || product.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-tight line-clamp-2">{(product as any).nome || product.name}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <MarketplaceBadge marketplace={product.marketplace} size="sm" showLabel={false} />
                  <span className="text-sm font-bold text-green-600">{formatCurrency(currentPriceCents)}</span>
                  {oldPriceCents > 0 && oldPriceCents > currentPriceCents && (
                    <span className="text-xs line-through text-muted-foreground">{formatCurrency(oldPriceCents)}</span>
                  )}
                  {discount > 0 && (
                    <span className="text-xs font-semibold text-orange-500 bg-orange-50 dark:bg-orange-950/30 px-1.5 py-0.5 rounded-md">-{discount}%</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <div className="sticky bottom-0 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
          <div className="flex items-center gap-3 p-3 bg-primary rounded-2xl shadow-lg shadow-primary/30">
            <div className="flex-1">
              <p className="text-primary-foreground font-semibold text-sm">{selectedIds.length} produto{selectedIds.length !== 1 ? 's' : ''} selecionado{selectedIds.length !== 1 ? 's' : ''}</p>
              <button className="text-primary-foreground/70 text-xs underline" onClick={e => { e.stopPropagation(); setSelectedIds([]); }}>Limpar seleção</button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setMobileTab('preview')} className="gap-1.5 flex-shrink-0">
              <Eye className="w-4 h-4" /> Preview
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const MobileCanaisTab = () => (
    <div className="px-4 py-4 space-y-5 overflow-y-auto">
      <div className={`flex items-center gap-3 p-4 rounded-2xl border-2 ${botConnected ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20' : 'border-border bg-muted/30'}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${botConnected ? 'bg-green-500/15' : 'bg-muted'}`}>
          {botConnected ? <CheckCircle className="w-6 h-6 text-green-600" /> : <MessageCircle className="w-6 h-6 text-muted-foreground" />}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">DivulgaLinks</p>
          <p className="text-xs text-muted-foreground">{botConnected ? 'Bot conectado e ativo' : 'Bot não conectado'}</p>
        </div>
        {botConnected ? <Badge variant="outline" className="border-green-500 text-green-600">Ativo</Badge>
          : <Button size="sm" onClick={() => setShowWhatsAppSettings(true)} className="gap-1.5 h-8"><Zap className="w-3.5 h-3.5" /> Conectar</Button>}
      </div>
      <div className="rounded-2xl border overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">WhatsApp</p>
            <p className="text-xs text-muted-foreground">
              {whatsappGroups.length > 0 ? `${whatsappGroups.length} grupo(s) configurado(s)` : 'Nenhum grupo configurado'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowWhatsAppSettings(true)}><Settings className="w-4 h-4" /></Button>
            <Switch checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${automationActive ? 'bg-violet-500/15' : 'bg-muted'}`}>
            <Bot className={`w-5 h-5 ${automationActive ? 'text-violet-600' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Automação</p>
            <p className="text-xs text-muted-foreground">
              {automationActive ? (automationPaused ? 'Pausada' : `Ativa · a cada ${automationConfig?.intervalMinutes}min`) : 'Configure o envio automático'}
            </p>
          </div>
          <Button size="sm" variant={automationActive ? 'outline' : 'default'} disabled={!botConnected} onClick={() => setShowAutomationModal(true)}
            className={`h-8 gap-1.5 ${automationActive ? 'border-violet-500 text-violet-600' : ''}`}>
            {automationActive ? <><Settings className="w-3.5 h-3.5" /> Gerenciar</> : <><Zap className="w-3.5 h-3.5" /> Ativar</>}
          </Button>
        </div>
        {automationActive && (
          <div className="px-4 pb-3 border-t bg-violet-50/50 dark:bg-violet-950/20">
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">Total enviados:</p>
              <p className="text-xs font-semibold text-violet-600">{totalSent} ofertas</p>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Mensagem personalizada</Label>
        <Textarea
          placeholder="🔥 *PROMOFORIA ESTÁ NO AR!*"
          value={customMessage}
          onChange={e => setCustomMessage(e.target.value)}
          rows={3}
          className="rounded-xl resize-none"
        />
        <p className="text-xs text-muted-foreground">Deixe em branco para usar a mensagem padrão</p>
      </div>
    </div>
  );

  const MobilePreviewTab = () => (
    <div className="flex flex-col h-full">
      {selectedProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-muted-foreground px-8 text-center">
          <Eye className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm font-medium">Nenhum produto selecionado</p>
          <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => setMobileTab('ofertas')}>
            <Package className="w-4 h-4" /> Selecionar produtos
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-medium">{selectedProducts.length} produto(s) para enviar</p>
            <button className="text-xs text-destructive" onClick={() => setSelectedIds([])}>Limpar</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {selectedProducts.map((product) => (
              <div key={product.id} className="rounded-2xl border overflow-hidden">
                <img src={product.image} alt={product.name} className="w-full h-40 object-cover" />
                <div className="p-4">
                  <pre className="text-xs whitespace-pre-wrap font-sans text-foreground/80 leading-relaxed">{generateMessagePreview(product)}</pre>
                  <Button variant="ghost" size="sm" className="mt-3 gap-1.5 h-8 text-xs"
                    onClick={() => { navigator.clipboard.writeText(generateMessagePreview(product)); toast({ title: 'Copiado!' }); }}>
                    <Copy className="w-3 h-3" /> Copiar mensagem
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pb-6 pt-2">
            <Button className="w-full gap-2 h-12 rounded-2xl text-base shadow-lg" disabled={!botConnected || sending} onClick={handleSend}>
              {sending ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</> : <><Send className="w-5 h-5" /> Enviar {selectedIds.length} oferta{selectedIds.length !== 1 ? 's' : ''}</>}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* DESKTOP */}
      <div className="hidden md:block p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Hub de Divulgação</h1>
            <p className="text-muted-foreground">Selecione produtos e compartilhe via bot nos seus canais</p>
          </div>
          <div className="flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => setShowAutomationModal(true)} disabled={!botConnected || automationActive}
                    className="h-10 w-10 relative group hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all">
                    <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform" />
                    {automationActive && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Configurar automação</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {botConnected && (
              <Badge variant="outline" className="gap-2 px-3 py-1.5 border-status-active text-status-active">
                <CheckCircle className="w-4 h-4" /> Bot Conectado
              </Badge>
            )}
          </div>
        </div>

        {automationActive && automationConfig && (
          <AutomationTimer
            intervalMinutes={automationConfig.intervalMinutes}
            isPaused={automationPaused}
            onPause={handlePauseAutomation}
            onResume={handleResumeAutomation}
            onCancel={handleCancelAutomation}
            onTimerComplete={() => {}}
            onSendNow={handleSendNow}
            totalSent={totalSent}
            isSending={isAutoSending}
            nextFireAt={nextFireAt ?? undefined}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-primary" /> Selecionar Ofertas</CardTitle>
              <CardDescription>Escolha os produtos que deseja divulgar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 pb-2 border-b">
                <div className="flex gap-2 flex-wrap items-center">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar produtos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
                  </div>
                  <Select value={marketplaceFilter} onValueChange={v => setMarketplaceFilter(v)}>
                    <SelectTrigger className="w-44 h-9"><Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Marketplace" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {availableMarketplaces.map(mp => <SelectItem key={mp} value={mp}>{mp}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v)}>
                    <SelectTrigger className="w-44 h-9"><Tag className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {availableCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'today', 'yesterday', 'last7', 'last30'] as QuickFilter[]).map(q => (
                    <Button key={q} variant={quickFilter === q ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => { setQuickFilter(q); setDateRange(undefined); }}>
                      {quickFilterLabels[q]}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{filteredProducts.length} produto(s) encontrado(s)</p>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredProducts.map(product => {
                  const currentPriceCents = getCurrentPrice(product);
                  const oldPriceCents = getOldPrice(product);
                  const discount = getDiscount(product);
                  return (
                    <div key={product.id}
                      className={`flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer ${selectedIds.includes(product.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}
                      onClick={() => handleSelect(product.id)}>
                      <Checkbox checked={selectedIds.includes(product.id)} onCheckedChange={() => handleSelect(product.id)} />
                      <img src={(product as any).imagem || product.image} alt={(product as any).nome || product.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{(product as any).nome || product.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <MarketplaceBadge marketplace={product.marketplace} size="sm" showLabel={false} />
                          {oldPriceCents > 0 && oldPriceCents > currentPriceCents && (
                            <span className="text-xs line-through text-muted-foreground">{formatCurrency(oldPriceCents)}</span>
                          )}
                          <span className="text-sm text-status-active font-medium">{formatCurrency(currentPriceCents)}</span>
                          {discount > 0 && <Badge variant="secondary" className="text-xs">-{discount}%</Badge>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedIds.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                  <span className="font-medium">{selectedIds.length} produto(s) selecionado(s)</span>
                  <Button variant="ghost" onClick={() => setSelectedIds([])}>Limpar seleção</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /> Conexão com Bot</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {!botConnected ? (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <MessageCircle className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">Conecte o DivulgaLinks para automatizar seus envios</p>
                    <Button onClick={() => setShowWhatsAppSettings(true)} className="w-full gap-2"><Zap className="w-4 h-4" /> Conectar DivulgaLinks</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-status-active/10 rounded-lg">
                      <div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-status-active" /><span className="font-medium">DivulgaLinks</span></div>
                      <Badge variant="outline">Ativo</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-status-active/10 flex items-center justify-center"><Smartphone className="w-5 h-5 text-status-active" /></div>
                        <div>
                          <p className="font-medium">WhatsApp</p>
                          <p className="text-xs text-muted-foreground">{whatsappGroups.length} grupo(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setShowWhatsAppSettings(true)}><Settings className="w-4 h-4" /></Button>
                        <Switch checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-primary" /> Preview da Mensagem</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mensagem personalizada (opcional)</Label>
                  <Textarea
                    placeholder="🔥 *PROMOFORIA ESTÁ NO AR!*"
                    value={customMessage}
                    onChange={e => setCustomMessage(e.target.value)}
                    rows={2}
                  />
                </div>
                {selectedProducts.length > 0 && (
                  <div className="max-h-[400px] overflow-y-auto space-y-4">
                    {selectedProducts.map((product) => (
                      <div key={product.id} className="space-y-3">
                        <div className="relative rounded-lg overflow-hidden border">
                          <img src={product.image} alt={product.name} className="w-full h-48 object-cover" />
                        </div>
                        <div className="p-4 bg-muted rounded-lg">
                          <pre className="text-xs whitespace-pre-wrap font-sans">{generateMessagePreview(product)}</pre>
                          <Button variant="ghost" size="sm" className="mt-2 gap-1"
                            onClick={() => { navigator.clipboard.writeText(generateMessagePreview(product)); toast({ title: 'Copiado!' }); }}>
                            <Copy className="w-3 h-3" /> Copiar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button className="w-full gap-2" size="lg" disabled={!botConnected || selectedIds.length === 0 || sending} onClick={handleSend}>
                  {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4" /> Enviar {selectedIds.length} Oferta(s)</>}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* MOBILE */}
      <div className="flex flex-col h-[100dvh] md:hidden bg-background">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b bg-background/95 backdrop-blur-md sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-bold leading-tight">Hub de Divulgação</h1>
            <p className="text-xs text-muted-foreground">Compartilhe ofertas via bot</p>
          </div>
          <div className="flex items-center gap-2">
            {botConnected && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-green-500/40 bg-green-50/50 dark:bg-green-950/20">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">Online</span>
              </div>
            )}
            <Button variant="outline" size="icon" className={`h-9 w-9 rounded-xl relative ${automationActive ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20' : ''}`}
              onClick={() => setShowAutomationModal(true)} disabled={!botConnected && !automationActive}>
              <Bot className={`w-4 h-4 ${automationActive ? 'text-violet-600' : ''}`} />
              {automationActive && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background animate-pulse" />}
            </Button>
          </div>
        </div>

        {automationActive && automationConfig && (
          <div className="px-4 pt-3">
            <AutomationTimer
              intervalMinutes={automationConfig.intervalMinutes}
              isPaused={automationPaused}
              onPause={handlePauseAutomation}
              onResume={handleResumeAutomation}
              onCancel={handleCancelAutomation}
              onTimerComplete={() => {}}
              onSendNow={handleSendNow}
              totalSent={totalSent}
              isSending={isAutoSending}
              nextFireAt={nextFireAt ?? undefined}
            />
          </div>
        )}

        <div className="flex-1 overflow-hidden relative">
          {mobileTab === 'ofertas' && <MobileOfertasTab />}
          {mobileTab === 'canais'  && <MobileCanaisTab />}
          {mobileTab === 'preview' && <MobilePreviewTab />}
        </div>

        <div className="border-t bg-background/95 backdrop-blur-md">
          <div className="grid grid-cols-3 px-2 py-1">
            {[
              { id: 'ofertas' as MobileTab, label: 'Ofertas',  icon: Package,    badge: filteredProducts.length > 0 ? String(filteredProducts.length) : null },
              { id: 'canais'  as MobileTab, label: 'Canais',   icon: Smartphone, badge: botConnected ? null : '!' },
              { id: 'preview' as MobileTab, label: 'Preview',  icon: Eye,        badge: selectedIds.length > 0 ? String(selectedIds.length) : null },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = mobileTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setMobileTab(tab.id)}
                  className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all relative ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  {isActive && <div className="absolute inset-0 bg-primary/8 rounded-xl" />}
                  <div className="relative">
                    <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                    {tab.badge && (
                      <span className={`absolute -top-2 -right-2 min-w-[16px] h-4 text-[10px] font-bold rounded-full flex items-center justify-center px-1 ${tab.badge === '!' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>
                        {tab.badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] font-medium ${isActive ? 'text-primary' : ''}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <MobileFilterSheet />

      <WhatsAppSettingsModal
        open={showWhatsAppSettings}
        onClose={() => setShowWhatsAppSettings(false)}
        initialSelectedGroups={whatsappGroups}
        onSaveGroups={handleGroupsSaved}
      />
      <AutomationModal
        open={showAutomationModal}
        onClose={() => setShowAutomationModal(false)}
        onStart={handleStartAutomation}
        availableCategories={availableCategories}
        availableMarketplaces={availableMarketplaces}
      />
    </>
  );
}