// src/pages/ProductsPage.tsx - VERSÃO MOBILE REDESENHADA

import { useState, useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import {
  Search,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eraser,
  AlertTriangle,
  Ticket,
  ExternalLink,
  Copy,
  Check,
  CalendarDays,
  Tag,
  TrendingDown,
  Package,
  Eye,
  Star,
  Truck,
  CreditCard,
  Store,
  Clock,
  Percent,
  Link2,
  ShoppingCart,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  SlidersHorizontal,
  ChevronDown,
  MoreVertical,
  Zap,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { formatNumber, Marketplace, ProductStatus } from '@/lib/mockData';
import { productsService } from '@/api/services/products.service';
import { formatCurrency, getCurrentPrice, getOldPrice, getDiscount } from '@/lib/priceUtils';

type CleanupType = 'all' | 'marketplace' | 'old' | 'selected';
type SortField = 'price' | 'discount' | null;
type SortDirection = 'asc' | 'desc';
type QuickFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'last30';

import { ENV } from '@/config/environment';
const API_BASE_URL = ENV.API_BASE_URL;

// ─── Componente de Card de Produto para Mobile ───────────────────────────────
function MobileProductCard({
  product,
  selected,
  onSelect,
  onClick,
}: {
  product: any;
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
}) {
  const currentPriceCents = getCurrentPrice(product);
  const oldPriceCents = getOldPrice(product);
  const discount = getDiscount(product);

  return (
    <div
      className={`
        relative flex gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer
        active:scale-[0.98] active:shadow-inner
        ${selected
          ? 'border-primary/50 bg-primary/5 shadow-sm shadow-primary/10'
          : 'border-border bg-card hover:border-border/80 hover:shadow-sm'
        }
      `}
      onClick={onClick}
    >
      {/* Checkbox sobreposto */}
      <div
        className="absolute top-2.5 left-2.5 z-10"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <div className={`
          w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
          ${selected ? 'bg-primary border-primary' : 'border-border bg-background'}
        `}>
          {selected && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
        </div>
      </div>

      {/* Imagem */}
      <div className="flex-shrink-0 mt-1 ml-3">
        <div className="relative">
          <img
            src={product.image || '/no-image.png'}
            alt={product.name}
            className="w-16 h-16 object-cover rounded-lg border border-border/50"
            onError={(e) => { (e.target as HTMLImageElement).src = '/no-image.png'; }}
          />
          {discount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              -{discount}%
            </span>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-semibold leading-snug line-clamp-2 text-foreground pr-1">
          {product.name}
        </p>

        <div className="flex items-center gap-1.5 flex-wrap">
          <MarketplaceBadge marketplace={product.marketplace} />
          {product.category && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {product.category}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0">
            {oldPriceCents > 0 && oldPriceCents > currentPriceCents && (
              <p className="text-[10px] line-through text-muted-foreground leading-none">
                {formatCurrency(oldPriceCents)}
              </p>
            )}
            <p className="text-base font-bold text-emerald-600 leading-tight">
              {formatCurrency(currentPriceCents)}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <StatusBadge status={product.status as ProductStatus} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Componente de Filtros Mobile (Sheet) ────────────────────────────────────
function MobileFiltersSheet({
  open,
  onClose,
  marketplaceFilter,
  setMarketplaceFilter,
  categoryFilter,
  setCategoryFilter,
  sortField,
  setSortField,
  sortDirection,
  setSortDirection,
  quickFilter,
  setQuickFilter,
  dateRange,
  setDateRange,
  availableCategories,
  setPage,
  clearDateFilter,
}: any) {
  const quickFilterLabels: Record<QuickFilter, string> = {
    all: 'Qualquer data',
    today: 'Hoje',
    yesterday: 'Ontem',
    last7: 'Últimos 7 dias',
    last30: 'Últimos 30 dias',
  };

  const activeFiltersCount = [
    marketplaceFilter !== 'all',
    categoryFilter !== 'all',
    sortField !== null,
    quickFilter !== 'all' || !!dateRange?.from,
  ].filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] px-0">
        <div className="px-5">
          <SheetHeader className="text-left pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-bold">Filtros & Ordenação</SheetTitle>
              {activeFiltersCount > 0 && (
                <Badge variant="default" className="text-xs">
                  {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </SheetHeader>
        </div>

        <ScrollArea className="max-h-[calc(85vh-80px)]">
          <div className="px-5 space-y-6 pb-8">

            {/* Marketplace */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Marketplace
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'all', label: 'Todos' },
                  { value: 'mercadolivre', label: 'Mercado Livre' },
                  { value: 'amazon', label: 'Amazon' },
                  { value: 'shopee', label: 'Shopee' },
                  { value: 'magalu', label: 'Magalu' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setMarketplaceFilter(opt.value); setPage(1); }}
                    className={`
                      py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left
                      ${marketplaceFilter === opt.value
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background border-border text-foreground hover:bg-muted'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Categoria */}
            {availableCategories.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Categoria
                  </Label>
                  <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Todas as categorias" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as categorias</SelectItem>
                      {availableCategories.map((cat: string) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
              </>
            )}

            {/* Ordenação */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ordenar por
              </Label>
              <div className="space-y-2">
                {[
                  { field: null, dir: 'asc', label: 'Sem ordenação', icon: ArrowUpDown },
                  { field: 'price', dir: 'asc', label: 'Menor preço primeiro', icon: ArrowUp },
                  { field: 'price', dir: 'desc', label: 'Maior preço primeiro', icon: ArrowDown },
                  { field: 'discount', dir: 'desc', label: 'Maior desconto primeiro', icon: ArrowDown },
                  { field: 'discount', dir: 'asc', label: 'Menor desconto primeiro', icon: ArrowUp },
                ].map((opt, i) => {
                  const isActive = sortField === opt.field && (opt.field === null || sortDirection === opt.dir);
                  const Icon = opt.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setSortField(opt.field as SortField);
                        setSortDirection(opt.dir as SortDirection);
                        setPage(1);
                      }}
                      className={`
                        w-full flex items-center gap-3 py-3 px-4 rounded-xl border text-sm font-medium transition-all text-left
                        ${isActive
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-background border-border text-foreground hover:bg-muted'
                        }
                      `}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      {opt.label}
                      {isActive && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Período */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Período
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {(['all', 'today', 'yesterday', 'last7', 'last30'] as QuickFilter[]).map(q => (
                  <button
                    key={q}
                    onClick={() => { setQuickFilter(q); setDateRange(undefined); setPage(1); }}
                    className={`
                      py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left
                      ${quickFilter === q && !dateRange?.from
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background border-border text-foreground hover:bg-muted'
                      }
                    `}
                  >
                    {quickFilterLabels[q]}
                  </button>
                ))}
              </div>
            </div>

            {/* Botão limpar filtros */}
            {(marketplaceFilter !== 'all' || categoryFilter !== 'all' || sortField || quickFilter !== 'all' || dateRange?.from) && (
              <button
                onClick={() => {
                  setMarketplaceFilter('all');
                  setCategoryFilter('all');
                  setSortField(null);
                  clearDateFilter();
                  setPage(1);
                  onClose(false);
                }}
                className="w-full py-3 rounded-xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors"
              >
                Limpar todos os filtros
              </button>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function ProductsPage() {
  const { products, deleteProducts, refreshProducts, isLoading } = useDashboard();
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

  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [originalProductData, setOriginalProductData] = useState<any>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const pageSize = 15;

  const availableCategories = useMemo(() => {
    const cats = products
      .map(p => p.category || p.categoria)
      .filter((c): c is string => !!c && c.trim() !== '');
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
        if (dateRange?.from) {
          return { from: startOfDay(dateRange.from), to: dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from) };
        }
        return { from: null, to: null };
    }
  };

  const isDateFilterActive = quickFilter !== 'all' || !!dateRange?.from;

  const quickFilterLabels: Record<QuickFilter, string> = {
    all: 'Qualquer data', today: 'Hoje', yesterday: 'Ontem',
    last7: 'Últimos 7 dias', last30: 'Últimos 30 dias',
  };

  const calendarLabel = useMemo(() => {
    if (quickFilter !== 'all') return null;
    if (!dateRange?.from) return 'Período personalizado';
    if (!dateRange.to || dateRange.from.toDateString() === dateRange.to.toDateString()) {
      return format(dateRange.from, "dd/MM/yyyy", { locale: ptBR });
    }
    return `${format(dateRange.from, "dd/MM/yy", { locale: ptBR })} → ${format(dateRange.to, "dd/MM/yy", { locale: ptBR })}`;
  }, [quickFilter, dateRange]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-primary" />
      : <ArrowDown className="w-3.5 h-3.5 ml-1 text-primary" />;
  };

  const filteredProducts = useMemo(() => {
    const { from, to } = getActiveDateRange();
    let result = products.filter(p => {
      const matchesSearch =
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase());
      const matchesMarketplace = marketplaceFilter === 'all' || p.marketplace === marketplaceFilter;
      const productCategory = p.category || p.categoria || '';
      const matchesCategory = categoryFilter === 'all' || productCategory === categoryFilter;
      let matchesDate = true;
      if (from && to) {
        const rawDate = p.addedAt ?? null;
        if (rawDate) {
          const productDate = new Date(rawDate);
          if (!isNaN(productDate.getTime())) {
            matchesDate = productDate >= from && productDate <= to;
          } else {
            matchesDate = false;
          }
        } else {
          matchesDate = false;
        }
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
    if (selectedIds.length === paginatedProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedProducts.map(p => p.id));
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleDelete = async () => {
    await deleteProducts(selectedIds);
    setSelectedIds([]);
    toast({ title: 'Produtos excluídos com sucesso' });
  };

  const handleProductClick = async (product: any) => {
    setSelectedProduct(product);
    setDetailsDialogOpen(true);
    setCopiedLink(false);
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${product.id}`);
      const data = await response.json();
      if (data.success && data.data) setOriginalProductData(data.data);
    } catch {
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

  const handleCleanup = async () => {
    setIsCleaningUp(true);
    try {
      let deleted = 0;
      switch (cleanupType) {
        case 'all': const resAll = await productsService.deleteAll(); deleted = resAll.data?.deleted || 0; break;
        case 'marketplace': const mpKey = cleanupMarketplace === 'mercadolivre' ? 'ML' : cleanupMarketplace; const resMP = await productsService.deleteByMarketplace(mpKey as any); deleted = resMP.data?.deleted || 0; break;
        case 'old': const resOld = await productsService.deleteOld(cleanupDays); deleted = resOld.data?.deleted || 0; break;
        case 'selected': if (selectedIds.length > 0) { await deleteProducts(selectedIds); deleted = selectedIds.length; setSelectedIds([]); } break;
      }
      await refreshProducts();
      toast({ title: 'Limpeza concluída', description: `${deleted} produtos removidos` });
      setCleanupDialogOpen(false);
    } catch {
      toast({ title: 'Erro na limpeza', description: 'Falha ao excluir produtos', variant: 'destructive' });
    } finally {
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

  const activeFiltersCount = [
    marketplaceFilter !== 'all',
    categoryFilter !== 'all',
    sortField !== null,
    isDateFilterActive,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background">
      {/* ─── DESKTOP HEADER (hidden on mobile) ─── */}
      <div className="hidden md:flex p-6 justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Gerenciamento</h1>
          <p className="text-muted-foreground">{formatNumber(filteredProducts.length)} produtos encontrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshProducts} disabled={isLoading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <Eraser className="w-4 h-4" />
                Limpeza
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => { setCleanupType('all'); setCleanupDialogOpen(true); }}>
                <Trash2 className="w-4 h-4 mr-2" />Deletar todos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setCleanupType('marketplace'); setCleanupDialogOpen(true); }}>
                <Filter className="w-4 h-4 mr-2" />Deletar por marketplace
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setCleanupType('old'); setCleanupDialogOpen(true); }}>
                <AlertTriangle className="w-4 h-4 mr-2" />Deletar produtos antigos
              </DropdownMenuItem>
              {selectedIds.length > 0 && (
                <DropdownMenuItem onClick={() => { setCleanupType('selected'); setCleanupDialogOpen(true); }}>
                  <Trash2 className="w-4 h-4 mr-2" />Deletar selecionados ({selectedIds.length})
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── MOBILE HEADER ─── */}
      <div className="md:hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Gerenciamento</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatNumber(filteredProducts.length)} produtos
              {activeFiltersCount > 0 && ` · ${activeFiltersCount} filtro${activeFiltersCount > 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={refreshProducts}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => { setCleanupType('all'); setCleanupDialogOpen(true); }}>
                  <Trash2 className="w-4 h-4 mr-2 text-destructive" />Deletar todos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setCleanupType('marketplace'); setCleanupDialogOpen(true); }}>
                  <Filter className="w-4 h-4 mr-2" />Deletar por marketplace
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setCleanupType('old'); setCleanupDialogOpen(true); }}>
                  <AlertTriangle className="w-4 h-4 mr-2" />Deletar produtos antigos
                </DropdownMenuItem>
                {selectedIds.length > 0 && (
                  <DropdownMenuItem onClick={() => { setCleanupType('selected'); setCleanupDialogOpen(true); }}>
                    <Trash2 className="w-4 h-4 mr-2 text-destructive" />Deletar selecionados ({selectedIds.length})
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search bar + filter button */}
        <div className="flex gap-2 px-4 pb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-10 h-11 rounded-xl bg-muted/50 border-transparent focus:border-primary"
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => { setSearch(''); setPage(1); }}
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

          <Button
            variant={activeFiltersCount > 0 ? 'default' : 'outline'}
            size="icon"
            className="h-11 w-11 rounded-xl flex-shrink-0 relative"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                {activeFiltersCount}
              </span>
            )}
          </Button>
        </div>

        {/* Active filter chips - scrollable */}
        {activeFiltersCount > 0 && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
            {marketplaceFilter !== 'all' && (
              <button
                onClick={() => { setMarketplaceFilter('all'); setPage(1); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium whitespace-nowrap border border-primary/20"
              >
                {marketplaceFilter}
                <X className="w-3 h-3" />
              </button>
            )}
            {categoryFilter !== 'all' && (
              <button
                onClick={() => { setCategoryFilter('all'); setPage(1); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium whitespace-nowrap border border-primary/20"
              >
                <Tag className="w-3 h-3" />
                {categoryFilter}
                <X className="w-3 h-3" />
              </button>
            )}
            {sortField && (
              <button
                onClick={() => { setSortField(null); setPage(1); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium whitespace-nowrap border border-primary/20"
              >
                <ArrowUpDown className="w-3 h-3" />
                {sortField === 'price' ? 'Preço' : 'Desconto'}
                <X className="w-3 h-3" />
              </button>
            )}
            {isDateFilterActive && (
              <button
                onClick={clearDateFilter}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium whitespace-nowrap border border-primary/20"
              >
                <CalendarDays className="w-3 h-3" />
                {quickFilter !== 'all' ? quickFilterLabels[quickFilter] : calendarLabel}
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Selection bar when items selected */}
        {selectedIds.length > 0 && (
          <div className="mx-4 mb-3 flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full border-2 border-primary bg-primary flex items-center justify-center cursor-pointer"
                onClick={() => setSelectedIds([])}
              >
                <X className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
              <span className="text-sm font-semibold text-primary">
                {selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs gap-1.5 rounded-lg"
              onClick={() => { setCleanupType('selected'); setCleanupDialogOpen(true); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </Button>
          </div>
        )}
      </div>

      {/* ─── TABS ─── */}
      <div className="md:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tabs nav */}
          <div className="px-4 md:px-0">
            <TabsList className="w-full md:w-auto">
              <TabsTrigger value="products" className="flex-1 md:flex-none gap-2">
                <Filter className="w-4 h-4" />
                Produtos
              </TabsTrigger>
              <TabsTrigger value="coupons" className="flex-1 md:flex-none gap-2">
                <Ticket className="w-4 h-4" />
                Cupons
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ─── ABA PRODUTOS ─── */}
          <TabsContent value="products" className="mt-3">
            {/* DESKTOP FILTERS (hidden on mobile) */}
            <div className="hidden md:block px-0 mb-4">
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
                        if (v === 'none') { setSortField(null); } else {
                          const [field, dir] = v.split('_') as [SortField, SortDirection];
                          setSortField(field); setSortDirection(dir);
                        }
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

            {/* DESKTOP TABLE (hidden on mobile) */}
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
                        <TableHead className="text-right cursor-pointer select-none group" onClick={() => handleSort('price')}>
                          <span className="inline-flex items-center justify-end w-full gap-1 hover:text-foreground transition-colors">Preço<SortIcon field="price" /></span>
                        </TableHead>
                        <TableHead className="text-right cursor-pointer select-none group" onClick={() => handleSort('discount')}>
                          <span className="inline-flex items-center justify-end w-full gap-1 hover:text-foreground transition-colors">Desconto<SortIcon field="discount" /></span>
                        </TableHead>
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
                            <TableCell className="text-right">
                              {oldPriceCents > 0 && oldPriceCents > currentPriceCents && <p className="text-sm line-through text-muted-foreground">{formatCurrency(oldPriceCents)}</p>}
                              <p className="font-bold text-green-600">{formatCurrency(currentPriceCents)}</p>
                            </TableCell>
                            <TableCell className="text-right">{discount > 0 ? <span className="text-green-600 font-semibold">-{discount}%</span> : <span className="text-muted-foreground text-sm">-</span>}</TableCell>
                            <TableCell><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); handleProductClick(product); }}><Eye className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        );
                      })}
                      {paginatedProducts.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground"><CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Nenhum produto encontrado para os filtros selecionados.</p></TableCell></TableRow>
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
            <div className="md:hidden px-4 space-y-2.5">
              {paginatedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <Package className="w-10 h-10 opacity-40" />
                  </div>
                  <p className="font-semibold text-foreground">Nenhum produto encontrado</p>
                  <p className="text-sm mt-1">Tente ajustar os filtros</p>
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={() => {
                        setMarketplaceFilter('all');
                        setCategoryFilter('all');
                        setSortField(null);
                        clearDateFilter();
                        setSearch('');
                      }}
                      className="mt-4 text-sm text-primary font-medium"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Select all bar */}
                  {paginatedProducts.length > 0 && (
                    <div className="flex items-center gap-2 pb-1">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedIds.length === paginatedProducts.length ? 'bg-primary border-primary' : 'border-muted-foreground/50'}`}>
                          {selectedIds.length === paginatedProducts.length && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          {selectedIds.length > 0 && selectedIds.length < paginatedProducts.length && <div className="w-2 h-0.5 bg-muted-foreground rounded" />}
                        </div>
                        {selectedIds.length === paginatedProducts.length
                          ? 'Desmarcar todos'
                          : `Selecionar todos (${paginatedProducts.length})`
                        }
                      </button>
                    </div>
                  )}

                  {paginatedProducts.map(product => (
                    <MobileProductCard
                      key={product.id}
                      product={product}
                      selected={selectedIds.includes(product.id)}
                      onSelect={() => handleSelect(product.id)}
                      onClick={() => handleProductClick(product)}
                    />
                  ))}

                  {/* Mobile Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 pb-6">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-10 px-4 rounded-xl"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Anterior
                      </Button>

                      <div className="text-center">
                        <p className="text-sm font-semibold">{page} / {totalPages}</p>
                        <p className="text-xs text-muted-foreground">{filteredProducts.length} produtos</p>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-10 px-4 rounded-xl"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                      >
                        Próxima
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ─── ABA CUPONS ─── */}
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
        open={filtersOpen}
        onClose={setFiltersOpen}
        marketplaceFilter={marketplaceFilter}
        setMarketplaceFilter={setMarketplaceFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        sortField={sortField}
        setSortField={setSortField}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        quickFilter={quickFilter}
        setQuickFilter={setQuickFilter}
        dateRange={dateRange}
        setDateRange={setDateRange}
        availableCategories={availableCategories}
        setPage={setPage}
        clearDateFilter={clearDateFilter}
      />

      {/* ─── DIALOG DE DETALHES (Mobile-optimized Sheet) ─── */}
      {/* Mobile: Sheet from bottom */}
      <div className="md:hidden">
        <Sheet open={detailsDialogOpen} onOpenChange={(open) => {
          setDetailsDialogOpen(open);
          if (!open) setOriginalProductData(null);
        }}>
          <SheetContent side="bottom" className="rounded-t-2xl h-[92vh] p-0 flex flex-col">
            {displayProduct && (
              <>
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
                </div>

                <ScrollArea className="flex-1 overflow-y-auto">
                  <div className="px-5 pb-6 space-y-5">
                    {/* Header com imagem */}
                    <div className="flex gap-4 pt-2">
                      <img
                        src={displayProduct.imagem || displayProduct.image || '/no-image.png'}
                        alt={displayProduct.nome || displayProduct.name}
                        className="w-20 h-20 object-cover rounded-2xl border shadow-sm flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/no-image.png'; }}
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <h3 className="font-bold text-base leading-snug line-clamp-3">
                          {displayProduct.nome || displayProduct.nome_normalizado || displayProduct.name}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          <MarketplaceBadge marketplace={displayProduct.marketplace} />
                          <StatusBadge status={displayProduct.status || 'active'} />
                        </div>
                      </div>
                    </div>

                    {/* Preços */}
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          {displayProduct.preco_anterior && (
                            <p className="text-sm line-through text-muted-foreground">
                              {displayProduct.preco_anterior.startsWith('R$') ? displayProduct.preco_anterior : `R$ ${displayProduct.preco_anterior}`}
                            </p>
                          )}
                          {displayProduct.preco && (
                            <p className="text-2xl font-black text-emerald-600">
                              {displayProduct.preco.startsWith('R$') ? displayProduct.preco : `R$ ${displayProduct.preco}`}
                            </p>
                          )}
                        </div>
                        {displayProduct.desconto && (
                          <div className="bg-rose-500 text-white px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5" />
                            {displayProduct.desconto}
                          </div>
                        )}
                      </div>
                      {displayProduct.parcelas && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                          <CreditCard className="w-3 h-3" />
                          {displayProduct.parcelas}
                        </p>
                      )}
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {displayProduct.vendedor && (
                        <div className="bg-muted/50 rounded-xl p-3 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Store className="w-3 h-3" />Vendedor
                          </p>
                          <p className="text-sm font-semibold truncate">{displayProduct.vendedor}</p>
                        </div>
                      )}
                      {displayProduct.frete && (
                        <div className="bg-muted/50 rounded-xl p-3 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Truck className="w-3 h-3" />Frete
                          </p>
                          <p className="text-sm font-semibold truncate">{displayProduct.frete}</p>
                        </div>
                      )}
                      {displayProduct.numero_avaliacoes && displayProduct.numero_avaliacoes !== '0' && (
                        <div className="bg-muted/50 rounded-xl p-3 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Star className="w-3 h-3" />Avaliações
                          </p>
                          <p className="text-sm font-semibold">{displayProduct.avaliacao && `${displayProduct.avaliacao} ·`} {displayProduct.numero_avaliacoes}</p>
                        </div>
                      )}
                      {displayProduct.porcentagem_vendido && displayProduct.porcentagem_vendido !== 'N/A' && (
                        <div className="bg-muted/50 rounded-xl p-3 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3" />Vendas
                          </p>
                          <p className="text-sm font-semibold">{displayProduct.porcentagem_vendido}</p>
                        </div>
                      )}
                      {displayProduct.categoria && (
                        <div className="bg-muted/50 rounded-xl p-3 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Tag className="w-3 h-3" />Categoria
                          </p>
                          <p className="text-sm font-semibold">{displayProduct.categoria}</p>
                        </div>
                      )}
                      {displayProduct.tempo_restante && displayProduct.tempo_restante !== 'N/A' && (
                        <div className="bg-muted/50 rounded-xl p-3 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />Tempo Restante
                          </p>
                          <p className="text-sm font-semibold">{displayProduct.tempo_restante}</p>
                        </div>
                      )}
                    </div>

                    {/* Datas */}
                    {((displayProduct.createdAt || displayProduct.createdat) || (displayProduct.updatedAt || displayProduct.updatedat)) && (
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {(displayProduct.createdAt || displayProduct.createdat) && (
                          <div className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            Criado: {formatDate(displayProduct.createdAt || displayProduct.createdat)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Link de Afiliado */}
                    {affiliateLink && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-4 space-y-3">
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                          <Link2 className="w-4 h-4" />
                          Link de Afiliado
                        </p>
                        <p className="text-xs font-mono text-muted-foreground bg-background/60 p-2.5 rounded-xl border line-clamp-2 break-all">
                          {affiliateLink}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1 h-11 gap-2 rounded-xl"
                            onClick={() => handleCopyLink(affiliateLink)}
                          >
                            {copiedLink ? <><Check className="w-4 h-4 text-green-600" />Copiado!</> : <><Copy className="w-4 h-4" />Copiar</>}
                          </Button>
                          <Button asChild className="flex-1 h-11 gap-2 rounded-xl">
                            <a href={affiliateLink} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4" />
                              Abrir
                            </a>
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Dialog (unchanged) */}
      <div className="hidden md:block">
        <Dialog open={detailsDialogOpen} onOpenChange={(open) => {
          setDetailsDialogOpen(open);
          if (!open) setOriginalProductData(null);
        }}>
          <DialogContent className="max-w-4xl max-h-[85vh]">
            {displayProduct && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl pr-6">Detalhes do Produto</DialogTitle>
                  <DialogDescription>Informações completas e link de afiliado</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[calc(85vh-180px)] pr-4">
                  <div className="space-y-6">
                    <div className="flex gap-6">
                      <div className="flex-shrink-0">
                        <img src={displayProduct.imagem || displayProduct.image || '/no-image.png'} alt={displayProduct.nome || displayProduct.name} className="w-48 h-48 object-cover rounded-lg border shadow-sm" onError={(e) => { (e.target as HTMLImageElement).src = '/no-image.png'; }} />
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <h3 className="font-bold text-lg leading-tight mb-3">{displayProduct.nome || displayProduct.nome_normalizado || displayProduct.name}</h3>
                          <div className="flex flex-wrap gap-2">
                            <MarketplaceBadge marketplace={displayProduct.marketplace} />
                            <StatusBadge status={displayProduct.status || 'active'} />
                            {displayProduct.categoria && <Badge variant="outline" className="gap-1"><Tag className="w-3 h-3" />{displayProduct.categoria}</Badge>}
                          </div>
                        </div>
                        <div className="bg-muted/50 p-4 rounded-lg">
                          <div className="flex items-baseline gap-3 flex-wrap">
                            {displayProduct.preco && <span className="text-3xl font-bold text-green-600">{displayProduct.preco.startsWith('R$') ? displayProduct.preco : `R$ ${displayProduct.preco}`}</span>}
                            {displayProduct.preco_anterior && <span className="text-lg line-through text-muted-foreground">{displayProduct.preco_anterior.startsWith('R$') ? displayProduct.preco_anterior : `R$ ${displayProduct.preco_anterior}`}</span>}
                            {displayProduct.desconto && <Badge variant="destructive" className="gap-1"><TrendingDown className="w-3 h-3" />{displayProduct.desconto}</Badge>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      {displayProduct.vendedor && <div className="space-y-1"><Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Store className="w-3.5 h-3.5" />Vendedor</Label><p className="font-medium text-sm">{displayProduct.vendedor}</p></div>}
                      {displayProduct.frete && <div className="space-y-1"><Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />Frete</Label><p className="font-medium text-sm">{displayProduct.frete}</p></div>}
                      {displayProduct.parcelas && <div className="space-y-1"><Label className="text-xs text-muted-foreground flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" />Parcelamento</Label><p className="font-medium text-sm">{displayProduct.parcelas}</p></div>}
                      {displayProduct.numero_avaliacoes && displayProduct.numero_avaliacoes !== '0' && <div className="space-y-1"><Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Star className="w-3.5 h-3.5" />Avaliações</Label><p className="font-medium text-sm">{displayProduct.avaliacao && `${displayProduct.avaliacao} - `}{displayProduct.numero_avaliacoes}</p></div>}
                    </div>
                    <Separator />
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {(displayProduct.createdAt || displayProduct.createdat) && <div className="space-y-1"><Label className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Criado</Label><p className="text-xs">{formatDate(displayProduct.createdAt || displayProduct.createdat)}</p></div>}
                      {(displayProduct.updatedAt || displayProduct.updatedat) && <div className="space-y-1"><Label className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Atualizado</Label><p className="text-xs">{formatDate(displayProduct.updatedAt || displayProduct.updatedat)}</p></div>}
                      {displayProduct.ultima_verificacao && <div className="space-y-1"><Label className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Verificado</Label><p className="text-xs">{formatDate(displayProduct.ultima_verificacao)}</p></div>}
                    </div>
                    {affiliateLink && (
                      <>
                        <Separator />
                        <div className="space-y-3 bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                          <Label className="text-sm font-semibold flex items-center gap-2 text-green-700 dark:text-green-400"><Link2 className="w-4 h-4" />Link de Afiliado</Label>
                          <div className="flex gap-2 items-center">
                            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border bg-background/60 text-sm font-mono text-muted-foreground overflow-hidden select-all cursor-text"><span className="truncate">{affiliateLink}</span></div>
                            <Button variant="outline" size="icon" onClick={() => handleCopyLink(affiliateLink)} className="flex-shrink-0">{copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}</Button>
                            <Button size="icon" asChild className="flex-shrink-0"><a href={affiliateLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a></Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>Fechar</Button>
                  {affiliateLink && <Button asChild><a href={affiliateLink} target="_blank" rel="noopener noreferrer" className="gap-2"><ExternalLink className="w-4 h-4" />Abrir Produto</a></Button>}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* ─── DIALOG DE LIMPEZA ─── */}
      <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <DialogContent className="mx-4 rounded-2xl max-w-sm md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              {getCleanupTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Esta ação não pode ser desfeita. Os produtos serão permanentemente removidos.
            </DialogDescription>
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