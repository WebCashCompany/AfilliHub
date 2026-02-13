import { useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { 
  Trash2, RotateCcw, AlertTriangle, Package, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatNumber } from '@/lib/mockData';

export function TrashPage() {
  const { trashedProducts, restoreProducts, permanentlyDeleteProducts } = useDashboard();
  const { toast } = useToast();
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const paginatedProducts = trashedProducts.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(trashedProducts.length / pageSize);

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

  const handleRestore = () => {
    restoreProducts(selectedIds);
    setSelectedIds([]);
    toast({
      title: "Produtos restaurados!",
      description: `${selectedIds.length} produtos foram restaurados ao catálogo.`,
    });
  };

  const handlePermanentDelete = () => {
    permanentlyDeleteProducts(selectedIds);
    setSelectedIds([]);
    toast({
      title: "Produtos excluídos permanentemente",
      description: `${selectedIds.length} produtos foram removidos definitivamente.`,
      variant: "destructive"
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lixeira</h1>
          <p className="text-muted-foreground">
            Produtos excluídos nos últimos 30 dias
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
          <Trash2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">
            {formatNumber(trashedProducts.length)} itens na lixeira
          </span>
        </div>
      </div>

      {trashedProducts.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Package className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">Lixeira vazia</h3>
              <p className="text-muted-foreground">
                Nenhum produto foi excluído recentemente
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Actions Bar */}
          {selectedIds.length > 0 && (
            <Card className="animate-fade-in">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {selectedIds.length} produtos selecionados
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleRestore} className="gap-2">
                      <RotateCcw className="w-4 h-4" />
                      Restaurar
                    </Button>
                    <Button variant="destructive" onClick={handlePermanentDelete} className="gap-2">
                      <Trash2 className="w-4 h-4" />
                      Excluir Permanentemente
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warning */}
          <div className="flex items-center gap-3 p-4 bg-status-risk/10 border border-status-risk/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-status-risk flex-shrink-0" />
            <div>
              <p className="font-medium text-status-risk">Atenção</p>
              <p className="text-sm text-muted-foreground">
                Itens na lixeira serão removidos permanentemente após 30 dias
              </p>
            </div>
          </div>

          {/* Table */}
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
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead>Excluído em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => (
                    <TableRow key={product.id} className="opacity-75">
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
                          className="w-12 h-12 rounded-lg object-cover bg-muted grayscale"
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
                      <TableCell className="text-right font-medium">
                        {formatCurrency(product.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(product.clicks)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(product.revenue)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date().toLocaleDateString('pt-BR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, trashedProducts.length)} de {trashedProducts.length}
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
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
