// src/hooks/use-products.ts

/**
 * ═══════════════════════════════════════════════════════════
 * USE PRODUCTS HOOK
 * ═══════════════════════════════════════════════════════════
 * 
 * Hook personalizado para operações com produtos.
 */

import { useState, useCallback } from 'react';
import { productsService } from '@/api/services/products.service';
import type {
  ProductsListParams,
  ProductsListResponse,
  ProductFromDB,
  ApiError,
} from '@/types/api.types';
import { useToast } from '@/hooks/use-toast';

interface UseProductsReturn {
  products: ProductFromDB[];
  total: number;
  isLoading: boolean;
  error: ApiError | null;
  fetchProducts: (params?: ProductsListParams) => Promise<void>;
  searchProducts: (term: string, params?: ProductsListParams) => Promise<void>;
  deleteProduct: (id: string) => Promise<boolean>;
  bulkDelete: (ids: string[]) => Promise<boolean>;
}

export function useProducts(): UseProductsReturn {
  const [products, setProducts] = useState<ProductFromDB[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const { toast } = useToast();

  /**
   * Busca produtos com filtros
   */
  const fetchProducts = useCallback(async (params?: ProductsListParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await productsService.list(params);

      if (response.success && response.data) {
        setProducts(response.data.products);
        setTotal(response.data.total);
      } else {
        throw new Error(response.error || 'Erro ao buscar produtos');
      }
    } catch (err: any) {
      const apiError: ApiError = {
        message: err.message || 'Erro ao buscar produtos',
        code: err.code,
        status: err.status,
      };
      setError(apiError);
      
      toast({
        title: "❌ Erro",
        description: apiError.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Busca produtos por termo
   */
  const searchProducts = useCallback(async (term: string, params?: ProductsListParams) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await productsService.search(term, params);

      if (response.success && response.data) {
        setProducts(response.data.products);
        setTotal(response.data.total);
      } else {
        throw new Error(response.error || 'Erro na busca');
      }
    } catch (err: any) {
      const apiError: ApiError = {
        message: err.message || 'Erro na busca',
        code: err.code,
      };
      setError(apiError);

      toast({
        title: "❌ Erro na busca",
        description: apiError.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Deleta um produto
   */
  const deleteProduct = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await productsService.delete(id);

      if (response.success) {
        setProducts(prev => prev.filter(p => p._id !== id));
        setTotal(prev => prev - 1);

        toast({
          title: "✅ Produto deletado",
          description: "O produto foi removido com sucesso.",
        });

        return true;
      }

      return false;
    } catch (err: any) {
      toast({
        title: "❌ Erro ao deletar",
        description: err.message || 'Erro ao deletar produto',
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  /**
   * Deleta múltiplos produtos
   */
  const bulkDelete = useCallback(async (ids: string[]): Promise<boolean> => {
    try {
      const response = await productsService.bulkDelete(ids);

      if (response.success && response.data) {
        setProducts(prev => prev.filter(p => !ids.includes(p._id)));
        setTotal(prev => prev - response.data!.deleted);

        toast({
          title: "✅ Produtos deletados",
          description: `${response.data.deleted} produtos foram removidos.`,
        });

        return true;
      }

      return false;
    } catch (err: any) {
      toast({
        title: "❌ Erro ao deletar",
        description: err.message || 'Erro ao deletar produtos',
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  return {
    products,
    total,
    isLoading,
    error,
    fetchProducts,
    searchProducts,
    deleteProduct,
    bulkDelete,
  };
}

export default useProducts;