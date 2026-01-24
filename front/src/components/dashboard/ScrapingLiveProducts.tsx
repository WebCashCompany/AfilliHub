// src/components/dashboard/ScrapingLiveProducts.tsx

import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/priceUtils';
import { Sparkles } from 'lucide-react';

interface LiveProduct {
  name: string;
  image: string;
  price: number;
  oldPrice: number;
  discount: number;
}

interface ScrapingLiveProductsProps {
  products: LiveProduct[];
}

export function ScrapingLiveProducts({ products }: ScrapingLiveProductsProps) {
  if (!products || products.length === 0) return null;

  // Mostra apenas os últimos 3 produtos
  const displayProducts = products.slice(-3).reverse();

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="w-4 h-4 text-yellow-500 animate-pulse" />
        <span>Últimas ofertas encontradas</span>
      </div>
      
      <div className="space-y-2">
        {displayProducts.map((product, index) => (
          <div
            key={index}
            className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border/50 animate-in fade-in slide-in-from-bottom-2 duration-500"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <img
              src={product.image}
              alt={product.name}
              className="w-12 h-12 rounded object-cover"
            />
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{product.name}</p>
              <div className="flex items-center gap-2 mt-1">
                {product.oldPrice > product.price && (
                  <span className="text-xs line-through text-muted-foreground">
                    {formatCurrency(product.oldPrice)}
                  </span>
                )}
                <span className="text-sm font-bold text-green-600">
                  {formatCurrency(product.price)}
                </span>
              </div>
            </div>
            
            <Badge 
              variant="secondary" 
              className="bg-green-500/10 text-green-600 border-green-500/20"
            >
              -{product.discount}%
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}