// ─── MobileProductCard.tsx — Premium Version ─────────────────────────────────

import { useState } from 'react';
import {
  Check, Store, Truck, CreditCard, Star, ShoppingCart,
  Clock, Tag, Link2, Copy, ExternalLink, TrendingDown,
  ChevronRight, Package, CalendarDays, Zap, ArrowLeft, Share2,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatCurrency, getCurrentPrice, getOldPrice, getDiscount } from '@/lib/priceUtils';
import { useToast } from '@/hooks/useToast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateString: string | Date | undefined) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return null; }
}

function getMarketplaceAccent(marketplace: string) {
  switch (marketplace) {
    case 'mercadolivre': return { gradient: 'from-yellow-400/8 via-transparent', dot: 'bg-yellow-400', border: 'border-yellow-200/40 dark:border-yellow-900/30' };
    case 'amazon':       return { gradient: 'from-orange-400/8 via-transparent', dot: 'bg-orange-400', border: 'border-orange-200/40 dark:border-orange-900/30' };
    case 'shopee':       return { gradient: 'from-rose-400/8 via-transparent',   dot: 'bg-rose-400',   border: 'border-rose-200/40 dark:border-rose-900/30' };
    case 'magalu':       return { gradient: 'from-blue-400/8 via-transparent',   dot: 'bg-blue-400',   border: 'border-blue-200/40 dark:border-blue-900/30' };
    default:             return { gradient: 'from-muted/20 via-transparent',      dot: 'bg-muted-foreground', border: 'border-border' };
  }
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────

export function MobileProductCard({
  product,
  selected,
  onSelect,
  onClick,
  index = 0,
}: {
  product: any;
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
  index?: number;
}) {
  const currentPriceCents = getCurrentPrice(product);
  const oldPriceCents = getOldPrice(product);
  const discount = getDiscount(product);
  const accent = getMarketplaceAccent(product.marketplace);
  const hasDiscount = discount > 0;
  const hasPriceReduction = oldPriceCents > 0 && oldPriceCents > currentPriceCents;

  return (
    <div
      style={{ animationDelay: `${index * 35}ms` }}
      className={`
        group relative flex rounded-2xl overflow-hidden bg-card
        transition-all duration-200 cursor-pointer
        animate-in fade-in slide-in-from-bottom-2
        active:scale-[0.985] active:brightness-95
        ${selected
          ? 'shadow-lg ring-1 ring-primary/30 border border-primary/30'
          : `border ${accent.border} shadow-sm hover:shadow-md`
        }
      `}
      onClick={onClick}
    >
      {/* Marketplace gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} pointer-events-none`} />

      {/* Selection stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl transition-all duration-200 ${selected ? 'bg-primary' : 'bg-transparent'}`} />

      {/* ── IMAGE BLOCK ── */}
      <div className="relative flex-shrink-0 p-3 pl-4">
        {/* Checkbox */}
        <div
          className="absolute top-2 left-2 z-20"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <div className={`
            w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150
            ${selected
              ? 'bg-primary border-primary scale-105'
              : 'border-border/50 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100'
            }
          `}>
            {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
          </div>
        </div>

        {/* Image */}
        <div className="relative mt-1 w-[72px] h-[72px]">
          <img
            src={product.image || '/no-image.png'}
            alt={product.name}
            className="w-full h-full object-cover rounded-xl border border-border/20 shadow-sm"
            onError={(e) => { (e.target as HTMLImageElement).src = '/no-image.png'; }}
          />
          {hasDiscount && (
            <div className="absolute -top-2 -right-2 min-w-[30px] h-5 bg-rose-500 text-white text-[9px] font-black px-1.5 rounded-full flex items-center justify-center shadow-md shadow-rose-500/30 leading-none">
              -{discount}%
            </div>
          )}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-between gap-1.5">
        {/* Name */}
        <p className="text-[13px] font-semibold leading-snug line-clamp-2 text-foreground tracking-tight">
          {product.name}
        </p>

        {/* Badges — both size="sm" = identical px-1.5 py-0.5 text-[10px] */}
        <div className="flex items-center gap-1 flex-wrap">
          <MarketplaceBadge marketplace={product.marketplace} size="sm" />
          {product.category && (
            <StatusBadge status={product.status} size="sm" showIcon={false} />
          )}
          {product.category && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-muted/70 text-muted-foreground border border-border/60 whitespace-nowrap leading-none">
              <Tag className="w-2.5 h-2.5 flex-shrink-0" />
              {product.category}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-end justify-between gap-2">
          <div>
            {hasPriceReduction && (
              <p className="text-[10px] line-through text-muted-foreground/60 leading-none mb-0.5">
                {formatCurrency(oldPriceCents)}
              </p>
            )}
            <p className={`text-[15px] font-black leading-none tracking-tight ${hasDiscount ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
              {formatCurrency(currentPriceCents)}
            </p>
          </div>
          <div className="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0">
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PRODUCT DETAIL SHEET ─────────────────────────────────────────────────────

export function MobileProductDetailSheet({
  open,
  onClose,
  displayProduct,
}: {
  open: boolean;
  onClose: () => void;
  displayProduct: any;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!displayProduct) return null;

  const affiliateLink = displayProduct?.link_afiliado || displayProduct?.affiliateLink;
  const name = displayProduct.nome || displayProduct.nome_normalizado || displayProduct.name;
  const image = displayProduct.imagem || displayProduct.image;
  const accent = getMarketplaceAccent(displayProduct.marketplace);

  const rawPrice = displayProduct.preco;
  const rawOldPrice = displayProduct.preco_anterior;
  const priceStr = rawPrice ? (rawPrice.startsWith?.('R$') ? rawPrice : `R$ ${rawPrice}`) : null;
  const oldPriceStr = rawOldPrice ? (rawOldPrice.startsWith?.('R$') ? rawOldPrice : `R$ ${rawOldPrice}`) : null;

  const handleCopy = async () => {
    if (!affiliateLink) return;
    try {
      await navigator.clipboard.writeText(affiliateLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: 'Link copiado!', description: 'Link de afiliado copiado para a área de transferência' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  type InfoTile = { icon: any; label: string; value: string };
  const infoTiles: InfoTile[] = ([
    displayProduct.vendedor && { icon: Store, label: 'Vendedor', value: displayProduct.vendedor },
    displayProduct.frete && { icon: Truck, label: 'Frete', value: displayProduct.frete },
    displayProduct.parcelas && { icon: CreditCard, label: 'Parcelamento', value: displayProduct.parcelas },
    displayProduct.numero_avaliacoes && displayProduct.numero_avaliacoes !== '0' && {
      icon: Star, label: 'Avaliações',
      value: [displayProduct.avaliacao, displayProduct.numero_avaliacoes].filter(Boolean).join(' · '),
    },
    displayProduct.porcentagem_vendido && displayProduct.porcentagem_vendido !== 'N/A' && {
      icon: ShoppingCart, label: 'Vendas', value: displayProduct.porcentagem_vendido,
    },
    displayProduct.tempo_restante && displayProduct.tempo_restante !== 'N/A' && {
      icon: Clock, label: 'Tempo restante', value: displayProduct.tempo_restante,
    },
    displayProduct.categoria && { icon: Tag, label: 'Categoria', value: displayProduct.categoria },
  ] as any[]).filter(Boolean) as InfoTile[];

  const timestamps = ([
    (displayProduct.createdAt || displayProduct.createdat) && {
      icon: CalendarDays, label: 'Adicionado',
      value: formatDate(displayProduct.createdAt || displayProduct.createdat),
    },
    (displayProduct.updatedAt || displayProduct.updatedat) && {
      icon: Zap, label: 'Atualizado',
      value: formatDate(displayProduct.updatedAt || displayProduct.updatedat),
    },
    displayProduct.ultima_verificacao && {
      icon: Check, label: 'Verificado',
      value: formatDate(displayProduct.ultima_verificacao),
    },
  ] as any[]).filter(Boolean) as { icon: any; label: string; value: string | null }[];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-[28px] overflow-hidden border-0"
        style={{ height: '93dvh', maxHeight: '93dvh' }}
      >
        <div className="flex flex-col h-full bg-background">

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-8 h-[3px] rounded-full bg-foreground/10" />
          </div>

          {/* Header bar */}
          <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-[13px] text-muted-foreground font-medium active:opacity-60 transition-opacity"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            {affiliateLink && (
              <button
                onClick={handleCopy}
                className="w-8 h-8 rounded-full bg-muted/70 flex items-center justify-center active:scale-90 transition-transform"
              >
                {copied
                  ? <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={3} />
                  : <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                }
              </button>
            )}
          </div>

          {/* Hero card */}
          <div className={`mx-4 mb-3 rounded-2xl border border-border/50 bg-gradient-to-br ${accent.gradient} overflow-hidden flex-shrink-0`}>
            <div className="flex gap-3 p-4">
              {/* Image */}
              <div className="relative flex-shrink-0">
                <div className="w-[84px] h-[84px] rounded-xl overflow-hidden border border-border/20 shadow-md bg-muted">
                  {(!imgError && image) ? (
                    <img
                      src={image}
                      alt={name}
                      className="w-full h-full object-cover"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 ${accent.dot} rounded-full border-2 border-background shadow`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-[14px] font-bold leading-snug line-clamp-3 tracking-tight">
                  {name}
                </p>
                {/* size="sm" on both so they're identical height */}
                <div className="flex items-center gap-1 flex-wrap">
                  <MarketplaceBadge marketplace={displayProduct.marketplace} size="sm" />
                  <StatusBadge status={displayProduct.status || 'active'} size="sm" />
                  {displayProduct.categoria && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-muted/70 text-muted-foreground border border-border/60 whitespace-nowrap leading-none">
                      <Tag className="w-2.5 h-2.5" />
                      {displayProduct.categoria}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-4 pb-8 space-y-3">

              {/* Price card */}
              {priceStr && (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/40 p-4 relative overflow-hidden">
                  <div className="absolute -right-5 -top-5 w-20 h-20 rounded-full bg-emerald-300/20 dark:bg-emerald-500/10 pointer-events-none" />
                  <div className="absolute -right-1 bottom-2 w-10 h-10 rounded-full bg-emerald-300/10 pointer-events-none" />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70 dark:text-emerald-500/60">
                        Preço atual
                      </p>
                      {oldPriceStr && (
                        <p className="text-xs line-through text-muted-foreground/60 leading-none">
                          {oldPriceStr}
                        </p>
                      )}
                      <p className="text-[32px] font-black text-emerald-600 dark:text-emerald-400 tracking-tight leading-none">
                        {priceStr}
                      </p>
                      {displayProduct.parcelas && (
                        <p className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1.5">
                          <CreditCard className="w-3 h-3" />
                          {displayProduct.parcelas}
                        </p>
                      )}
                    </div>

                    {displayProduct.desconto && (
                      <div className="flex-shrink-0 flex flex-col items-center bg-rose-500 text-white rounded-xl px-3 py-2.5 shadow-md shadow-rose-500/25">
                        <TrendingDown className="w-3.5 h-3.5 mb-0.5" />
                        <span className="text-sm font-black leading-none">{displayProduct.desconto}</span>
                        <span className="text-[9px] uppercase tracking-wider opacity-75 mt-0.5">off</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Info tiles grid */}
              {infoTiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {infoTiles.map((tile, i) => {
                    const Icon = tile.icon;
                    const isLast = i === infoTiles.length - 1 && infoTiles.length % 2 !== 0;
                    return (
                      <div
                        key={i}
                        className={`rounded-xl border border-border/50 bg-card p-3 space-y-1.5 ${isLast ? 'col-span-2' : ''}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                            <Icon className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {tile.label}
                          </span>
                        </div>
                        <p className="text-[13px] font-semibold text-foreground line-clamp-2 leading-snug">
                          {tile.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Timestamps */}
              {timestamps.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/40 overflow-hidden">
                  {timestamps.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                          {item.label}
                        </div>
                        <span className="text-xs font-semibold text-foreground">{item.value}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Affiliate link block */}
              {affiliateLink && (
                <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/40">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <Link2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-sm font-bold">Link de Afiliado</span>
                    <span className="ml-auto text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                      Ativo
                    </span>
                  </div>

                  <div className="px-4 py-3">
                    <p className="text-[11px] font-mono text-muted-foreground break-all line-clamp-2 leading-relaxed select-all">
                      {affiliateLink}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 border-t border-border/40">
                    <button
                      onClick={handleCopy}
                      className={`flex items-center justify-center gap-2 py-3.5 text-sm font-semibold border-r border-border/40 transition-all active:scale-95 ${copied ? 'text-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/20' : 'text-foreground hover:bg-muted/50'}`}
                    >
                      {copied ? <><Check className="w-4 h-4" strokeWidth={3} />Copiado!</> : <><Copy className="w-4 h-4" />Copiar</>}
                    </button>
                    <a
                      href={affiliateLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-primary hover:bg-muted/50 transition-colors active:scale-95"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir
                    </a>
                  </div>
                </div>
              )}

              {/* Main CTA */}
              {affiliateLink && (
                <a
                  href={affiliateLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
                >
                  <Zap className="w-4 h-4" />
                  Ver oferta agora
                  <ChevronRight className="w-4 h-4 ml-auto opacity-60" />
                </a>
              )}

            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}