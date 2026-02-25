// src/pages/DistributionPage.tsx - INTEGRADO COM MODAL COMPLETO

import { useState, useMemo, useEffect, useRef } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { AutomationModal } from '@/components/dashboard/AutomationModal';
import { AutomationTimer } from '@/components/dashboard/AutomationTimer';
import { WhatsAppSettingsModal } from '@/components/modals/WhatsAppSettingsModal';
import {
  Send, MessageCircle, Search, CheckCircle, Eye, Copy,
  Smartphone, Zap, Bot, Settings, Loader2, CalendarDays,
  Filter, Tag, ArrowUpDown, ArrowUp, ArrowDown, X,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Product } from '@/lib/mockData';
import { whatsappService, type WhatsAppGroup } from '@/api/services/whatsapp.service';
import { useWhatsApp } from '@/contexts/WhatsAppContext';

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

export function DistributionPage() {
  const { products } = useDashboard();
  const { toast } = useToast();
  const { getActiveSession, currentSessionId } = useWhatsApp();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // ── Filtros ──────────────────────────────────────────────
  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ── Canal / envio ─────────────────────────────────────────
  const [whatsappEnabled, setWhatsappEnabled] = useState(() => {
    const saved = localStorage.getItem('distribution_whatsapp_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const [telegramEnabled, setTelegramEnabled] = useState(() => {
    const saved = localStorage.getItem('distribution_telegram_enabled');
    return saved !== null ? saved === 'true' : false;
  });

  const [customMessage, setCustomMessage] = useState(() => {
    return localStorage.getItem('distribution_custom_message') || '';
  });

  const [sending, setSending] = useState(false);

  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[]>(() => {
    const saved = localStorage.getItem('distribution_whatsapp_groups');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return [];
  });

  const [showWhatsAppSettings, setShowWhatsAppSettings] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);

  const [automationActive, setAutomationActive] = useState(() => {
    return localStorage.getItem('distribution_automation_active') === 'true';
  });

  const [automationPaused, setAutomationPaused] = useState(() => {
    return localStorage.getItem('distribution_automation_paused') === 'true';
  });

  const [automationConfig, setAutomationConfig] = useState<AutomationConfig | null>(() => {
    const saved = localStorage.getItem('distribution_automation_config');
    if (saved) { try { return JSON.parse(saved); } catch (e) { console.error(e); } }
    return null;
  });

  const [currentProductIndex, setCurrentProductIndex] = useState(() => {
    const saved = localStorage.getItem('automation_current_index');
    return saved ? parseInt(saved) : 0;
  });

  const [totalSent, setTotalSent] = useState(() => {
    const saved = localStorage.getItem('automation_total_sent');
    return saved ? parseInt(saved) : 0;
  });

  const sendingRef = useRef(false);
  const [isAutoSending, setIsAutoSending] = useState(false);

  // ── Persistência ──────────────────────────────────────────
  useEffect(() => { localStorage.setItem('distribution_whatsapp_enabled', String(whatsappEnabled)); }, [whatsappEnabled]);
  useEffect(() => { localStorage.setItem('distribution_telegram_enabled', String(telegramEnabled)); }, [telegramEnabled]);
  useEffect(() => { localStorage.setItem('distribution_custom_message', customMessage); }, [customMessage]);
  useEffect(() => { localStorage.setItem('distribution_whatsapp_groups', JSON.stringify(whatsappGroups)); }, [whatsappGroups]);
  useEffect(() => { localStorage.setItem('distribution_automation_active', String(automationActive)); }, [automationActive]);
  useEffect(() => { localStorage.setItem('distribution_automation_paused', String(automationPaused)); }, [automationPaused]);
  useEffect(() => {
    if (automationConfig) {
      localStorage.setItem('distribution_automation_config', JSON.stringify(automationConfig));
    } else {
      localStorage.removeItem('distribution_automation_config');
    }
  }, [automationConfig]);
  useEffect(() => { localStorage.setItem('automation_current_index', String(currentProductIndex)); }, [currentProductIndex]);
  useEffect(() => { localStorage.setItem('automation_total_sent', String(totalSent)); }, [totalSent]);

  // ── Dados ─────────────────────────────────────────────────
  const activeProducts = products.filter(p => p.status === 'active' || p.status === 'protected');

  const availableCategories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  const availableMarketplaces = useMemo(() => {
    const mps = new Set(products.map(p => p.marketplace).filter(Boolean));
    return Array.from(mps).sort();
  }, [products]);

  // ── Lógica de data ────────────────────────────────────────
  const getActiveDateRange = (): { from: Date | null; to: Date | null } => {
    const now = new Date();
    switch (quickFilter) {
      case 'today':    return { from: startOfDay(now), to: endOfDay(now) };
      case 'yesterday':return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case 'last7':   return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case 'last30':  return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
      default:
        if (dateRange?.from) {
          return {
            from: startOfDay(dateRange.from),
            to: dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from),
          };
        }
        return { from: null, to: null };
    }
  };

  const calendarLabel = useMemo(() => {
    if (quickFilter !== 'all') return null;
    if (!dateRange?.from) return 'Selecionar período';
    if (!dateRange.to || dateRange.from.toDateString() === dateRange.to.toDateString()) {
      return format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR });
    }
    return `${format(dateRange.from, 'dd/MM/yy', { locale: ptBR })} → ${format(dateRange.to, 'dd/MM/yy', { locale: ptBR })}`;
  }, [quickFilter, dateRange]);

  const isDateFilterActive = quickFilter !== 'all' || !!dateRange?.from;

  const clearDateFilter = () => {
    setQuickFilter('all');
    setDateRange(undefined);
  };

  // ── Produtos filtrados ────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const { from, to } = getActiveDateRange();

    let result = activeProducts.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesMarketplace = marketplaceFilter === 'all' || p.marketplace === marketplaceFilter;
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;

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

    return result.slice(0, 50);
  }, [activeProducts, search, marketplaceFilter, categoryFilter, sortField, sortDirection, quickFilter, dateRange]);

  const selectedProducts = products.filter(p => selectedIds.includes(p.id));

  const getEligibleProducts = () => {
    if (!automationConfig) return [];
    let eligible = activeProducts;
    if (!automationConfig.categories.includes('all')) {
      eligible = eligible.filter(p => automationConfig.categories.includes(p.category));
    }
    if (!automationConfig.marketplaces.includes('all')) {
      eligible = eligible.filter(p => automationConfig.marketplaces.includes(p.marketplace));
    }
    return eligible;
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleGroupsSaved = (groups: WhatsAppGroup[]) => setWhatsappGroups(groups);

  const generateMessagePreview = (product: Product) => {
    const currentPriceCents = getCurrentPrice(product);
    const oldPriceCents = getOldPrice(product);
    const discount = getDiscount(product);
    const message = customMessage || `🔥 *OFERTA IMPERDÍVEL!* 🔥`;
    const link = (product as any).link_afiliado || product.affiliateLink || 'Link indisponível';
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
    if (!whatsappEnabled && !telegramEnabled) {
      toast({ title: 'Selecione um canal', description: 'Ative pelo menos WhatsApp ou Telegram.', variant: 'destructive' });
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
            nome: p.name,
            mensagem: generateMessagePreview(p),
            imagem: p.image,
            link: p.affiliateLink || (p as any).link_afiliado || 'Link indisponível',
          }));
          await whatsappService.sendOffers({ sessionId: currentSessionId, grupoId: group.id, ofertas });
        }
      }
      toast({ title: 'Ofertas enviadas!', description: `${selectedIds.length} ofertas enviadas para ${whatsappGroups.length} grupo${whatsappGroups.length > 1 ? 's' : ''}.` });
      setSelectedIds([]);
    } catch (error: any) {
      toast({ title: 'Erro ao enviar', description: error.message || 'Não foi possível enviar as ofertas.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const sendNextProduct = async () => {
    if (sendingRef.current || automationPaused || !automationActive) return;
    const eligibleProducts = getEligibleProducts();
    if (eligibleProducts.length === 0 || !currentSessionId || whatsappGroups.length === 0) return;
    sendingRef.current = true;
    setIsAutoSending(true);
    try {
      const productToSend = eligibleProducts[currentProductIndex];
      for (const group of whatsappGroups) {
        await whatsappService.sendOffers({
          sessionId: currentSessionId,
          grupoId: group.id,
          ofertas: [{ nome: productToSend.name, mensagem: generateMessagePreview(productToSend), imagem: productToSend.image, link: productToSend.affiliateLink || (productToSend as any).link_afiliado || 'Link indisponível' }],
        });
      }
      setTotalSent(prev => prev + 1);
      toast({ title: '✅ Oferta enviada pela automação', description: `${productToSend.name} enviado para ${whatsappGroups.length} grupo${whatsappGroups.length > 1 ? 's' : ''}` });
      setCurrentProductIndex(prevIndex => (prevIndex + 1) % eligibleProducts.length);
    } catch (error: any) {
      toast({ title: 'Erro na automação', description: error.message || 'Não foi possível enviar a oferta.', variant: 'destructive' });
    } finally {
      sendingRef.current = false;
      setIsAutoSending(false);
    }
  };

  const handleStartAutomation = (config: AutomationConfig) => {
    setAutomationConfig(config);
    setAutomationActive(true);
    setAutomationPaused(false);
    setCurrentProductIndex(0);
    toast({ title: 'Automação iniciada!', description: `Bot enviará ofertas a cada ${config.intervalMinutes} minutos.` });
  };

  const handlePauseAutomation = () => {
    setAutomationPaused(true);
    toast({ title: 'Automação pausada', description: 'O bot foi pausado e aguarda retomada.' });
  };

  const handleResumeAutomation = () => {
    setAutomationPaused(false);
    toast({ title: 'Automação retomada', description: 'O bot voltou a enviar ofertas automaticamente.' });
  };

  const handleCancelAutomation = () => {
    setAutomationActive(false);
    setAutomationPaused(false);
    setAutomationConfig(null);
    setCurrentProductIndex(0);
    setTotalSent(0);
    ['distribution_automation_active', 'distribution_automation_paused', 'distribution_automation_config',
      'automation_timer_time_left', 'automation_timer_total_cycles', 'automation_current_index', 'automation_total_sent']
      .forEach(k => localStorage.removeItem(k));
    toast({ title: 'Automação cancelada', description: 'O bot foi desativado com sucesso.', variant: 'destructive' });
  };

  const activeSession = getActiveSession();
  const botConnected = activeSession?.conectado || false;

  // badges ativos
  const hasActiveFilters = marketplaceFilter !== 'all' || categoryFilter !== 'all' || !!sortField || isDateFilterActive;

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hub de Divulgação</h1>
          <p className="text-muted-foreground">Selecione produtos e compartilhe via bot nos seus canais</p>
        </div>
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowAutomationModal(true)}
                  disabled={!botConnected || automationActive}
                  className="h-10 w-10 relative group hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all"
                >
                  <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform" />
                  {automationActive && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Configurar automação</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {botConnected && (
            <Badge variant="outline" className="gap-2 px-3 py-1.5 border-status-active text-status-active">
              <CheckCircle className="w-4 h-4" />
              Bot Conectado
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
          onTimerComplete={sendNextProduct}
          onSendNow={sendNextProduct}
          totalSent={totalSent}
          isSending={isAutoSending}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Painel esquerdo ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Selecionar Ofertas
            </CardTitle>
            <CardDescription>Escolha os produtos que deseja divulgar</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* ── FILTROS ── */}
            <div className="space-y-3 pb-2 border-b">
              {/* Linha 1: busca + marketplace + categoria + ordenação */}
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produtos..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10 h-9"
                  />
                </div>

                <Select value={marketplaceFilter} onValueChange={v => setMarketplaceFilter(v)}>
                  <SelectTrigger className="w-44 h-9">
                    <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Marketplace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                    <SelectItem value="amazon">Amazon</SelectItem>
                    <SelectItem value="shopee">Shopee</SelectItem>
                    <SelectItem value="magalu">Magalu</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v)}>
                  <SelectTrigger className="w-44 h-9">
                    <Tag className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {availableCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={sortField ? `${sortField}_${sortDirection}` : 'none'}
                  onValueChange={v => {
                    if (v === 'none') { setSortField(null); return; }
                    const [f, d] = v.split('_') as [SortField, SortDirection];
                    setSortField(f); setSortDirection(d);
                  }}
                >
                  <SelectTrigger className="w-48 h-9">
                    <div className="flex items-center gap-1.5">
                      {!sortField && <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />}
                      {sortField === 'price' && sortDirection === 'asc' && <ArrowUp className="w-3.5 h-3.5 text-primary" />}
                      {sortField === 'price' && sortDirection === 'desc' && <ArrowDown className="w-3.5 h-3.5 text-primary" />}
                      {sortField === 'discount' && sortDirection === 'asc' && <ArrowUp className="w-3.5 h-3.5 text-primary" />}
                      {sortField === 'discount' && sortDirection === 'desc' && <ArrowDown className="w-3.5 h-3.5 text-primary" />}
                      <SelectValue placeholder="Ordenar por" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none"><span className="flex items-center gap-2"><ArrowUpDown className="w-4 h-4 text-muted-foreground" />Sem ordenação</span></SelectItem>
                    <SelectItem value="price_asc"><span className="flex items-center gap-2"><ArrowUp className="w-4 h-4 text-green-600" />Menor preço</span></SelectItem>
                    <SelectItem value="price_desc"><span className="flex items-center gap-2"><ArrowDown className="w-4 h-4 text-green-600" />Maior preço</span></SelectItem>
                    <SelectItem value="discount_desc"><span className="flex items-center gap-2"><ArrowDown className="w-4 h-4 text-orange-500" />Maior desconto</span></SelectItem>
                    <SelectItem value="discount_asc"><span className="flex items-center gap-2"><ArrowUp className="w-4 h-4 text-orange-500" />Menor desconto</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Linha 2: filtros de data */}
              <div className="flex gap-2 flex-wrap items-center">
                {(['all', 'today', 'yesterday', 'last7', 'last30'] as QuickFilter[]).map(q => (
                  <Button
                    key={q}
                    variant={quickFilter === q ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs font-medium"
                    onClick={() => { setQuickFilter(q); setDateRange(undefined); }}
                  >
                    {quickFilterLabels[q]}
                  </Button>
                ))}

                <div className="h-5 w-px bg-border mx-0.5" />

                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={quickFilter === 'all' && dateRange?.from ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 gap-2 text-xs font-medium min-w-[150px] justify-start"
                    >
                      <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{calendarLabel || 'Período personalizado'}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                    <div className="p-3 border-b">
                      <p className="text-sm font-medium">Selecionar período</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Clique em duas datas para definir o intervalo</p>
                    </div>
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={range => {
                        setDateRange(range);
                        setQuickFilter('all');
                        if (range?.from && range?.to) setCalendarOpen(false);
                      }}
                      locale={ptBR}
                      numberOfMonths={2}
                      disabled={{ after: new Date() }}
                      initialFocus
                    />
                    {dateRange?.from && (
                      <div className="p-3 border-t flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })}
                          {dateRange.to && ` → ${format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`}
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDateRange(undefined); }}>
                          Limpar
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Badges de filtros ativos */}
              {hasActiveFilters && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {marketplaceFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => setMarketplaceFilter('all')}>
                      <Filter className="w-3 h-3" />{marketplaceFilter}<X className="w-3 h-3 ml-0.5" />
                    </Badge>
                  )}
                  {categoryFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => setCategoryFilter('all')}>
                      <Tag className="w-3 h-3" />{categoryFilter}<X className="w-3 h-3 ml-0.5" />
                    </Badge>
                  )}
                  {sortField && (
                    <Badge variant="secondary" className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => setSortField(null)}>
                      {sortField === 'price' && sortDirection === 'asc' && <><ArrowUp className="w-3 h-3" /> Menor preço</>}
                      {sortField === 'price' && sortDirection === 'desc' && <><ArrowDown className="w-3 h-3" /> Maior preço</>}
                      {sortField === 'discount' && sortDirection === 'desc' && <><ArrowDown className="w-3 h-3" /> Maior desconto</>}
                      {sortField === 'discount' && sortDirection === 'asc' && <><ArrowUp className="w-3 h-3" /> Menor desconto</>}
                      <X className="w-3 h-3 ml-0.5" />
                    </Badge>
                  )}
                  {isDateFilterActive && (
                    <Badge variant="secondary" className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={clearDateFilter}>
                      <CalendarDays className="w-3 h-3" />
                      {quickFilter !== 'all' ? quickFilterLabels[quickFilter] : calendarLabel}
                      <X className="w-3 h-3 ml-0.5" />
                    </Badge>
                  )}
                </div>
              )}

              {/* Contagem */}
              <p className="text-xs text-muted-foreground">
                {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* ── LISTA DE PRODUTOS ── */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum produto encontrado para os filtros selecionados.</p>
                </div>
              ) : (
                filteredProducts.map(product => {
                  const currentPriceCents = getCurrentPrice(product);
                  const oldPriceCents = getOldPrice(product);
                  const discount = getDiscount(product);
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer ${
                        selectedIds.includes(product.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                      onClick={() => handleSelect(product.id)}
                    >
                      <Checkbox
                        checked={selectedIds.includes(product.id)}
                        onCheckedChange={() => handleSelect(product.id)}
                      />
                      <img
                        src={(product as any).imagem || product.image}
                        alt={(product as any).nome || product.name}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{(product as any).nome || product.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <MarketplaceBadge marketplace={product.marketplace} size="sm" showLabel={false} />
                          <div className="flex items-center gap-2">
                            {oldPriceCents > 0 && oldPriceCents > currentPriceCents && (
                              <span className="text-xs line-through text-muted-foreground">{formatCurrency(oldPriceCents)}</span>
                            )}
                            <span className="text-sm text-status-active font-medium">{formatCurrency(currentPriceCents)}</span>
                          </div>
                          {discount > 0 && (
                            <Badge variant="secondary" className="text-xs">-{discount}%</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                <span className="font-medium">{selectedIds.length} produto{selectedIds.length !== 1 ? 's' : ''} selecionado{selectedIds.length !== 1 ? 's' : ''}</span>
                <Button variant="ghost" onClick={() => setSelectedIds([])}>Limpar seleção</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Painel direito ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Conexão com Bot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!botConnected ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <MessageCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Conecte o DivulgaLinks para automatizar seus envios</p>
                  <Button onClick={() => setShowWhatsAppSettings(true)} className="w-full gap-2">
                    <Zap className="w-4 h-4" />
                    Conectar DivulgaLinks
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-status-active/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-status-active" />
                      <span className="font-medium">DivulgaLinks</span>
                    </div>
                    <Badge variant="outline">Ativo</Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-status-active/10 flex items-center justify-center">
                          <Smartphone className="w-5 h-5 text-status-active" />
                        </div>
                        <div>
                          <p className="font-medium">WhatsApp</p>
                          <p className="text-xs text-muted-foreground">
                            {whatsappGroups.length} grupo{whatsappGroups.length !== 1 ? 's' : ''} conectado{whatsappGroups.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setShowWhatsAppSettings(true)}>
                          <Settings className="w-4 h-4" />
                        </Button>
                        <Switch checked={whatsappEnabled} onCheckedChange={setWhatsappEnabled} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg opacity-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Send className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Telegram</p>
                          <p className="text-xs text-muted-foreground">Em breve</p>
                        </div>
                      </div>
                      <Switch checked={telegramEnabled} onCheckedChange={setTelegramEnabled} disabled />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                Preview da Mensagem
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagem personalizada (opcional)</Label>
                <Textarea
                  placeholder="🔥 *OFERTA IMPERDÍVEL!*"
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                  rows={2}
                />
              </div>

              {selectedProducts.length > 0 && (
                <div className="space-y-3">
                  {selectedProducts.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {selectedProducts.map((p, idx) => (
                        <button
                          key={p.id}
                          onClick={() => document.getElementById(`preview-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 transition-colors"
                        >
                          Produto {idx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="max-h-[500px] overflow-y-auto space-y-4 pr-2">
                    {selectedProducts.map((product, idx) => (
                      <div key={product.id} id={`preview-${idx}`} className="space-y-3">
                        <div className="relative rounded-lg overflow-hidden border">
                          <img src={product.image} alt={product.name} className="w-full h-48 object-cover" />
                          <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
                            <span className="text-xs font-medium">📸 Imagem será enviada</span>
                          </div>
                          {selectedProducts.length > 1 && (
                            <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded px-2 py-1">
                              <span className="text-xs font-bold">{idx + 1}/{selectedProducts.length}</span>
                            </div>
                          )}
                        </div>
                        <div className="p-4 bg-muted rounded-lg">
                          <pre className="text-xs whitespace-pre-wrap font-sans">{generateMessagePreview(product)}</pre>
                          <Button
                            variant="ghost" size="sm" className="mt-2 gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(generateMessagePreview(product));
                              toast({ title: 'Copiado!', description: `Mensagem do produto ${idx + 1} copiada.` });
                            }}
                          >
                            <Copy className="w-3 h-3" />Copiar
                          </Button>
                        </div>
                        {idx < selectedProducts.length - 1 && <div className="border-t pt-4" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className="w-full gap-2" size="lg"
                disabled={!botConnected || selectedIds.length === 0 || sending}
                onClick={handleSend}
              >
                {sending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                ) : (
                  <><Send className="w-4 h-4" />Enviar {selectedIds.length} Ofertas</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

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
    </div>
  );
}