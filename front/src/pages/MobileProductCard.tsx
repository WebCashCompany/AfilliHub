// ─── MobileProductCard.tsx — Premium Version ─────────────────────────────────

import { useState } from 'react';
import {
  Check, Store, Truck, CreditCard, Star, ShoppingCart,
  Clock, Tag, Link2, Copy, ExternalLink, TrendingDown,
  ChevronRight, Package, CalendarDays, Zap,
  Share2, ArrowLeft,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatCurrency, getCurrentPrice, getOldPrice, getDiscount } from '@/lib/priceUtils';
import { useToast } from '@/hooks/useToast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    case 'mercadolivre': return { bg: 'from-yellow-500/8 to-transparent', dot: 'bg-yellow-400', border: 'border-yellow-200/40 dark:border-yellow-900/30' };
    case 'amazon':       return { bg: 'from-orange-500/8 to-transparent', dot: 'bg-orange-400', border: 'border-orange-200/40 dark:border-orange-900/30' };
    case 'shopee':       return { bg: 'from-rose-500/8 to-transparent',   dot: 'bg-rose-400',   border: 'border-rose-200/40 dark:border-rose-900/30' };
    case 'magalu':       return { bg: 'from-blue-500/8 to-transparent',   dot: 'bg-blue-400',   border: 'border-blue-200/40 dark:border-blue-900/30' };
    default:             return { bg: 'from-muted/30 to-transparent',      dot: 'bg-muted-foreground', border: 'border-border' };
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
      style={{ animationDelay: `${index * 40}ms` }}
      className={`
        group relative flex gap-0 rounded-2xl border overflow-hidden
        transition-all duration-200 cursor-pointer
        animate-in fade-in slide-in-from-bottom-2
        active:scale-[0.985] active:brightness-95
        ${selected
          ? 'border-primary/40 shadow-md shadow-primary/10 ring-1 ring-primary/20'
          : `border ${accent.border} shadow-sm hover:shadow-md hover:border-border`
        }
      `}
      onClick={onClick}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${accent.bg} pointer-events-none`} />
      <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 rounded-l-2xl ${selected ? 'bg-primary' : 'bg-transparent'}`} />

      {/* Image block */}
      <div className="relative flex-shrink-0 p-3 pl-4">
        <div
          className="absolute top-2.5 left-2 z-20"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <div className={`
            w-5 h-5 rounded-full border-2 flex items-center justify-center
            transition-all duration-200 shadow-sm
            ${selected
              ? 'bg-primary border-primary scale-110'
              : 'border-muted-foreground/30 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100'
            }
          `}>
            {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3.5} />}
          </div>
        </div>

        <div className="relative w-[72px] h-[72px] mt-1">
          <img
            src={product.image || '/no-image.png'}
            alt={product.name}
            className="w-full h-full object-cover rounded-xl border border-border/30"
            onError={(e) => { (e.target as HTMLImageElement).src = '/no-image.png'; }}
          />
          {hasDiscount && (
            <div className="absolute -top-2 -right-2 min-w-[32px] h-[22px] bg-rose-500 text-white text-[10px] font-black px-1.5 rounded-full flex items-center justify-center shadow-md shadow-rose-500/30 leading-none">
              -{discount}%
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-between gap-1.5">
        <p className="text-[13px] font-semibold leading-snug line-clamp-2 text-foreground tracking-tight">
          {product.name}
        </p>

        {/* Badges — uniform size */}
        <div className="flex items-center gap-1 flex-wrap">
          <MarketplaceBadge marketplace={product.marketplace} size="sm" />
          {product.category && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/50 leading-none whitespace-nowrap">
              <Tag className="w-2.5 h-2.5 flex-shrink-0" />
              {product.category}
            </span>
          )}
        </div>

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
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge status={product.status} size="sm" />
            <div className="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0">
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </div>
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

  // Format price: ensure "R$ 32,00" style — parse number and reformat
  function formatBRL(raw: string | undefined | null): string | null {
    if (!raw) return null;
    const cleaned = String(raw).replace(/[R$\s]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (isNaN(num)) return raw.startsWith?.('R$') ? raw : `R$ ${raw}`;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  const priceStr = formatBRL(rawPrice);
  const oldPriceStr = formatBRL(rawOldPrice);

  const handleCopy = async () => {
    if (!affiliateLink) return;
    try {
      await navigator.clipboard.writeText(affiliateLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: 'Link copiado!' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const infoTiles = [
    displayProduct.vendedor && { icon: Store, label: 'Vendedor', value: displayProduct.vendedor },
    displayProduct.frete && { icon: Truck, label: 'Frete', value: displayProduct.frete },
    displayProduct.parcelas && { icon: CreditCard, label: 'Parcelas', value: displayProduct.parcelas },
    displayProduct.numero_avaliacoes && displayProduct.numero_avaliacoes !== '0' && {
      icon: Star, label: 'Avaliações',
      value: [displayProduct.avaliacao, displayProduct.numero_avaliacoes].filter(Boolean).join(' · '),
    },
    displayProduct.porcentagem_vendido && displayProduct.porcentagem_vendido !== 'N/A' && {
      icon: ShoppingCart, label: 'Vendas', value: displayProduct.porcentagem_vendido,
    },
    displayProduct.tempo_restante && displayProduct.tempo_restante !== 'N/A' && {
      icon: Clock, label: 'Tempo Restante', value: displayProduct.tempo_restante,
    },
    displayProduct.categoria && { icon: Tag, label: 'Categoria', value: displayProduct.categoria },
  ].filter(Boolean) as { icon: any; label: string; value: string }[];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-3xl overflow-hidden"
        style={{ height: '92dvh', maxHeight: '92dvh' }}
      >
        <div className="flex flex-col h-full">

          {/* ── HERO SECTION ── */}
          <div className={`relative flex-shrink-0 bg-gradient-to-b ${accent.bg} from-20%`}>
            <div className="flex justify-center pt-3">
              <div className="w-9 h-[3px] rounded-full bg-foreground/15" />
            </div>

            {/* Nav — só Voltar */}
            <div className="px-4 pt-2 pb-1">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium active:opacity-70"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
            </div>

            <div className="flex gap-4 px-4 pt-2 pb-4">
              <div className="flex-shrink-0 relative">
                <div className={`absolute inset-0 rounded-2xl blur-xl opacity-30 bg-gradient-to-br ${accent.bg}`} />
                <div className="relative w-[88px] h-[88px] rounded-2xl overflow-hidden border border-border/30 shadow-lg">
                  <img
                    src={imgError ? '/no-image.png' : (image || '/no-image.png')}
                    alt={name}
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                </div>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${accent.dot} rounded-full border-2 border-background shadow`} />
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-[15px] font-bold leading-snug line-clamp-3 tracking-tight">
                  {name}
                </p>
                {/* Badges + share na mesma linha */}
                <div className="flex items-center gap-1 flex-wrap">
                  <MarketplaceBadge marketplace={displayProduct.marketplace} size="sm" />
                  <StatusBadge status={displayProduct.status || 'active'} size="sm" />
                  {displayProduct.categoria && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md border border-border/50 leading-none whitespace-nowrap">
                      <Tag className="w-2.5 h-2.5 flex-shrink-0" />
                      {displayProduct.categoria}
                    </span>
                  )}
                  {affiliateLink && (
                    <button
                      onClick={handleCopy}
                      className="ml-auto w-7 h-7 rounded-full bg-muted/70 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
                    >
                      {copied
                        ? <Check className="w-3 h-3 text-emerald-500" strokeWidth={3} />
                        : <Share2 className="w-3 h-3 text-muted-foreground" />
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── SCROLLABLE CONTENT ── */}
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-4 pb-8 space-y-3 pt-1">

              {/* ── PRICE SECTION ── clean card with vertical divider for discount ── */}
              {priceStr && (
                <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                  <div className="flex items-stretch">
                    {/* Price */}
                    <div className="flex-1 px-4 py-4 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Preço atual
                      </p>
                      {oldPriceStr && (
                        <p className="text-xs text-muted-foreground/60 line-through leading-none">
                          {oldPriceStr}
                        </p>
                      )}
                      <p className="text-[28px] font-black text-emerald-600 dark:text-emerald-400 tracking-tight leading-none">
                        {priceStr}
                      </p>
                      {displayProduct.parcelas && (
                        <p className="text-[11px] text-muted-foreground pt-0.5 flex items-center gap-1">
                          <CreditCard className="w-3 h-3 flex-shrink-0" />
                          {displayProduct.parcelas}
                        </p>
                      )}
                    </div>

                    {/* Discount — vertical divider */}
                    {displayProduct.desconto && (
                      <div className="flex items-center justify-center border-l border-border/50 px-5">
                        <div className="flex flex-col items-center gap-0.5">
                          <TrendingDown className="w-4 h-4 text-rose-500 mb-0.5" />
                          <span className="text-[22px] font-black text-rose-500 leading-none tracking-tight">
                            {displayProduct.desconto}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-rose-400 mt-0.5">
                            off
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                
                </div>
              )}

              {/* ── INFO TILES ── */}
              {infoTiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {infoTiles.map((tile, i) => {
                    const Icon = tile.icon;
                    return (
                      <div
                        key={i}
                        className={`
                          rounded-xl border border-border/50 bg-card p-3 space-y-1.5
                          ${i === infoTiles.length - 1 && infoTiles.length % 2 !== 0 ? 'col-span-2' : ''}
                        `}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                            <Icon className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {tile.label}
                          </span>
                        </div>
                        <p className="text-[13px] font-semibold text-foreground truncate">
                          {tile.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── TIMESTAMPS ── */}
              {((displayProduct.createdAt || displayProduct.createdat) || displayProduct.ultima_verificacao) && (
                <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/40 overflow-hidden">
                  {(displayProduct.createdAt || displayProduct.createdat) && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                        Adicionado em
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {formatDate(displayProduct.createdAt || displayProduct.createdat)}
                      </span>
                    </div>
                  )}
                  {(displayProduct.updatedAt || displayProduct.updatedat) && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                        Atualizado em
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {formatDate(displayProduct.updatedAt || displayProduct.updatedat)}
                      </span>
                    </div>
                  )}
                  {displayProduct.ultima_verificacao && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                        Verificado em
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {formatDate(displayProduct.ultima_verificacao)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── AFFILIATE LINK ── */}
              {affiliateLink && (
                <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
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
                      className={`flex items-center justify-center gap-2 py-3.5 text-sm font-semibold border-r border-border/40 transition-all active:scale-95 ${
                        copied
                          ? 'text-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/20'
                          : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {copied
                        ? <><Check className="w-4 h-4" strokeWidth={3} /> Copiado!</>
                        : <><Copy className="w-4 h-4" /> Copiar link</>
                      }
                    </button>
                    <a
                      href={affiliateLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-primary hover:bg-muted/50 transition-colors active:scale-95"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir produto
                    </a>
                  </div>
                </div>
              )}

            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}