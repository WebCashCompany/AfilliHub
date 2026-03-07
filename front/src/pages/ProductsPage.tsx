// src/pages/ProductsPage.tsx

import { useState, useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import {
  Search, Trash2, RefreshCw, ChevronLeft, ChevronRight, Filter, Eraser,
  AlertTriangle, Ticket, ExternalLink, Copy, Check, CalendarDays, Tag,
  TrendingDown, Package, Eye, Star, Truck, CreditCard, Store, Clock,
  Link2, ShoppingCart, ArrowUpDown, ArrowUp, ArrowDown, X,
  SlidersHorizontal, MoreVertical,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { formatNumber, Marketplace, ProductStatus } from '@/lib/mockData';
import { productsService } from '@/api/services/products.service';
import { formatCurrency, getCurrentPrice, getOldPrice, getDiscount } from '@/lib/priceUtils';
import { MobileProductCard, MobileProductDetailSheet } from './MobileProductCard';

type CleanupType = 'all' | 'marketplace' | 'old' | 'selected';
type SortField = 'price' | 'discount' | null;
type SortDirection = 'asc' | 'desc';
type QuickFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'last30';

import { ENV } from '@/config/environment';
const API_BASE_URL = ENV.API_BASE_URL;

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

// ─── Mobile Filters Sheet ─────────────────────────────────────────────────────
function MobileFiltersSheet({
  open, onClose,
  marketplaceFilter, setMarketplaceFilter,
  categoryFilter, setCategoryFilter,
  sortField, setSortField,
  sortDirection, setSortDirection,
  quickFilter, setQuickFilter,
  dateRange, setDateRange,
  availableCategories, setPage, clearDateFilter,
}: any) {
  const activeCount = [
    marketplaceFilter !== 'all',
    categoryFilter !== 'all',
    sortField !== null,
    quickFilter !== 'all' || !!dateRange?.from,
  ].filter(Boolean).length;

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
      {children}
    </p>
  );

  const OptionButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between py-3 px-4 rounded-xl text-sm font-medium border transition-all active:scale-[0.98] ${
        active ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20' : 'bg-card border-border text-foreground hover:bg-muted/50'
      }`}
    >
      <span>{children}</span>
      {active && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[88vh]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-[3px] rounded-full bg-foreground/15" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h2 className="text-base font-bold">Filtros</h2>
            {activeCount > 0 && <p className="text-xs text-muted-foreground">{activeCount} ativo{activeCount > 1 ? 's' : ''}</p>}
          </div>
          {activeCount > 0 && (
            <button onClick={() => { setMarketplaceFilter('all'); setCategoryFilter('all'); setSortField(null); clearDateFilter(); setPage(1); onClose(false); }}
              className="text-xs font-semibold text-rose-500 px-3 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors">
              Limpar tudo
            </button>
          )}
        </div>
        <ScrollArea className="max-h-[calc(88vh-100px)]">
          <div className="px-5 py-5 space-y-6 pb-10">
            <div>
              <SectionLabel>Marketplace</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {[{ value: 'all', label: 'Todos' }, { value: 'mercadolivre', label: 'Mercado Livre' }, { value: 'amazon', label: 'Amazon' }, { value: 'shopee', label: 'Shopee' }, { value: 'magalu', label: 'Magalu' }].map(opt => (
                  <OptionButton key={opt.value} active={marketplaceFilter === opt.value} onClick={() => { setMarketplaceFilter(opt.value); setPage(1); }}>{opt.label}</OptionButton>
                ))}
              </div>
            </div>
            {availableCategories.length > 0 && (
              <div>
                <SectionLabel>Categoria</SectionLabel>
                <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-12 rounded-xl border-border"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {availableCategories.map((cat: string) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <SectionLabel>Ordenar por</SectionLabel>
              <div className="space-y-2">
                {[
                  { field: null, dir: 'asc', label: 'Sem ordenação', sub: 'Ordem padrão' },
                  { field: 'price', dir: 'asc', label: 'Menor preço', sub: 'Mais barato primeiro' },
                  { field: 'price', dir: 'desc', label: 'Maior preço', sub: 'Mais caro primeiro' },
                  { field: 'discount', dir: 'desc', label: 'Maior desconto', sub: 'Mais % de desconto' },
                  { field: 'discount', dir: 'asc', label: 'Menor desconto', sub: 'Menos % de desconto' },
                ].map((opt, i) => {
                  const isActive = sortField === opt.field && (opt.field === null || sortDirection === opt.dir);
                  return (
                    <button key={i} onClick={() => { setSortField(opt.field as SortField); setSortDirection(opt.dir as SortDirection); setPage(1); }}
                      className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border transition-all text-left active:scale-[0.98] ${isActive ? 'bg-primary/8 border-primary/30 text-primary dark:bg-primary/15' : 'bg-card border-border hover:bg-muted/50'}`}>
                      <div>
                        <p className={`text-sm font-semibold ${isActive ? 'text-primary' : ''}`}>{opt.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{opt.sub}</p>
                      </div>
                      {isActive && <Check className="w-4 h-4 text-primary flex-shrink-0" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <SectionLabel>Período</SectionLabel>
              <div className="space-y-2">
                {(['all', 'today', 'yesterday', 'last7', 'last30'] as QuickFilter[]).map(q => {
                  const labels: Record<QuickFilter, { label: string; sub: string }> = {
                    all: { label: 'Qualquer data', sub: 'Sem filtro de data' }, today: { label: 'Hoje', sub: 'Produtos de hoje' },
                    yesterday: { label: 'Ontem', sub: 'Produtos de ontem' }, last7: { label: 'Últimos 7 dias', sub: 'Última semana' }, last30: { label: 'Últimos 30 dias', sub: 'Último mês' },
                  };
                  const isActive = quickFilter === q && !dateRange?.from;
                  return (
                    <button key={q} onClick={() => { setQuickFilter(q); setDateRange(undefined); setPage(1); }}
                      className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border transition-all text-left active:scale-[0.98] ${isActive ? 'bg-primary/8 border-primary/30 dark:bg-primary/15' : 'bg-card border-border hover:bg-muted/50'}`}>
                      <div>
                        <p className={`text-sm font-semibold ${isActive ? 'text-primary' : ''}`}>{labels[q].label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{labels[q].sub}</p>
                      </div>
                      {isActive && <Check className="w-4 h-4 text-primary flex-shrink-0" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={() => onClose(false)}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md shadow-primary/20 active:scale-[0.98] transition-transform">
              Aplicar filtros
            </button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function ProductsPage() {
  const { products, refreshProducts, isLoading } = useDashboard();
  const { session } = useAuth();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | Marketplace>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('products');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupType, setCleanupType] = useState<CleanupType>('all');
  const [cleanupMarketplace, setCleanupMarketplace] = useState<Marketplace>('mercadolivre');
  const [cleanupDays, setCleanupDays] = useState(7);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [desktopDetailsOpen, setDesktopDetailsOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [originalProductData, setOriginalProductData] = useState<any>(null);

  const pageSize = 15;

  // ─── Helper: monta headers com Authorization quando disponível ───────────────
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { ...BASE_HEADERS };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const availableCategories = useMemo(() => {
    const cats = products.map(p => p.category || p.categoria).filter((c): c is string => !!c && c.trim() !== '');
    return Array.from(new Set(cats)).sort();
  }, [products]);

  const getActiveDateRange = (): { from: Date | null; to: Date | null } => {
    const now = new Date();
    const today = startOfDay(now);
    switch (quickFilter) {
      case 'today': return { from: today, to: endOfDay(now) };
      case 'yesterday': return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case 'last7': return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case 'last30': return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
      default:
        if (dateRange?.from) return { from: startOfDay(dateRange.from), to: dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from) };
        return { from: null, to: null };
    }
  };

  const isDateFilterActive = quickFilter !== 'all' || !!dateRange?.from;
  const quickFilterLabels: Record<QuickFilter, string> = {
    all: 'Qualquer data', today: 'Hoje', yesterday: 'Ontem', last7: 'Últimos 7 dias', last30: 'Últimos 30 dias',
  };
  const calendarLabel = useMemo(() => {
    if (quickFilter !== 'all') return null;
    if (!dateRange?.from) return 'Período personalizado';
    if (!dateRange.to || dateRange.from.toDateString() === dateRange.to.toDateString()) return format(dateRange.from, "dd/MM/yyyy", { locale: ptBR });
    return `${format(dateRange.from, "dd/MM/yy", { locale: ptBR })} → ${format(dateRange.to, "dd/MM/yy", { locale: ptBR })}`;
  }, [quickFilter, dateRange]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDirection('asc'); }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-primary" /> : <ArrowDown className="w-3.5 h-3.5 ml-1 text-primary" />;
  };

  const filteredProducts = useMemo(() => {
    const { from, to } = getActiveDateRange();
    let result = products.filter(p => {
      const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase());
      const matchesMarketplace = marketplaceFilter === 'all' || p.marketplace === marketplaceFilter;
      const productCategory = p.category || p.categoria || '';
      const matchesCategory = categoryFilter === 'all' || productCategory === categoryFilter;
      let matchesDate = true;
      if (from && to) {
        const rawDate = p.addedAt ?? null;
        if (rawDate) {
          const productDate = new Date(rawDate);
          if (!isNaN(productDate.getTime())) matchesDate = productDate >= from && productDate <= to;
          else matchesDate = false;
        } else matchesDate = false;
      }
      return matchesSearch && matchesMarketplace && matchesCategory && matchesDate;
    });
    if (sortField) {
      result = [...result].sort((a, b) => {
        let valA = 0, valB = 0;
        if (sortField === 'price') { valA = getCurrentPrice(a) ?? 0; valB = getCurrentPrice(b) ?? 0; }
        else if (sortField === 'discount') { valA = getDiscount(a) ?? 0; valB = getDiscount(b) ?? 0; }
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      });
    }
    return result;
  }, [products, search, marketplaceFilter, categoryFilter, sortField, sortDirection, quickFilter, dateRange]);

  const paginatedProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredProducts.length / pageSize);

  const handleSelectAll = () => {
    setSelectedIds(selectedIds.length === paginatedProducts.length ? [] : paginatedProducts.map(p => p.id));
  };
  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleProductClick = async (product: any) => {
    setSelectedProduct(product);
    setOriginalProductData(null);
    setCopiedLink(false);

    if (window.innerWidth < 768) {
      setMobileDetailsOpen(true);
    } else {
      setDesktopDetailsOpen(true);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${product.id}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        console.warn(`[ProductsPage] GET /api/products/${product.id} → ${response.status}`);
        setOriginalProductData(product);
        return;
      }

      const data = await response.json();
      if (data.success && data.data) setOriginalProductData(data.data);
      else setOriginalProductData(product);
    } catch (err) {
      console.warn('[ProductsPage] Erro ao buscar detalhes do produto:', err);
      setOriginalProductData(product);
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({ title: 'Link copiado!', description: 'Link de afiliado copiado para a área de transferência' });
    } catch {
      toast({ title: 'Erro ao copiar', description: 'Não foi possível copiar o link', variant: 'destructive' });
    }
  };

  // ─── CLEANUP CORRIGIDO: rotas exatas do productsService + finally garantido ──
  const handleCleanup = async () => {
    setIsCleaningUp(true);
    try {
      let deleted = 0;

      if (cleanupType === 'all') {
        // → DELETE /api/products/cleanup/all
        const res = await productsService.deleteAll();
        deleted = res.data?.deleted ?? 0;

      } else if (cleanupType === 'marketplace') {
        // → DELETE /api/products/marketplace/:key
        const mpKey = cleanupMarketplace === 'mercadolivre' ? 'ML' : cleanupMarketplace as 'ML' | 'shopee' | 'amazon' | 'magalu';
        const res = await productsService.deleteByMarketplace(mpKey);
        deleted = res.data?.deleted ?? 0;

      } else if (cleanupType === 'old') {
        // → POST /api/products/cleanup/old  { days }
        const res = await productsService.deleteOld(cleanupDays);
        deleted = res.data?.deleted ?? 0;

      } else if (cleanupType === 'selected') {
        if (selectedIds.length === 0) {
          toast({ title: 'Nenhum produto selecionado', description: 'Selecione ao menos um produto para excluir.', variant: 'destructive' });
          return;
        }
        // → POST /api/products/bulk-delete  { ids }
        const res = await productsService.bulkDelete(selectedIds);
        deleted = res.data?.deleted ?? selectedIds.length;
        setSelectedIds([]);
      }

      // Atualiza lista — wrapped para não travar se refresh falhar
      try {
        await refreshProducts();
      } catch (refreshErr) {
        console.warn('[handleCleanup] refreshProducts falhou, ignorando:', refreshErr);
      }

      toast({
        title: 'Limpeza concluída ✓',
        description: `${deleted} produto${deleted !== 1 ? 's' : ''} removido${deleted !== 1 ? 's' : ''} com sucesso.`,
      });
      setCleanupDialogOpen(false);

    } catch (err: any) {
      console.error('[handleCleanup] erro:', err);
      toast({
        title: 'Erro na limpeza',
        description: err?.message || 'Falha ao excluir produtos. Verifique o console.',
        variant: 'destructive',
      });
    } finally {
      // Garante que o spinner SEMPRE para, independente de qualquer erro
      setIsCleaningUp(false);
    }
  };

  const getCleanupTitle = () => {
    switch (cleanupType) {
      case 'all': return 'Deletar todos os produtos';
      case 'marketplace': return `Deletar produtos do ${cleanupMarketplace}`;
      case 'old': return `Deletar produtos com mais de ${cleanupDays} dias`;
      case 'selected': return `Deletar ${selectedIds.length} produtos selecionados`;
    }
  };

  const formatDate = (dateString: string | Date) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return null; }
  };

  const clearDateFilter = () => { setQuickFilter('all'); setDateRange(undefined); setPage(1); };

  const displayProduct = originalProductData || selectedProduct;
  const affiliateLink = displayProduct?.link_afiliado || displayProduct?.affiliateLink;

  const activeFiltersCount = [marketplaceFilter !== 'all', categoryFilter !== 'all', sortField !== null, isDateFilterActive].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full">

      {/* ─── DESKTOP HEADER ─── */}
      <div className="hidden md:flex p-6 justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Gerenciamento</h1>
          <p className="text-muted-foreground">{formatNumber(filteredProducts.length)} produtos encontrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshProducts} disabled={isLoading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />Atualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="destructive" className="gap-2"><Eraser className="w-4 h-4" />Limpeza</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => { setCleanupType('all'); setCleanupDialogOpen(true); }}><Trash2 className="w-4 h-4 mr-2" />Deletar todos</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setCleanupType('marketplace'); setCleanupDialogOpen(true); }}><Filter className="w-4 h-4 mr-2" />Deletar por marketplace</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setCleanupType('old'); setCleanupDialogOpen(true); }}><AlertTriangle className="w-4 h-4 mr-2" />Deletar produtos antigos</DropdownMenuItem>
              {selectedIds.length > 0 && (
                <DropdownMenuItem onClick={() => { setCleanupType('selected'); setCleanupDialogOpen(true); }}><Trash2 className="w-4 h-4 mr-2" />Deletar selecionados ({selectedIds.length})</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── MOBILE HEADER ─── */}
      <div className="md:hidden w-full">
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <div className="min-w-0 flex-1 mr-3">
            <h1 className="text-[22px] font-black tracking-tight truncate">Gerenciamento</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5 font-medium">
              {formatNumber(filteredProducts.length)} produto{filteredProducts.length !== 1 ? 's' : ''}
              {activeFiltersCount > 0 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-primary font-semibold">
                  · {activeFiltersCount} filtro{activeFiltersCount > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={refreshProducts} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl"><MoreVertical className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => { setCleanupType('all'); setCleanupDialogOpen(true); }}><Trash2 className="w-4 h-4 mr-2 text-destructive" />Deletar todos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setCleanupType('marketplace'); setCleanupDialogOpen(true); }}><Filter className="w-4 h-4 mr-2" />Por marketplace</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setCleanupType('old'); setCleanupDialogOpen(true); }}><AlertTriangle className="w-4 h-4 mr-2" />Produtos antigos</DropdownMenuItem>
                {selectedIds.length > 0 && (
                  <DropdownMenuItem onClick={() => { setCleanupType('selected'); setCleanupDialogOpen(true); }}><Trash2 className="w-4 h-4 mr-2 text-destructive" />Deletar selecionados ({selectedIds.length})</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex gap-2 px-4 pt-1 pb-3 w-full">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-10 h-11 rounded-2xl bg-muted/50 border-transparent focus:border-primary focus:bg-background transition-all text-sm w-full"
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted" onClick={() => { setSearch(''); setPage(1); }}>
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen(true)}
            className={`relative h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0 border transition-all active:scale-95 ${
              activeFiltersCount > 0
                ? 'bg-primary border-primary text-primary-foreground shadow-md shadow-primary/20'
                : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 rounded-full text-[9px] font-black text-white flex items-center justify-center shadow-sm">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {activeFiltersCount > 0 && (
          <div className="pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <div className="inline-flex gap-2 px-4 pr-6 min-w-full">
              {marketplaceFilter !== 'all' && (
                <button onClick={() => { setMarketplaceFilter('all'); setPage(1); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold whitespace-nowrap border border-primary/20 active:scale-95 transition-transform flex-shrink-0">
                  {marketplaceFilter} <X className="w-3 h-3" />
                </button>
              )}
              {categoryFilter !== 'all' && (
                <button onClick={() => { setCategoryFilter('all'); setPage(1); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold whitespace-nowrap border border-primary/20 active:scale-95 transition-transform flex-shrink-0">
                  <Tag className="w-3 h-3" />{categoryFilter} <X className="w-3 h-3" />
                </button>
              )}
              {sortField && (
                <button onClick={() => { setSortField(null); setPage(1); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold whitespace-nowrap border border-primary/20 active:scale-95 transition-transform flex-shrink-0">
                  <ArrowUpDown className="w-3 h-3" />
                  {sortField === 'price' ? 'Preço' : 'Desconto'} ({sortDirection === 'asc' ? '↑' : '↓'})
                  <X className="w-3 h-3" />
                </button>
              )}
              {isDateFilterActive && (
                <button onClick={clearDateFilter}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold whitespace-nowrap border border-primary/20 active:scale-95 transition-transform flex-shrink-0">
                  <CalendarDays className="w-3 h-3" />
                  {quickFilter !== 'all' ? quickFilterLabels[quickFilter] : calendarLabel}
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="mx-4 mb-3 flex items-center justify-between bg-primary text-primary-foreground rounded-2xl px-4 py-3 shadow-lg shadow-primary/25">
            <div className="flex items-center gap-2.5 min-w-0">
              <button onClick={() => setSelectedIds([])} className="w-6 h-6 rounded-full bg-primary-foreground/20 flex items-center justify-center active:scale-90 flex-shrink-0">
                <X className="w-3.5 h-3.5" strokeWidth={3} />
              </button>
              <span className="text-sm font-bold truncate">{selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}</span>
            </div>
            <button onClick={() => { setCleanupType('selected'); setCleanupDialogOpen(true); }}
              className="flex items-center gap-1.5 bg-primary-foreground/20 hover:bg-primary-foreground/30 px-3 py-1.5 rounded-xl text-sm font-bold transition-colors active:scale-95 flex-shrink-0 ml-2">
              <Trash2 className="w-3.5 h-3.5" />Excluir
            </button>
          </div>
        )}
      </div>

      {/* ─── TABS ─── */}
      <div className="md:px-6 overflow-x-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="px-4 md:px-0">
            <TabsList className="w-full md:w-auto">
              <TabsTrigger value="products" className="flex-1 md:flex-none gap-2"><Filter className="w-4 h-4" />Produtos</TabsTrigger>
              <TabsTrigger value="coupons" className="flex-1 md:flex-none gap-2"><Ticket className="w-4 h-4" />Cupons</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="products" className="mt-3">
            {/* DESKTOP FILTERS */}
            <div className="hidden md:block mb-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex gap-3 flex-wrap items-center">
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Buscar produto..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
                    </div>
                    <Select value={marketplaceFilter} onValueChange={v => { setMarketplaceFilter(v as any); setPage(1); }}>
                      <SelectTrigger className="w-48"><Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Marketplace" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os marketplaces</SelectItem>
                        <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                        <SelectItem value="amazon">Amazon</SelectItem>
                        <SelectItem value="shopee">Shopee</SelectItem>
                        <SelectItem value="magalu">Magalu</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
                      <SelectTrigger className="w-52"><Tag className="w-4 h-4 mr-2" /><SelectValue placeholder="Categoria" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as categorias</SelectItem>
                        {availableCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select
                      value={sortField === 'price' ? `price_${sortDirection}` : sortField === 'discount' ? `discount_${sortDirection}` : 'none'}
                      onValueChange={v => {
                        if (v === 'none') setSortField(null);
                        else { const [f, d] = v.split('_') as [SortField, SortDirection]; setSortField(f); setSortDirection(d); }
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-52">
                        <div className="flex items-center gap-2">
                          {sortField === null && <ArrowUpDown className="w-4 h-4 text-muted-foreground" />}
                          {sortField === 'price' && sortDirection === 'asc' && <ArrowUp className="w-4 h-4 text-primary" />}
                          {sortField === 'price' && sortDirection === 'desc' && <ArrowDown className="w-4 h-4 text-primary" />}
                          {sortField === 'discount' && sortDirection === 'asc' && <ArrowUp className="w-4 h-4 text-primary" />}
                          {sortField === 'discount' && sortDirection === 'desc' && <ArrowDown className="w-4 h-4 text-primary" />}
                          <SelectValue placeholder="Ordenar por" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none"><span className="flex items-center gap-2"><ArrowUpDown className="w-4 h-4 text-muted-foreground" />Sem ordenação</span></SelectItem>
                        <SelectItem value="price_asc"><span className="flex items-center gap-2"><ArrowUp className="w-4 h-4 text-green-600" />Menor preço primeiro</span></SelectItem>
                        <SelectItem value="price_desc"><span className="flex items-center gap-2"><ArrowDown className="w-4 h-4 text-green-600" />Maior preço primeiro</span></SelectItem>
                        <SelectItem value="discount_desc"><span className="flex items-center gap-2"><ArrowDown className="w-4 h-4 text-orange-500" />Maior desconto primeiro</span></SelectItem>
                        <SelectItem value="discount_asc"><span className="flex items-center gap-2"><ArrowUp className="w-4 h-4 text-orange-500" />Menor desconto primeiro</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {(['all', 'today', 'yesterday', 'last7', 'last30'] as QuickFilter[]).map(q => (
                      <Button key={q} variant={quickFilter === q ? 'default' : 'outline'} size="sm" className="h-9 text-xs font-medium"
                        onClick={() => { setQuickFilter(q); setDateRange(undefined); setPage(1); }}>
                        {quickFilterLabels[q]}
                      </Button>
                    ))}
                    <div className="h-6 w-px bg-border mx-1" />
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant={quickFilter === 'all' && dateRange?.from ? 'default' : 'outline'} size="sm" className="h-9 gap-2 text-xs font-medium min-w-[160px] justify-start">
                          <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{calendarLabel || 'Período personalizado'}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                        <div className="p-3 border-b"><p className="text-sm font-medium">Selecionar período</p><p className="text-xs text-muted-foreground mt-0.5">Clique em duas datas para definir o intervalo</p></div>
                        <Calendar mode="range" selected={dateRange} onSelect={(range) => { setDateRange(range); setQuickFilter('all'); setPage(1); if (range?.from && range?.to) setCalendarOpen(false); }} locale={ptBR} numberOfMonths={2} disabled={{ after: new Date() }} initialFocus />
                        {dateRange?.from && (
                          <div className="p-3 border-t flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })}{dateRange.to && ` → ${format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`}</span>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDateRange(undefined); setPage(1); }}>Limpar</Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                  {(categoryFilter !== 'all' || sortField || isDateFilterActive) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {categoryFilter !== 'all' && <Badge variant="secondary" className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => { setCategoryFilter('all'); setPage(1); }}><Tag className="w-3 h-3" />{categoryFilter}<X className="w-3 h-3 ml-0.5" /></Badge>}
                      {sortField && <Badge variant="secondary" className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => { setSortField(null); setPage(1); }}>
                        {sortField === 'price' && sortDirection === 'asc' && <><ArrowUp className="w-3 h-3" /> Menor preço</>}
                        {sortField === 'price' && sortDirection === 'desc' && <><ArrowDown className="w-3 h-3" /> Maior preço</>}
                        {sortField === 'discount' && sortDirection === 'desc' && <><ArrowDown className="w-3 h-3" /> Maior desconto</>}
                        {sortField === 'discount' && sortDirection === 'asc' && <><ArrowUp className="w-3 h-3" /> Menor desconto</>}
                        <X className="w-3 h-3 ml-0.5" /></Badge>}
                      {isDateFilterActive && <Badge variant="secondary" className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={clearDateFilter}><CalendarDays className="w-3 h-3" />{quickFilter !== 'all' ? quickFilterLabels[quickFilter] : calendarLabel}<X className="w-3 h-3 ml-0.5" /></Badge>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* DESKTOP TABLE */}
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"><Checkbox checked={selectedIds.length === paginatedProducts.length && paginatedProducts.length > 0} onCheckedChange={handleSelectAll} /></TableHead>
                        <TableHead>Imagem</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Marketplace</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right cursor-pointer select-none group" onClick={() => handleSort('price')}><span className="inline-flex items-center justify-end w-full gap-1 hover:text-foreground transition-colors">Preço<SortIcon field="price" /></span></TableHead>
                        <TableHead className="text-right cursor-pointer select-none group" onClick={() => handleSort('discount')}><span className="inline-flex items-center justify-end w-full gap-1 hover:text-foreground transition-colors">Desconto<SortIcon field="discount" /></span></TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedProducts.map(product => {
                        const currentPriceCents = getCurrentPrice(product);
                        const oldPriceCents = getOldPrice(product);
                        const discount = getDiscount(product);
                        return (
                          <TableRow key={product.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleProductClick(product)}>
                            <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selectedIds.includes(product.id)} onCheckedChange={() => handleSelect(product.id)} /></TableCell>
                            <TableCell><img src={product.image || '/no-image.png'} alt={product.name} className="w-12 h-12 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).src = '/no-image.png'; }} /></TableCell>
                            <TableCell><p className="font-medium truncate max-w-xs">{product.name}</p><p className="text-sm text-muted-foreground">{product.category}</p></TableCell>
                            <TableCell><MarketplaceBadge marketplace={product.marketplace} /></TableCell>
                            <TableCell><StatusBadge status={product.status as ProductStatus} /></TableCell>
                            <TableCell className="text-right">{oldPriceCents > 0 && oldPriceCents > currentPriceCents && <p className="text-sm line-through text-muted-foreground">{formatCurrency(oldPriceCents)}</p>}<p className="font-bold text-green-600">{formatCurrency(currentPriceCents)}</p></TableCell>
                            <TableCell className="text-right">{discount > 0 ? <span className="text-green-600 font-semibold">-{discount}%</span> : <span className="text-muted-foreground text-sm">-</span>}</TableCell>
                            <TableCell><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); handleProductClick(product); }}><Eye className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        );
                      })}
                      {paginatedProducts.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground"><Package className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Nenhum produto encontrado.</p></TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-center gap-3 p-4 border-t">
                    <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="text-sm text-muted-foreground min-w-[80px] text-center">Página {page} de {totalPages || 1}</span>
                    <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ─── MOBILE PRODUCT LIST ─── */}
            <div className="md:hidden px-4 space-y-2 w-full overflow-hidden">
              {paginatedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                  <div className="w-24 h-24 rounded-3xl bg-muted/60 flex items-center justify-center mb-5 shadow-inner">
                    <Package className="w-10 h-10 opacity-30" />
                  </div>
                  <p className="font-bold text-foreground text-base">Nenhum produto encontrado</p>
                  <p className="text-sm mt-1 text-center px-8">Tente ajustar os filtros ou buscar por outro termo</p>
                  {(activeFiltersCount > 0 || search) && (
                    <button onClick={() => { setMarketplaceFilter('all'); setCategoryFilter('all'); setSortField(null); clearDateFilter(); setSearch(''); }}
                      className="mt-5 text-sm text-primary font-semibold px-5 py-2.5 rounded-xl border border-primary/20 bg-primary/5 active:scale-95 transition-transform">
                      Limpar filtros
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-1 pt-0.5">
                    <button onClick={handleSelectAll} className="flex items-center gap-2 text-xs text-muted-foreground font-medium active:opacity-70">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${selectedIds.length === paginatedProducts.length ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                        {selectedIds.length === paginatedProducts.length && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        {selectedIds.length > 0 && selectedIds.length < paginatedProducts.length && <div className="w-1.5 h-0.5 bg-muted-foreground rounded" />}
                      </div>
                      {selectedIds.length === paginatedProducts.length ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                    <span className="text-xs text-muted-foreground">{paginatedProducts.length} nesta página</span>
                  </div>

                  {paginatedProducts.map((product, i) => (
                    <MobileProductCard
                      key={product.id}
                      product={product}
                      selected={selectedIds.includes(product.id)}
                      onSelect={() => handleSelect(product.id)}
                      onClick={() => handleProductClick(product)}
                      index={i}
                    />
                  ))}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 pb-8">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all">
                        <ChevronLeft className="w-4 h-4" />Anterior
                      </button>
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                          return (
                            <button key={p} onClick={() => setPage(p)}
                              className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-90 flex-shrink-0 ${p === page ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}>
                              {p}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all">
                        Próxima<ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="coupons">
            <div className="px-4 md:px-0">
              <Card>
                <CardContent className="p-12 text-center">
                  <Ticket className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Cupons em breve</h3>
                  <p className="text-muted-foreground">A funcionalidade de cupons será implementada em breve</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── MOBILE FILTERS SHEET ─── */}
      <MobileFiltersSheet
        open={filtersOpen} onClose={setFiltersOpen}
        marketplaceFilter={marketplaceFilter} setMarketplaceFilter={setMarketplaceFilter}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        sortField={sortField} setSortField={setSortField}
        sortDirection={sortDirection} setSortDirection={setSortDirection}
        quickFilter={quickFilter} setQuickFilter={setQuickFilter}
        dateRange={dateRange} setDateRange={setDateRange}
        availableCategories={availableCategories} setPage={setPage}
        clearDateFilter={clearDateFilter}
      />

      {/* ─── MOBILE PRODUCT DETAIL ─── */}
      <MobileProductDetailSheet
        open={mobileDetailsOpen}
        onClose={() => { setMobileDetailsOpen(false); setOriginalProductData(null); }}
        displayProduct={displayProduct}
      />

      {/* ─── DESKTOP PRODUCT DETAIL DIALOG ─── */}
      <Dialog open={desktopDetailsOpen} onOpenChange={(open) => { setDesktopDetailsOpen(open); if (!open) setOriginalProductData(null); }}>
        <DialogContent className="max-w-3xl w-full max-h-[88vh] p-0 gap-0 overflow-hidden rounded-2xl [&>button]:hidden">
          <DialogTitle className="sr-only">
            {displayProduct ? (displayProduct.nome || displayProduct.name || 'Detalhes do Produto') : 'Detalhes do Produto'}
          </DialogTitle>
          <DialogDescription className="sr-only">Informações completas e link de afiliado do produto</DialogDescription>
          {displayProduct && (
            <div className="flex flex-col h-full max-h-[88vh]">
              <div className="relative flex gap-0 border-b overflow-hidden flex-shrink-0">
                <div className="relative w-52 flex-shrink-0 bg-muted/40">
                  <img
                    src={displayProduct.imagem || displayProduct.image || '/no-image.png'}
                    alt={displayProduct.nome || displayProduct.name}
                    className="w-full h-full object-cover min-h-[200px]"
                    style={{ aspectRatio: '1/1' }}
                    onError={(e) => { (e.target as HTMLImageElement).src = '/no-image.png'; }}
                  />
                  {displayProduct.desconto && (
                    <div className="absolute top-3 left-3">
                      <Badge variant="destructive" className="gap-1 text-sm px-2.5 py-1 shadow-lg font-bold">
                        <TrendingDown className="w-3.5 h-3.5" />{displayProduct.desconto}
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 px-7 py-6 flex flex-col justify-between">
                  <div className="space-y-3 pr-12">
                    <div className="flex flex-wrap gap-2">
                      <MarketplaceBadge marketplace={displayProduct.marketplace} />
                      <StatusBadge status={displayProduct.status || 'active'} />
                      {displayProduct.categoria && (
                        <Badge variant="outline" className="gap-1">
                          <Tag className="w-3 h-3" />{displayProduct.categoria}
                        </Badge>
                      )}
                    </div>
                    <h2 className="font-bold text-xl leading-snug">
                      {displayProduct.nome || displayProduct.nome_normalizado || displayProduct.name}
                    </h2>
                  </div>
                  <div className="mt-4 p-4 rounded-xl bg-muted/40 border">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">Preço atual</p>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      {displayProduct.preco && (
                        <span className="text-4xl font-black text-green-500 leading-none">
                          {displayProduct.preco?.startsWith?.('R$') ? displayProduct.preco : `R$ ${displayProduct.preco}`}
                        </span>
                      )}
                      {displayProduct.preco_anterior && (
                        <span className="text-lg line-through text-muted-foreground">
                          {displayProduct.preco_anterior?.startsWith?.('R$') ? displayProduct.preco_anterior : `R$ ${displayProduct.preco_anterior}`}
                        </span>
                      )}
                    </div>
                    {displayProduct.parcelas && (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                        <CreditCard className="w-3 h-3" />{displayProduct.parcelas}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setDesktopDetailsOpen(false)}
                  className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center bg-background/80 backdrop-blur-sm border hover:bg-muted transition-colors shadow-sm z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ScrollArea className="flex-1 overflow-auto">
                <div className="px-7 py-5 space-y-5">
                  {(displayProduct.vendedor || displayProduct.frete || displayProduct.numero_avaliacoes || displayProduct.porcentagem_vendido || displayProduct.tempo_restante) && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Detalhes</p>
                      <div className="grid grid-cols-3 gap-3">
                        {displayProduct.vendedor && (
                          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Store className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wide">Vendedor</span>
                            </div>
                            <p className="text-sm font-semibold truncate">{displayProduct.vendedor}</p>
                          </div>
                        )}
                        {displayProduct.frete && (
                          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Truck className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wide">Frete</span>
                            </div>
                            <p className="text-sm font-semibold truncate">{displayProduct.frete}</p>
                          </div>
                        )}
                        {displayProduct.numero_avaliacoes && displayProduct.numero_avaliacoes !== '0' && (
                          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Star className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wide">Avaliações</span>
                            </div>
                            <p className="text-sm font-semibold">{displayProduct.avaliacao && `${displayProduct.avaliacao} · `}{displayProduct.numero_avaliacoes}</p>
                          </div>
                        )}
                        {displayProduct.porcentagem_vendido && displayProduct.porcentagem_vendido !== 'N/A' && (
                          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wide">Vendas</span>
                            </div>
                            <p className="text-sm font-semibold">{displayProduct.porcentagem_vendido}</p>
                          </div>
                        )}
                        {displayProduct.tempo_restante && displayProduct.tempo_restante !== 'N/A' && (
                          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wide">Tempo Restante</span>
                            </div>
                            <p className="text-sm font-semibold">{displayProduct.tempo_restante}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {(displayProduct.createdAt || displayProduct.createdat || displayProduct.updatedAt || displayProduct.updatedat || displayProduct.ultima_verificacao) && (
                    <div className="flex items-center gap-1 flex-wrap rounded-xl border bg-muted/20 px-4 py-3">
                      {(displayProduct.createdAt || displayProduct.createdat) && (
                        <div className="flex items-center gap-2 px-3 py-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Criado</p>
                            <p className="text-xs font-semibold">{formatDate(displayProduct.createdAt || displayProduct.createdat)}</p>
                          </div>
                        </div>
                      )}
                      {(displayProduct.updatedAt || displayProduct.updatedat) && (
                        <>
                          <div className="w-px h-7 bg-border" />
                          <div className="flex items-center gap-2 px-3 py-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Atualizado</p>
                              <p className="text-xs font-semibold">{formatDate(displayProduct.updatedAt || displayProduct.updatedat)}</p>
                            </div>
                          </div>
                        </>
                      )}
                      {displayProduct.ultima_verificacao && (
                        <>
                          <div className="w-px h-7 bg-border" />
                          <div className="flex items-center gap-2 px-3 py-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Verificado</p>
                              <p className="text-xs font-semibold">{formatDate(displayProduct.ultima_verificacao)}</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {affiliateLink && (
                    <div className="rounded-xl border border-green-500/30 bg-green-500/5 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-green-500/20 bg-green-500/10">
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                          <Link2 className="w-4 h-4" />
                          <span className="text-sm font-bold">Link de Afiliado</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleCopyLink(affiliateLink)}
                            className="h-8 px-3 gap-2 text-xs font-semibold border-green-500/30 hover:bg-green-500/10 hover:border-green-500/50">
                            {copiedLink ? <><Check className="w-3.5 h-3.5 text-green-500" />Copiado!</> : <><Copy className="w-3.5 h-3.5" />Copiar link</>}
                          </Button>
                          <Button size="sm" asChild className="h-8 px-3 gap-2 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white border-0">
                            <a href={affiliateLink} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3.5 h-3.5" />Abrir
                            </a>
                          </Button>
                        </div>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed select-all">{affiliateLink}</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between gap-3 px-7 py-4 border-t bg-muted/20 flex-shrink-0">
                <Button variant="outline" size="lg" onClick={() => setDesktopDetailsOpen(false)} className="h-10 px-6">Fechar</Button>
                {affiliateLink && (
                  <Button size="lg" asChild className="h-10 px-6 gap-2 bg-green-600 hover:bg-green-700 text-white border-0">
                    <a href={affiliateLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />Abrir Produto
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── CLEANUP DIALOG ─── */}
      <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <DialogContent className="mx-4 rounded-2xl max-w-sm md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              {getCleanupTitle()}
            </DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita. Os produtos serão permanentemente removidos.</DialogDescription>
          </DialogHeader>
          {cleanupType === 'marketplace' && (
            <div className="space-y-2">
              <Label>Selecione o marketplace</Label>
              <Select value={cleanupMarketplace} onValueChange={v => setCleanupMarketplace(v as Marketplace)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                  <SelectItem value="amazon">Amazon</SelectItem>
                  <SelectItem value="shopee">Shopee</SelectItem>
                  <SelectItem value="magalu">Magalu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {cleanupType === 'old' && (
            <div className="space-y-2">
              <Label>Produtos mais antigos que (dias)</Label>
              <Select value={cleanupDays.toString()} onValueChange={v => setCleanupDays(Number(v))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="15">15 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="60">60 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCleanupDialogOpen(false)} className="flex-1 rounded-xl h-11">Cancelar</Button>
            <Button variant="destructive" onClick={handleCleanup} disabled={isCleaningUp} className="flex-1 rounded-xl h-11">
              {isCleaningUp ? 'Excluindo...' : 'Confirmar exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}