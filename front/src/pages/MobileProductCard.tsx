
// ─── MobileProductCard.tsx — Premium Version ─────────────────────────────────
// Drop-in replacement para o card de produto e o Sheet de detalhes no mobile.
// Substitua os dois componentes no ProductsPage.tsx.

import { useState } from 'react';
import {
  Check, Store, Truck, CreditCard, Star, ShoppingCart,
  Clock, Tag, Link2, Copy, ExternalLink, TrendingDown,
  ChevronRight, Package, CalendarDays, Zap, BadgePercent,
  Heart, Share2, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
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

// Gera cor de fundo sutil baseada no marketplace
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
      {/* Gradient de fundo do marketplace */}
      <div className={`absolute inset-0 bg-gradient-to-br ${accent.bg} pointer-events-none`} />

      {/* Stripe lateral de seleção */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 rounded-l-2xl ${selected ? 'bg-primary' : 'bg-transparent'}`} />

      {/* ── Bloco Imagem ── */}
      <div className="relative flex-shrink-0 p-3 pl-4">
        {/* Checkbox circular */}
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

        {/* Imagem */}
        <div className="relative w-[72px] h-[72px] mt-1">
          <img
            src={product.image || '/no-image.png'}
            alt={product.name}
            className="w-full h-full object-cover rounded-xl border border-border/30"
            onError={(e) => { (e.target as HTMLImageElement).src = '/no-image.png'; }}
          />
          {/* Badge de desconto sobrepostos */}
          {hasDiscount && (
            <div className="absolute -top-2 -right-2 min-w-[32px] h-[22px] bg-rose-500 text-white text-[10px] font-black px-1.5 rounded-full flex items-center justify-center shadow-md shadow-rose-500/30 leading-none">
              -{discount}%
            </div>
          )}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-between gap-1.5">
        {/* Nome */}
        <p className="text-[13px] font-semibold leading-snug line-clamp-2 text-foreground tracking-tight">
          {product.name}
        </p>

        {/* Badges de marketplace + categoria */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <MarketplaceBadge marketplace={product.marketplace} />
          {product.category && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
              <Tag className="w-2.5 h-2.5" />
              {product.category}
            </span>
          )}
        </div>

        {/* Preço + status */}
        <div className="flex items-end justify-between gap-2">
          <div className="space-y-0">
            {hasPriceReduction && (
              <p className="text-[10px] line-through text-muted-foreground/70 leading-none mb-0.5">
                {formatCurrency(oldPriceCents)}
              </p>
            )}
            <p className={`text-[15px] font-black leading-none tracking-tight ${hasDiscount ? 'text-emerald-600' : 'text-foreground'}`}>
              {formatCurrency(currentPriceCents)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge status={product.status} />
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

  // Info tiles data
  const infoTiles = [
    displayProduct.vendedor && { icon: Store, label: 'Vendedor', value: displayProduct.vendedor },
    displayProduct.frete && { icon: Truck, label: 'Frete', value: displayProduct.frete },
    displayProduct.parcelas && { icon: CreditCard, label: 'Parcelas', value: displayProduct.parcelas },
    displayProduct.numero_avaliacoes && displayProduct.numero_avaliacoes !== '0' && {
      icon: Star,
      label: 'Avaliações',
      value: [displayProduct.avaliacao, displayProduct.numero_avaliacoes].filter(Boolean).join(' · '),
    },
    displayProduct.porcentagem_vendido && displayProduct.porcentagem_vendido !== 'N/A' && {
      icon: ShoppingCart, label: 'Vendas', value: displayProduct.porcentagem_vendido,
    },
    displayProduct.tempo_restante && displayProduct.tempo_restante !== 'N/A' && {
      icon: Clock, label: 'Tempo Restante', value: displayProduct.tempo_restante,
    },
    displayProduct.categoria && {
      icon: Tag, label: 'Categoria', value: displayProduct.categoria,
    },
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
            {/* Drag handle */}
            <div className="flex justify-center pt-3">
              <div className="w-9 h-[3px] rounded-full bg-foreground/15" />
            </div>

            {/* Close + share bar */}
            <div className="flex items-center justify-between px-4 pt-2 pb-1">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium active:opacity-70"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
              <div className="flex items-center gap-2">
                {affiliateLink && (
                  <button
                    onClick={handleCopy}
                    className="w-8 h-8 rounded-full bg-muted/70 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    {copied
                      ? <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={3} />
                      : <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                    }
                  </button>
                )}
              </div>
            </div>

            {/* Produto: imagem + título + badges */}
            <div className="flex gap-4 px-4 pt-2 pb-4">
              {/* Imagem com glow sutil */}
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
                {/* Dot indicador do marketplace */}
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${accent.dot} rounded-full border-2 border-background shadow`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-[15px] font-bold leading-snug line-clamp-3 tracking-tight">
                  {name}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <MarketplaceBadge marketplace={displayProduct.marketplace} />
                  <StatusBadge status={displayProduct.status || 'active'} />
                </div>
              </div>
            </div>
          </div>

          {/* ── SCROLLABLE CONTENT ── */}
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-4 pb-8 space-y-4 pt-1">

              {/* ── PRICE CARD ── */}
              <div className="relative overflow-hidden rounded-2xl border border-emerald-200/60 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-emerald-50/30 dark:from-emerald-950/40 dark:to-transparent p-4">
                {/* Decorative circle */}
                <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-emerald-400/10" />
                <div className="absolute -right-3 -top-3 w-14 h-14 rounded-full bg-emerald-400/10" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    {displayProduct.preco_anterior && (
                      <p className="text-xs line-through text-muted-foreground/70 font-medium">
                        {displayProduct.preco_anterior?.startsWith?.('R$') ? displayProduct.preco_anterior : `R$ ${displayProduct.preco_anterior}`}
                      </p>
                    )}
                    <p className="text-3xl font-black text-emerald-600 tracking-tight leading-none">
                      {displayProduct.preco?.startsWith?.('R$') ? displayProduct.preco : `R$ ${displayProduct.preco}`}
                    </p>
                    {displayProduct.parcelas && (
                      <p className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        {displayProduct.parcelas}
                      </p>
                    )}
                  </div>

                  {displayProduct.desconto && (
                    <div className="flex-shrink-0 flex flex-col items-center bg-rose-500 text-white rounded-xl px-3 py-2 shadow-md shadow-rose-500/25">
                      <TrendingDown className="w-3.5 h-3.5 mb-0.5" />
                      <span className="text-sm font-black leading-none">{displayProduct.desconto}</span>
                      <span className="text-[9px] uppercase tracking-wider opacity-80 mt-0.5">off</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── INFO TILES ── */}
              {infoTiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {infoTiles.map((tile, i) => {
                    const Icon = tile.icon;
                    return (
                      <div
                        key={i}
                        className={`
                          rounded-xl border border-border/60 bg-card p-3 space-y-1.5
                          ${i === infoTiles.length - 1 && infoTiles.length % 2 !== 0 ? 'col-span-2' : ''}
                        `}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center">
                            <Icon className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                <div className="rounded-xl border border-border/60 bg-muted/30 divide-y divide-border/40">
                  {(displayProduct.createdAt || displayProduct.createdat) && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="w-3.5 h-3.5" />
                        Adicionado em
                      </div>
                      <span className="text-xs font-medium">
                        {formatDate(displayProduct.createdAt || displayProduct.createdat)}
                      </span>
                    </div>
                  )}
                  {(displayProduct.updatedAt || displayProduct.updatedat) && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Zap className="w-3.5 h-3.5" />
                        Atualizado em
                      </div>
                      <span className="text-xs font-medium">
                        {formatDate(displayProduct.updatedAt || displayProduct.updatedat)}
                      </span>
                    </div>
                  )}
                  {displayProduct.ultima_verificacao && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-3.5 h-3.5" />
                        Verificado em
                      </div>
                      <span className="text-xs font-medium">
                        {formatDate(displayProduct.ultima_verificacao)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── AFFILIATE LINK SECTION ── */}
              {affiliateLink && (
                <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50/80 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/40">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      Link de Afiliado
                    </span>
                    <div className="ml-auto">
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                        Ativo
                      </span>
                    </div>
                  </div>

                  {/* URL preview */}
                  <div className="px-4 py-3 bg-card">
                    <p className="text-[11px] font-mono text-muted-foreground break-all line-clamp-2 leading-relaxed">
                      {affiliateLink}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-0 border-t border-border/40">
                    <button
                      onClick={handleCopy}
                      className={`
                        flex items-center justify-center gap-2 py-3.5 text-sm font-semibold
                        border-r border-border/40 transition-all active:scale-95
                        ${copied
                          ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
                          : 'text-foreground hover:bg-muted/50'
                        }
                      `}
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
                      className="flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors active:scale-95"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir produto
                    </a>
                  </div>
                </div>
              )}

              {/* ── CTA PRINCIPAL ── */}
              {affiliateLink && (
                <a
                  href={affiliateLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
                >
                  <Zap className="w-4 h-4" />
                  Ver oferta agora
                  <ChevronRight className="w-4 h-4 ml-auto opacity-70" />
                </a>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}