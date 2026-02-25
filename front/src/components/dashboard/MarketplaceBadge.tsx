import { cn } from '@/lib/utils';
import { Marketplace, getMarketplaceName } from '@/lib/mockData';

interface MarketplaceBadgeProps {
  marketplace: Marketplace;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function MarketplaceBadge({ 
  marketplace, 
  size = 'md',
  showLabel = true 
}: MarketplaceBadgeProps) {
  const colors = {
    mercadolivre: 'bg-ml text-ml-foreground',
    amazon: 'bg-amazon text-amazon-foreground',
    magalu: 'bg-magalu text-magalu-foreground',
    shopee: 'bg-shopee text-shopee-foreground'
  };

  const sizes = {
    sm: 'px-1.5 py-0.5 text-[10px]',   // ← mesmo tamanho do StatusBadge sm
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm'
  };

  const abbreviations = {
    mercadolivre: 'ML',
    amazon: 'AMZ',
    magalu: 'MAG',
    shopee: 'SHP'
  };

  return (
    <span className={cn(
      "inline-flex items-center font-semibold rounded-md whitespace-nowrap",
      colors[marketplace],
      sizes[size]
    )}>
      {showLabel ? getMarketplaceName(marketplace) : abbreviations[marketplace]}
    </span>
  );
}