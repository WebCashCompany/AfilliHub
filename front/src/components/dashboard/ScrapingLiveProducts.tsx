import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Package } from 'lucide-react';

interface LiveProduct {
  name: string;
  image: string;
  price: number;
  oldPrice: number;
  discount: number;
  status: 'processing' | 'saved' | 'error';
}

interface ScrapingLiveProductsProps {
  products: LiveProduct[];
}

export function ScrapingLiveProducts({ products }: ScrapingLiveProductsProps) {
  if (!products || products.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Aguardando produtos...
        </p>
      </div>
    );
  }

  const formatPrice = (cents: number) => {
    const reais = cents / 100;
    return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Coletando agora
        </h4>
        <span className="text-xs text-muted-foreground">
          {products.length} produto{products.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {products.slice().reverse().map((product, index) => (
          <Card
            key={index}
            className={`p-3 transition-all duration-300 border-l-4 ${
              product.status === 'processing'
                ? 'border-l-blue-500 bg-blue-500/5 animate-pulse-slow'
                : product.status === 'saved'
                ? 'border-l-green-500 bg-green-500/5'
                : 'border-l-red-500 bg-red-500/5'
            }`}
          >
            <div className="flex gap-3">
              {/* Imagem */}
              <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted relative">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%23888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"%3E%3C/path%3E%3Cpolyline points="3.27 6.96 12 12.01 20.73 6.96"%3E%3C/polyline%3E%3Cline x1="12" y1="22.08" x2="12" y2="12"%3E%3C/line%3E%3C/svg%3E';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                )}
                
                {/* Status Icon Overlay */}
                <div className="absolute top-1 right-1">
                  {product.status === 'processing' && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    </div>
                  )}
                  {product.status === 'saved' && (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h5 className="text-xs font-medium line-clamp-2 mb-1.5">
                  {product.name}
                </h5>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 h-auto">
                    {product.discount}% OFF
                  </Badge>
                  
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-bold text-green-600">
                      {formatPrice(product.price)}
                    </span>
                    {product.oldPrice > product.price && (
                      <span className="text-[10px] text-muted-foreground line-through">
                        {formatPrice(product.oldPrice)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status text */}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {product.status === 'processing' && 'Processando...'}
                  {product.status === 'saved' && 'Salvo com sucesso'}
                  {product.status === 'error' && 'Erro ao salvar'}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: hsl(var(--muted));
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.5);
        }
        
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}