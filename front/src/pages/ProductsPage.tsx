// src/pages/ProductsPage.tsx - VERSÃO FINAL FUNCIONAL

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

export function ProductsPage() {
  const { products, deleteProducts, refreshProducts, isLoading } = useDashboard();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | Marketplace>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('products');

  // Ordenação
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Filtro de data
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Dialog de limpeza
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupType, setCleanupType] = useState<CleanupType>('all');
  const [cleanupMarketplace, setCleanupMarketplace] = useState<Marketplace>('mercadolivre');
  const [cleanupDays, setCleanupDays] = useState(7);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // Dialog de detalhes do produto
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Estado para armazenar os dados originais do produto
  const [originalProductData, setOriginalProductData] = useState<any>(null);

  const pageSize = 15;

  // Lista dinâmica de categorias únicas
  const availableCategories = useMemo(() => {
    const cats = products
      .map(p => p.category || p.categoria)
      .filter((c): c is string => !!c && c.trim() !== '');
    return Array.from(new Set(cats)).sort();
  }, [products]);

  // Resolve intervalo de datas ativo (quick filter OU range do calendário)
  const getActiveDateRange = (): { from: Date | null; to: Date | null } => {
    const now = new Date();
    const today = startOfDay(now);

    switch (quickFilter) {
      case 'today':
        return { from: today, to: endOfDay(now) };
      case 'yesterday':
        return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case 'last7':
        return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case 'last30':
        return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
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

  // Label para o botão do calendário
  const calendarLabel = useMemo(() => {
    if (quickFilter !== 'all') return null;
    if (!dateRange?.from) return 'Selecionar período';
    if (!dateRange.to || dateRange.from.toDateString() === dateRange.to.toDateString()) {
      return format(dateRange.from, "dd/MM/yyyy", { locale: ptBR });
    }
    return `${format(dateRange.from, "dd/MM/yy", { locale: ptBR })} → ${format(dateRange.to, "dd/MM/yy", { locale: ptBR })}`;
  }, [quickFilter, dateRange]);

  const isDateFilterActive = quickFilter !== 'all' || !!dateRange?.from;

  const quickFilterLabels: Record<QuickFilter, string> = {
    all: 'Qualquer data',
    today: 'Hoje',
    yesterday: 'Ontem',
    last7: 'Últimos 7 dias',
    last30: 'Últimos 30 dias',
  };

  // Função para alternar ordenação de uma coluna
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  // Ícone de ordenação para o cabeçalho da tabela
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />;
    }
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

      const matchesMarketplace =
        marketplaceFilter === 'all' || p.marketplace === marketplaceFilter;

      const productCategory = p.category || p.categoria || '';
      const matchesCategory =
        categoryFilter === 'all' || productCategory === categoryFilter;

      // Filtro de data
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

    // Aplica ordenação
    if (sortField) {
      result = [...result].sort((a, b) => {
        let valA = 0;
        let valB = 0;

        if (sortField === 'price') {
          valA = getCurrentPrice(a) ?? 0;
          valB = getCurrentPrice(b) ?? 0;
        } else if (sortField === 'discount') {
          valA = getDiscount(a) ?? 0;
          valB = getDiscount(b) ?? 0;
        }

        return sortDirection === 'asc' ? valA - valB : valB - valA;
      });
    }

    return result;
  }, [products, search, marketplaceFilter, categoryFilter, sortField, sortDirection, quickFilter, dateRange]);

  const paginatedProducts = filteredProducts.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const totalPages = Math.ceil(filteredProducts.length / pageSize);

  const handleSelectAll = () => {
    if (selectedIds.length === paginatedProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedProducts.map(p => p.id));
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
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

      if (data.success && data.data) {
        setOriginalProductData(data.data);
      }
    } catch (error) {
      setOriginalProductData(product);
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({
        title: 'Link copiado!',
        description: 'Link de afiliado copiado para a área de transferência',
      });
    } catch (error) {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o link',
        variant: 'destructive',
      });
    }
  };

  const handleCleanup = async () => {
    setIsCleaningUp(true);

    try {
      let deleted = 0;

      switch (cleanupType) {
        case 'all':
          const resAll = await productsService.deleteAll();
          deleted = resAll.data?.deleted || 0;
          break;

        case 'marketplace':
          const mpKey = cleanupMarketplace === 'mercadolivre' ? 'ML' : cleanupMarketplace;
          const resMP = await productsService.deleteByMarketplace(mpKey as any);
          deleted = resMP.data?.deleted || 0;
          break;

        case 'old':
          const resOld = await productsService.deleteOld(cleanupDays);
          deleted = resOld.data?.deleted || 0;
          break;

        case 'selected':
          if (selectedIds.length > 0) {
            await deleteProducts(selectedIds);
            deleted = selectedIds.length;
            setSelectedIds([]);
          }
          break;
      }

      await refreshProducts();

      toast({
        title: 'Limpeza concluída',
        description: `${deleted} produtos removidos`,
      });

      setCleanupDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Erro na limpeza',
        description: 'Falha ao excluir produtos',
        variant: 'destructive',
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  const getCleanupTitle = () => {
    switch (cleanupType) {
      case 'all':
        return 'Deletar todos os produtos';
      case 'marketplace':
        return `Deletar produtos do ${cleanupMarketplace}`;
      case 'old':
        return `Deletar produtos com mais de ${cleanupDays} dias`;
      case 'selected':
        return `Deletar ${selectedIds.length} produtos selecionados`;
    }
  };

  const formatDate = (dateString: string | Date) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const displayProduct = originalProductData || selectedProduct;
  const affiliateLink = displayProduct?.link_afiliado || displayProduct?.affiliateLink;

  const clearDateFilter = () => {
    setQuickFilter('all');
    setDateRange(undefined);
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Gerenciamento</h1>
          <p className="text-muted-foreground">
            {formatNumber(filteredProducts.length)} produtos encontrados
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={refreshProducts}
            disabled={isLoading}
            className="gap-2"
          >
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
                <Trash2 className="w-4 h-4 mr-2" />
                Deletar todos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setCleanupType('marketplace'); setCleanupDialogOpen(true); }}>
                <Filter className="w-4 h-4 mr-2" />
                Deletar por marketplace
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setCleanupType('old'); setCleanupDialogOpen(true); }}>
                <AlertTriangle className="w-4 h-4 mr-2" />
                Deletar produtos antigos
              </DropdownMenuItem>
              {selectedIds.length > 0 && (
                <DropdownMenuItem onClick={() => { setCleanupType('selected'); setCleanupDialogOpen(true); }}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Deletar selecionados ({selectedIds.length})
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ABAS */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="products" className="gap-2">
            <Filter className="w-4 h-4" />
            Produtos
          </TabsTrigger>
          <TabsTrigger value="coupons" className="gap-2">
            <Ticket className="w-4 h-4" />
            Cupons
          </TabsTrigger>
        </TabsList>

        {/* ABA PRODUTOS */}
        <TabsContent value="products" className="space-y-4">
          {/* FILTROS */}
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* Linha 1: busca + marketplace + categoria + ordenação */}
              <div className="flex gap-3 flex-wrap items-center">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto..."
                    value={search}
                    onChange={e => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-10"
                  />
                </div>

                <Select
                  value={marketplaceFilter}
                  onValueChange={v => {
                    setMarketplaceFilter(v as any);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-48">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Marketplace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os marketplaces</SelectItem>
                    <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                    <SelectItem value="amazon">Amazon</SelectItem>
                    <SelectItem value="shopee">Shopee</SelectItem>
                    <SelectItem value="magalu">Magalu</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={categoryFilter}
                  onValueChange={v => {
                    setCategoryFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-52">
                    <Tag className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {availableCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={sortField === 'price' ? `price_${sortDirection}` : sortField === 'discount' ? `discount_${sortDirection}` : 'none'}
                  onValueChange={v => {
                    if (v === 'none') {
                      setSortField(null);
                    } else {
                      const [field, dir] = v.split('_') as [SortField, SortDirection];
                      setSortField(field);
                      setSortDirection(dir);
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
                    <SelectItem value="none">
                      <span className="flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                        Sem ordenação
                      </span>
                    </SelectItem>
                    <SelectItem value="price_asc">
                      <span className="flex items-center gap-2">
                        <ArrowUp className="w-4 h-4 text-green-600" />
                        Menor preço primeiro
                      </span>
                    </SelectItem>
                    <SelectItem value="price_desc">
                      <span className="flex items-center gap-2">
                        <ArrowDown className="w-4 h-4 text-green-600" />
                        Maior preço primeiro
                      </span>
                    </SelectItem>
                    <SelectItem value="discount_desc">
                      <span className="flex items-center gap-2">
                        <ArrowDown className="w-4 h-4 text-orange-500" />
                        Maior desconto primeiro
                      </span>
                    </SelectItem>
                    <SelectItem value="discount_asc">
                      <span className="flex items-center gap-2">
                        <ArrowUp className="w-4 h-4 text-orange-500" />
                        Menor desconto primeiro
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Linha 2: filtro de data */}
              <div className="flex gap-2 flex-wrap items-center">
                {/* Quick filters */}
                {(['all', 'today', 'yesterday', 'last7', 'last30'] as QuickFilter[]).map(q => (
                  <Button
                    key={q}
                    variant={quickFilter === q ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 text-xs font-medium"
                    onClick={() => {
                      setQuickFilter(q);
                      setDateRange(undefined);
                      setPage(1);
                    }}
                  >
                    {quickFilterLabels[q]}
                  </Button>
                ))}

                {/* Separador visual */}
                <div className="h-6 w-px bg-border mx-1" />

                {/* Calendário de range personalizado */}
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={quickFilter === 'all' && dateRange?.from ? 'default' : 'outline'}
                      size="sm"
                      className="h-9 gap-2 text-xs font-medium min-w-[160px] justify-start"
                    >
                      <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">
                        {calendarLabel || 'Período personalizado'}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                    <div className="p-3 border-b">
                      <p className="text-sm font-medium">Selecionar período</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Clique em duas datas para definir o intervalo
                      </p>
                    </div>
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => {
                        setDateRange(range);
                        setQuickFilter('all');
                        setPage(1);
                        if (range?.from && range?.to) {
                          setCalendarOpen(false);
                        }
                      }}
                      locale={ptBR}
                      numberOfMonths={2}
                      disabled={{ after: new Date() }}
                      initialFocus
                    />
                    {dateRange?.from && (
                      <div className="p-3 border-t flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {dateRange.from && format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })}
                          {dateRange.to && ` → ${format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { setDateRange(undefined); setPage(1); }}
                        >
                          Limpar
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Badges de filtros ativos */}
              {(categoryFilter !== 'all' || sortField || isDateFilterActive) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {categoryFilter !== 'all' && (
                    <Badge
                      variant="secondary"
                      className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                      onClick={() => { setCategoryFilter('all'); setPage(1); }}
                    >
                      <Tag className="w-3 h-3" />
                      {categoryFilter}
                      <X className="w-3 h-3 ml-0.5" />
                    </Badge>
                  )}

                  {sortField && (
                    <Badge
                      variant="secondary"
                      className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                      onClick={() => { setSortField(null); setPage(1); }}
                    >
                      {sortField === 'price' && sortDirection === 'asc' && <><ArrowUp className="w-3 h-3" /> Menor preço</>}
                      {sortField === 'price' && sortDirection === 'desc' && <><ArrowDown className="w-3 h-3" /> Maior preço</>}
                      {sortField === 'discount' && sortDirection === 'desc' && <><ArrowDown className="w-3 h-3" /> Maior desconto</>}
                      {sortField === 'discount' && sortDirection === 'asc' && <><ArrowUp className="w-3 h-3" /> Menor desconto</>}
                      <X className="w-3 h-3 ml-0.5" />
                    </Badge>
                  )}

                  {isDateFilterActive && (
                    <Badge
                      variant="secondary"
                      className="gap-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                      onClick={clearDateFilter}
                    >
                      <CalendarDays className="w-3 h-3" />
                      {quickFilter !== 'all' ? quickFilterLabels[quickFilter] : calendarLabel}
                      <X className="w-3 h-3 ml-0.5" />
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* TABELA */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.length === paginatedProducts.length && paginatedProducts.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Imagem</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Marketplace</TableHead>
                    <TableHead>Status</TableHead>

                    <TableHead
                      className="text-right cursor-pointer select-none group"
                      onClick={() => handleSort('price')}
                    >
                      <span className="inline-flex items-center justify-end w-full gap-1 hover:text-foreground transition-colors">
                        Preço
                        <SortIcon field="price" />
                      </span>
                    </TableHead>

                    <TableHead
                      className="text-right cursor-pointer select-none group"
                      onClick={() => handleSort('discount')}
                    >
                      <span className="inline-flex items-center justify-end w-full gap-1 hover:text-foreground transition-colors">
                        Desconto
                        <SortIcon field="discount" />
                      </span>
                    </TableHead>

                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedProducts.map(product => {
                    const currentPriceCents = getCurrentPrice(product);
                    const oldPriceCents = getOldPrice(product);
                    const discount = getDiscount(product);

                    const formattedCurrentPrice = formatCurrency(currentPriceCents);
                    const formattedOldPrice = formatCurrency(oldPriceCents);

                    return (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleProductClick(product)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(product.id)}
                            onCheckedChange={() => handleSelect(product.id)}
                          />
                        </TableCell>

                        <TableCell>
                          <img
                            src={product.image || '/no-image.png'}
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/no-image.png';
                            }}
                          />
                        </TableCell>

                        <TableCell>
                          <p className="font-medium truncate max-w-xs">
                            {product.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {product.category}
                          </p>
                        </TableCell>

                        <TableCell>
                          <MarketplaceBadge marketplace={product.marketplace} />
                        </TableCell>

                        <TableCell>
                          <StatusBadge status={product.status as ProductStatus} />
                        </TableCell>

                        <TableCell className="text-right">
                          {oldPriceCents > 0 && oldPriceCents > currentPriceCents && (
                            <p className="text-sm line-through text-muted-foreground">
                              {formattedOldPrice}
                            </p>
                          )}
                          <p className="font-bold text-green-600">
                            {formattedCurrentPrice}
                          </p>
                        </TableCell>

                        <TableCell className="text-right">
                          {discount > 0 ? (
                            <span className="text-green-600 font-semibold">
                              -{discount}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              -
                            </span>
                          )}
                        </TableCell>

                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProductClick(product);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {paginatedProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>Nenhum produto encontrado para os filtros selecionados.</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* PAGINAÇÃO */}
              <div className="flex justify-between items-center p-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Página {page} de {totalPages || 1}
                </span>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA CUPONS */}
        <TabsContent value="coupons">
          <Card>
            <CardContent className="p-12 text-center">
              <Ticket className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Cupons em breve</h3>
              <p className="text-muted-foreground">
                A funcionalidade de cupons será implementada em breve
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG DE DETALHES DO PRODUTO */}
      <Dialog open={detailsDialogOpen} onOpenChange={(open) => {
        setDetailsDialogOpen(open);
        if (!open) {
          setOriginalProductData(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          {displayProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl pr-6">Detalhes do Produto</DialogTitle>
                <DialogDescription>
                  Informações completas e link de afiliado
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[calc(85vh-180px)] pr-4">
                <div className="space-y-6">
                  {/* Header com Imagem e Título */}
                  <div className="flex gap-6">
                    <div className="flex-shrink-0">
                      <img
                        src={displayProduct.imagem || displayProduct.image || '/no-image.png'}
                        alt={displayProduct.nome || displayProduct.name}
                        className="w-48 h-48 object-cover rounded-lg border shadow-sm"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/no-image.png';
                        }}
                      />
                    </div>

                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-bold text-lg leading-tight mb-3">
                          {displayProduct.nome || displayProduct.nome_normalizado || displayProduct.name}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          <MarketplaceBadge marketplace={displayProduct.marketplace} />
                          <StatusBadge status={displayProduct.status || 'active'} />
                          {displayProduct.categoria && (
                            <Badge variant="outline" className="gap-1">
                              <Tag className="w-3 h-3" />
                              {displayProduct.categoria}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Preços */}
                      <div className="bg-muted/50 p-4 rounded-lg">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          {displayProduct.preco && (
                            <span className="text-3xl font-bold text-green-600">
                              {displayProduct.preco.startsWith('R$') ? displayProduct.preco : `R$ ${displayProduct.preco}`}
                            </span>
                          )}
                          {displayProduct.preco_anterior && (
                            <span className="text-lg line-through text-muted-foreground">
                              {displayProduct.preco_anterior.startsWith('R$') ? displayProduct.preco_anterior : `R$ ${displayProduct.preco_anterior}`}
                            </span>
                          )}
                          {displayProduct.desconto && (
                            <Badge variant="destructive" className="gap-1">
                              <TrendingDown className="w-3 h-3" />
                              {displayProduct.desconto}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Informações do Produto */}
                  <div className="grid grid-cols-2 gap-4">
                    {displayProduct.vendedor && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5" />
                          Vendedor
                        </Label>
                        <p className="font-medium text-sm">{displayProduct.vendedor}</p>
                      </div>
                    )}

                    {displayProduct.frete && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5" />
                          Frete
                        </Label>
                        <p className="font-medium text-sm">{displayProduct.frete}</p>
                      </div>
                    )}

                    {displayProduct.parcelas && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5" />
                          Parcelamento
                        </Label>
                        <p className="font-medium text-sm">{displayProduct.parcelas}</p>
                      </div>
                    )}

                    {displayProduct.numero_avaliacoes && displayProduct.numero_avaliacoes !== '0' && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5" />
                          Avaliações
                        </Label>
                        <p className="font-medium text-sm">
                          {displayProduct.avaliacao && `${displayProduct.avaliacao} - `}
                          {displayProduct.numero_avaliacoes}
                        </p>
                      </div>
                    )}

                    {displayProduct.porcentagem_vendido && displayProduct.porcentagem_vendido !== 'N/A' && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <ShoppingCart className="w-3.5 h-3.5" />
                          Vendas
                        </Label>
                        <p className="font-medium text-sm">{displayProduct.porcentagem_vendido}</p>
                      </div>
                    )}

                    {displayProduct.tempo_restante && displayProduct.tempo_restante !== 'N/A' && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Tempo Restante
                        </Label>
                        <p className="font-medium text-sm">{displayProduct.tempo_restante}</p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Datas */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {(displayProduct.createdAt || displayProduct.createdat) && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          Criado
                        </Label>
                        <p className="text-xs">{formatDate(displayProduct.createdAt || displayProduct.createdat)}</p>
                      </div>
                    )}

                    {(displayProduct.updatedAt || displayProduct.updatedat) && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          Atualizado
                        </Label>
                        <p className="text-xs">{formatDate(displayProduct.updatedAt || displayProduct.updatedat)}</p>
                      </div>
                    )}

                    {displayProduct.ultima_verificacao && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          Verificado
                        </Label>
                        <p className="text-xs">{formatDate(displayProduct.ultima_verificacao)}</p>
                      </div>
                    )}
                  </div>

                  {/* Link de Afiliado */}
                  {affiliateLink && (
                    <>
                      <Separator />

                      <div className="space-y-3 bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                        <Label className="text-sm font-semibold flex items-center gap-2 text-green-700 dark:text-green-400">
                          <Link2 className="w-4 h-4" />
                          Link de Afiliado
                        </Label>

                        <div className="flex gap-2 items-center">
                          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border bg-background/60 text-sm font-mono text-muted-foreground overflow-hidden select-all cursor-text">
                            <span className="truncate">{affiliateLink}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleCopyLink(affiliateLink)}
                            className="flex-shrink-0"
                            title="Copiar link"
                          >
                            {copiedLink ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            asChild
                            className="flex-shrink-0"
                            title="Abrir link"
                          >
                            <a
                              href={affiliateLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                  Fechar
                </Button>
                {affiliateLink && (
                  <Button asChild>
                    <a
                      href={affiliateLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir Produto
                    </a>
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG DE LIMPEZA */}
      <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {getCleanupTitle()}
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Os produtos serão permanentemente removidos.
            </DialogDescription>
          </DialogHeader>

          {cleanupType === 'marketplace' && (
            <div className="space-y-2">
              <Label>Selecione o marketplace</Label>
              <Select value={cleanupMarketplace} onValueChange={v => setCleanupMarketplace(v as Marketplace)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCleanup}
              disabled={isCleaningUp}
            >
              {isCleaningUp ? 'Excluindo...' : 'Confirmar exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}