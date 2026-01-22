// src/pages/ProductsPage.tsx - CORRIGIDO COMPLETAMENTE

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
  Ticket
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatNumber, Marketplace, ProductStatus } from '@/lib/mockData';
import { productsService } from '@/api/services/products.service';

type CleanupType = 'all' | 'marketplace' | 'old' | 'selected';

// ═══════════════════════════════════════════════════════════
// 🔧 FUNÇÕES AUXILIARES DE CONVERSÃO
// ═══════════════════════════════════════════════════════════

/**
 * Converte valores em centavos para formato de moeda brasileira
 * @param value - Valor em centavos (ex: 6678) ou string (ex: "6678")
 * @returns String formatada (ex: "R$ 66,78")
 */
function formatCurrencyFromCents(value: number | string | undefined | null): string {
  if (!value) return 'R$ 0,00';
  
  let cents = 0;
  
  if (typeof value === 'string') {
    // Remove tudo exceto números
    const cleaned = value.replace(/\D/g, '');
    cents = parseInt(cleaned) || 0;
  } else {
    cents = value;
  }
  
  // Converte centavos para reais
  const reais = cents / 100;
  
  return reais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Extrai valor numérico de qualquer formato de preço
 * @param price - Preço em qualquer formato
 * @returns Valor em centavos
 */
function parsePriceToCents(price: any): number {
  if (!price) return 0;
  
  // Se já é número, retorna direto
  if (typeof price === 'number') {
    // Se for muito pequeno (< 1000), assume que está em reais
    return price < 1000 ? price * 100 : price;
  }
  
  // Se é string, remove tudo exceto números
  const cleaned = String(price).replace(/\D/g, '');
  return parseInt(cleaned) || 0;
}

/**
 * Calcula o desconto percentual entre dois valores
 * @param oldPrice - Preço antigo em centavos
 * @param newPrice - Preço novo em centavos
 * @returns Desconto em percentual (0-100)
 */
function calculateDiscount(oldPrice: number, newPrice: number): number {
  if (!oldPrice || !newPrice || oldPrice <= newPrice) return 0;
  return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
}

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

  // Handler de limpeza
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
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedProducts.map(product => {
                    // ═══════════════════════════════════════════════════════════
                    // 🔥 CONVERSÃO DE PREÇOS - PRIORIZA CAMPOS DO SCRAPER
                    // ═══════════════════════════════════════════════════════════
                    
                    const rawProduct = product as any;
                    
                    // PRIORIDADE 1: Campos do scraper (preco_para, preco_de)
                    let currentPriceCents = 0;
                    let oldPriceCents = 0;
                    
                    if (rawProduct.preco_para) {
                      currentPriceCents = parsePriceToCents(rawProduct.preco_para);
                    } else if (rawProduct.price) {
                      currentPriceCents = parsePriceToCents(rawProduct.price);
                    }
                    
                    if (rawProduct.preco_de) {
                      oldPriceCents = parsePriceToCents(rawProduct.preco_de);
                    } else if (rawProduct.oldPrice) {
                      oldPriceCents = parsePriceToCents(rawProduct.oldPrice);
                    } else if (rawProduct.preco_anterior) {
                      oldPriceCents = parsePriceToCents(rawProduct.preco_anterior);
                    }
                    
                    // Calcula desconto real
                    const discountPercent = calculateDiscount(oldPriceCents, currentPriceCents);
                    
                    // Formata preços
                    const formattedCurrentPrice = formatCurrencyFromCents(currentPriceCents);
                    const formattedOldPrice = formatCurrencyFromCents(oldPriceCents);
                    
                    // Imagem
                    const imageSrc =
                      rawProduct.imagem ||
                      rawProduct.image ||
                      rawProduct.thumbnail ||
                      rawProduct.images?.[0] ||
                      '/no-image.png';

                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(product.id)}
                            onCheckedChange={() => handleSelect(product.id)}
                          />
                        </TableCell>

                        <TableCell>
                          <img
                            src={imageSrc}
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/no-image.png';
                            }}
                          />
                        </TableCell>

                        <TableCell>
                          <p className="font-medium truncate max-w-xs">
                            {rawProduct.nome || product.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {rawProduct.categoria || product.category}
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
                          {discountPercent > 0 ? (
                            <span className="text-green-600 font-semibold">
                              -{discountPercent}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              -
                            </span>
                          )}
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