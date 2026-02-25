import { cn } from '@/lib/utils';
import { ProductStatus, getStatusLabel } from '@/lib/mockData';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: ProductStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function StatusBadge({ 
  status, 
  size = 'md',
  showIcon = true 
}: StatusBadgeProps) {
  const colors = {
    active: 'bg-status-active/10 text-status-active border-status-active/20',
    protected: 'bg-status-protected/10 text-status-protected border-status-protected/20',
    risk: 'bg-status-risk/10 text-status-risk border-status-risk/20',
    inactive: 'bg-status-inactive/10 text-status-inactive border-status-inactive/20'
  };

  const icons = {
    active: CheckCircle,
    protected: Shield,
    risk: AlertTriangle,
    inactive: XCircle
  };

  const sizes = {
    sm: 'px-1.5 py-0.5 text-[10px] gap-0.5',   // ← mesmo tamanho do MarketplaceBadge sm
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2'
  };

  const iconSizes = {
    sm: 'w-2.5 h-2.5',   // ← ícone menor proporcional ao text-[10px]
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  };

  const Icon = icons[status];

  return (
    <span className={cn(
      "inline-flex items-center font-medium rounded-full border",
      colors[status],
      sizes[size]
    )}>
      {showIcon && <Icon className={iconSizes[size]} />}
      {getStatusLabel(status)}
    </span>
  );
}