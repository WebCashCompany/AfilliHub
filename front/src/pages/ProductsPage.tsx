// src/pages/ProductsPage.tsx - VERSÃO FINAL FUNCIONAL

import { useState, useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Calendar,
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
  ShoppingCart
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { formatNumber, Marketplace, ProductStatus } from '@/lib/mockData';
import { productsService } from '@/api/services/products.service';
import { formatCurrency, getCurrentPrice, getOldPrice, getDiscount } from '@/lib/priceUtils';

type CleanupType = 'all' | 'marketplace' | 'old' | 'selected';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export function ProductsPage() {
  const { products, deleteProducts, refreshProducts, isLoading } = useDashboard();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | Marketplace>('all');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('products');

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
  const [copiedOriginalLink, setCopiedOriginalLink] = useState(false);

  // Estado para armazenar os dados originais do produto
  const [originalProductData, setOriginalProductData] = useState<any>(null);

  const pageSize = 15;

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch =
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase());

      const matchesMarketplace =
        marketplaceFilter === 'all' || p.marketplace === marketplaceFilter;

      return matchesSearch && matchesMarketplace;
    });
  }, [products, search, marketplaceFilter]);

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

  // ✅ BUSCA OS DADOS COMPLETOS DO PRODUTO NO BACKEND
  const handleProductClick = async (product: any) => {
    console.log('📦 Produto do contexto:', product);
    
    setSelectedProduct(product);
    setDetailsDialogOpen(true);
    setCopiedLink(false);
    setCopiedOriginalLink(false);

    // Busca os dados completos do produto no backend
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${product.id}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        console.log('📦 Dados completos do backend:', data.data);
        setOriginalProductData(data.data);
      }
    } catch (error) {
      console.error('❌ Erro ao buscar dados completos:', error);
      // Usa os dados do contexto mesmo se falhar
      setOriginalProductData(product);
    }
  };

  const handleCopyLink = async (link: string, isOriginal = false) => {
    try {
      await navigator.clipboard.writeText(link);
      if (isOriginal) {
        setCopiedOriginalLink(true);
        setTimeout(() => setCopiedOriginalLink(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
      toast({
        title: 'Link copiado!',
        description: isOriginal ? 'Link original copiado' : 'Link de afiliado copiado',
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

  // Formata preço de centavos (129900) para R$ 1.299,00
  const formatPriceFromCents = (price: string | number): string => {
    if (!price) return 'R$ 0,00';
    
    // Se já está formatado (contém vírgula ou ponto), retorna como está
    const priceStr = String(price);
    if (priceStr.includes(',') || priceStr.includes('.')) {
      return priceStr.startsWith('R$') ? priceStr : `R$ ${priceStr}`;
    }
    
    // Converte centavos para reais
    const cents = parseInt(priceStr);
    if (isNaN(cents)) return 'R$ 0,00';
    
    const reais = cents / 100;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(reais);
  };

  // ✅ USA OS DADOS ORIGINAIS SE DISPONÍVEIS
  const displayProduct = originalProductData || selectedProduct;

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
            <CardContent className="p-4 flex gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
                <Input
                  placeholder="Buscar produto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={marketplaceFilter} onValueChange={v => setMarketplaceFilter(v as any)}>
                <SelectTrigger className="w-48">
                  <Filter className="w-4 h-4 mr-2" />
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
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Desconto</TableHead>
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
                  Informações completas e links de afiliado
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
                          <Calendar className="w-3.5 h-3.5" />
                          Criado
                        </Label>
                        <p className="text-xs">{formatDate(displayProduct.createdAt || displayProduct.createdat)}</p>
                      </div>
                    )}

                    {(displayProduct.updatedAt || displayProduct.updatedat) && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          Atualizado
                        </Label>
                        <p className="text-xs">{formatDate(displayProduct.updatedAt || displayProduct.updatedat)}</p>
                      </div>
                    )}

                    {displayProduct.ultima_verificacao && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          Verificado
                        </Label>
                        <p className="text-xs">{formatDate(displayProduct.ultima_verificacao)}</p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Links */}
                  {(displayProduct.link_afiliado || displayProduct.affiliateLink) && (
                    <div className="space-y-3 bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
                      <Label className="text-sm font-semibold flex items-center gap-2 text-green-700 dark:text-green-400">
                        <Link2 className="w-4 h-4" />
                        Link de Afiliado
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={displayProduct.link_afiliado || displayProduct.affiliateLink}
                          readOnly
                          className="font-mono text-xs bg-white dark:bg-background"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopyLink(displayProduct.link_afiliado || displayProduct.affiliateLink, false)}
                          className="flex-shrink-0"
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
                        >
                          <a
                            href={displayProduct.link_afiliado || displayProduct.affiliateLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        💰 Use este link para receber comissão nas vendas
                      </p>
                    </div>
                  )}

                  {displayProduct.link_original && (
                    <div className="space-y-2 bg-muted/30 p-4 rounded-lg">
                      <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Link2 className="w-3.5 h-3.5" />
                        Link Original (sem afiliação)
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={displayProduct.link_original}
                          readOnly
                          className="font-mono text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyLink(displayProduct.link_original, true)}
                          className="flex-shrink-0"
                        >
                          {copiedOriginalLink ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          className="flex-shrink-0"
                        >
                          <a
                            href={displayProduct.link_original}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ID do Produto */}
                  {displayProduct._id && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">ID MongoDB</Label>
                      <code className="block text-xs bg-muted p-2 rounded font-mono break-all">
                        {displayProduct._id}
                      </code>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                  Fechar
                </Button>
                {(displayProduct.link_afiliado || displayProduct.affiliateLink) && (
                  <Button asChild>
                    <a
                      href={displayProduct.link_afiliado || displayProduct.affiliateLink}
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