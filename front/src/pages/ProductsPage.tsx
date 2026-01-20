import { useState, useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Card, CardContent } from '@/components/ui/card';
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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  AlertTriangle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber, Marketplace, ProductStatus } from '@/lib/mockData';

export function ProductsPage() {
  const { products, deleteProducts, runCleanup, refreshProducts, isLoading } = useDashboard();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | Marketplace>('all');
  const [page, setPage] = useState(1);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(30);

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

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-muted-foreground">
            {formatNumber(filteredProducts.length)} produtos encontrados
          </p>
        </div>

        <Button
          variant="outline"
          onClick={refreshProducts}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

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
                    checked={selectedIds.length === paginatedProducts.length}
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
                const imageSrc =
                  product.image ||
                  product.thumbnail ||
                  product.images?.[0] ||
                  '/no-image.png';

                const oldPrice = product.oldPrice || product.price;
                const price = product.price;
                const discount =
                  oldPrice > price
                    ? Math.round(((oldPrice - price) / oldPrice) * 100)
                    : 0;

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
                      {oldPrice > price && (
                        <p className="text-sm line-through text-muted-foreground">
                          {formatCurrency(oldPrice)}
                        </p>
                      )}
                      <p className="font-bold text-green-600">
                        {formatCurrency(price)}
                      </p>
                    </TableCell>

                    <TableCell className="text-right">
                      {discount > 0 && (
                        <span className="text-green-600 font-semibold">
                          -{discount}%
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* PAGINAÇÃO */}
          <div className="flex justify-between p-4">
            <span>
              Página {page} de {totalPages}
            </span>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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
