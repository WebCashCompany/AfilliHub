import { useState, useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { 
  Package, Search, Plus, Trash2, Shield, ShieldOff, Settings2, 
  ChevronLeft, ChevronRight, Filter, Download
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber, Product, Marketplace, ProductStatus } from '@/lib/mockData';

export function ProductsPage() {
  const { products, deleteProducts, protectProducts, unprotectProducts, runCleanup } = useDashboard();
  const { toast } = useToast();
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | Marketplace>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ProductStatus>('all');
  const [page, setPage] = useState(1);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(7);
  const [cleanupOutOfStock, setCleanupOutOfStock] = useState(true);

  const pageSize = 15;

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                           p.category.toLowerCase().includes(search.toLowerCase());
      const matchesMarketplace = marketplaceFilter === 'all' || p.marketplace === marketplaceFilter;
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesMarketplace && matchesStatus;
    });
  }, [products, search, marketplaceFilter, statusFilter]);

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
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDelete = () => {
    const protectedCount = products.filter(p => selectedIds.includes(p.id) && p.status === 'protected').length;
    const deletedCount = selectedIds.length - protectedCount;
    
    deleteProducts(selectedIds);
    setSelectedIds([]);
    
    toast({
      title: "Produtos excluídos",
      description: `${deletedCount} produtos movidos para a lixeira.${protectedCount > 0 ? ` ${protectedCount} protegidos não foram removidos.` : ''}`,
    });
  };

  const handleProtect = () => {
    protectProducts(selectedIds);
    setSelectedIds([]);
    toast({
      title: "Produtos protegidos",
      description: `${selectedIds.length} produtos agora estão protegidos contra exclusão automática.`,
    });
  };

  const handleUnprotect = () => {
    unprotectProducts(selectedIds);
    setSelectedIds([]);
    toast({
      title: "Proteção removida",
      description: `A proteção foi removida de ${selectedIds.length} produtos.`,
    });
  };

  const handleCleanup = () => {
    const removed = runCleanup(cleanupDays, cleanupOutOfStock);
    setCleanupDialogOpen(false);
    toast({
      title: "Limpeza concluída",
      description: `${removed} produtos foram movidos para a lixeira.`,
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Produtos</h1>
          <p className="text-muted-foreground">
            {formatNumber(filteredProducts.length)} produtos encontrados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <Plus className="w-4 h-4" />
            Adicionar
          </Button>
          <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Settings2 className="w-4 h-4" />
                Limpeza Automática
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configurar Limpeza Automática</DialogTitle>
                <DialogDescription>
                  Remove produtos sem performance que não estão protegidos
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Remover produtos sem cliques há mais de:</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      value={cleanupDays} 
                      onChange={(e) => setCleanupDays(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-muted-foreground">dias</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="outOfStock" 
                    checked={cleanupOutOfStock}
                    onCheckedChange={(checked) => setCleanupOutOfStock(checked as boolean)}
                  />
                  <Label htmlFor="outOfStock">Remover produtos sem estoque</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCleanupDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleCleanup} variant="destructive">Executar Limpeza</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters & Actions Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produtos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={marketplaceFilter} onValueChange={(v) => setMarketplaceFilter(v as any)}>
                <SelectTrigger className="w-40">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Marketplace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                  <SelectItem value="amazon">Amazon</SelectItem>
                  <SelectItem value="magalu">Magalu</SelectItem>
                  <SelectItem value="shopee">Shopee</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="protected">Protegido</SelectItem>
                  <SelectItem value="risk">Em Risco</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 animate-fade-in">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.length} selecionados
                </span>
                <Button variant="outline" size="sm" onClick={handleProtect} className="gap-1">
                  <Shield className="w-4 h-4" />
                  Proteger
                </Button>
                <Button variant="outline" size="sm" onClick={handleUnprotect} className="gap-1">
                  <ShieldOff className="w-4 h-4" />
                  Desproteger
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1">
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={paginatedProducts.length > 0 && selectedIds.length === paginatedProducts.length}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-16">Imagem</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Conversões</TableHead>
                <TableHead className="text-right">Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedProducts.map((product) => (
                <TableRow key={product.id} className="group">
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(product.id)}
                      onCheckedChange={() => handleSelect(product.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <img 
                      src={product.image} 
                      alt={product.name}
                      className="w-12 h-12 rounded-lg object-cover bg-muted"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{product.category}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <MarketplaceBadge marketplace={product.marketplace} size="sm" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={product.status} size="sm" />
                  </TableCell>
                  <TableCell className="text-right">
                    <div>
                      <p className="font-medium">{formatCurrency(product.price)}</p>
                      {product.discount > 0 && (
                        <p className="text-xs text-status-active">-{product.discount}%</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(product.clicks)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(product.conversions)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-status-active">
                    {formatCurrency(product.revenue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, filteredProducts.length)} de {filteredProducts.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm px-2">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
