// src/components/dashboard/KPICard.tsx
import { cn } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { useEffect, useState } from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  prefix?: string;
  suffix?: string;
  animate?: boolean;
}

export function KPICard({
  title,
  value,
  change,
  changeLabel = 'vs. último período',
  icon: Icon,
  variant = 'default',
  prefix = '',
  suffix = '',
  animate = true,
}: KPICardProps) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : Number(value));

  useEffect(() => {
    if (!animate) return;
    const numValue =
      typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
    const duration = 1000;
    const steps = 30;
    const stepDuration = duration / steps;
    const increment = numValue / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= numValue) {
        setDisplayValue(numValue);
        clearInterval(timer);
      } else {
        setDisplayValue(current);
      }
    }, stepDuration);
    return () => clearInterval(timer);
  }, [value, animate]);

  const gradients = {
    default: 'from-muted to-muted',
    primary: 'from-primary/10 to-primary/5',
    success: 'from-status-active/10 to-status-active/5',
    warning: 'from-amazon/10 to-amazon/5',
    danger: 'from-destructive/10 to-destructive/5',
  };

  const iconColors = {
    default: 'text-muted-foreground',
    primary: 'text-primary',
    success: 'text-status-active',
    warning: 'text-amazon',
    danger: 'text-destructive',
  };

  const formatValue = (val: number) => {
    if (typeof value === 'string' && value.includes('R$')) {
      return `R$ ${val.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    if (typeof value === 'string' && value.includes('%')) {
      return `${val.toFixed(1)}%`;
    }
    return val.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl p-4 md:p-6 bg-card border border-border',
        'card-hover group'
      )}
    >
      {/* Background Gradient */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-50',
          gradients[variant]
        )}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 md:mb-4 gap-2">
          <span className="text-xs md:text-sm font-medium text-muted-foreground leading-tight">
            {title}
          </span>
          <div
            className={cn(
              'p-1.5 md:p-2 rounded-lg bg-background/80 shrink-0',
              'group-hover:scale-110 transition-transform duration-300'
            )}
          >
            <Icon className={cn('w-4 h-4 md:w-5 md:h-5', iconColors[variant])} />
          </div>
        </div>

        {/* Value — menor no mobile para não overflow */}
        <div className="mb-2">
          <span className="text-xl md:text-3xl font-bold tracking-tight break-all">
            {prefix}
            {animate ? formatValue(displayValue) : value}
            {suffix}
          </span>
        </div>

        {/* Change */}
        {change !== undefined && (
          <div className="flex items-center gap-1 flex-wrap">
            {change >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-status-active shrink-0" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-destructive shrink-0" />
            )}
            <span
              className={cn(
                'text-xs md:text-sm font-medium',
                change >= 0 ? 'text-status-active' : 'text-destructive'
              )}
            >
              {change >= 0 ? '+' : ''}
              {change}%
            </span>
            {/* Label oculto no mobile menor para economizar espaço */}
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {changeLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}