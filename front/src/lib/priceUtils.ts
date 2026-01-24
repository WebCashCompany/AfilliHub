// src/lib/priceUtils.ts - UTILITÁRIO CENTRALIZADO DE PREÇOS

/**
 * Converte preço de centavos para formato brasileiro
 * @param cents - Valor em centavos (ex: 20359 = R$ 203,59)
 */
export function formatCurrency(cents: number): string {
  if (!cents) return 'R$ 0,00';
  const reais = cents / 100;
  return reais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ✅ ALIAS para compatibilidade com código existente
export const formatCurrencyFromCents = formatCurrency;

/**
 * Converte qualquer formato de preço para centavos
 * Detecta automaticamente se está em centavos, reais, ou string formatada
 */
export function parsePriceToCents(value: any): number {
  if (!value) return 0;
  
  // Se já é número
  if (typeof value === 'number') {
    // Se for menor que 1000, assume que está em reais (ex: 203.59)
    // Se for maior, assume que está em centavos (ex: 20359)
    return value < 1000 ? Math.round(value * 100) : value;
  }
  
  // Se é string
  let str = String(value).trim();
  
  // Remove R$, espaços
  str = str.replace(/R\$/g, '').replace(/\s/g, '');
  
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');
  
  // Caso 1: Sem separador decimal → está em centavos
  // "20359" → 20359
  if (!hasComma && !hasDot) {
    return parseInt(str) || 0;
  }
  
  // Caso 2: Tem vírgula e ponto → formato brasileiro
  // "20.359,00" → remove ponto, troca vírgula por ponto → 20359.00 → *100
  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // "20.359,00" → "20359.00"
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // "20,359.00" → "20359.00"
      str = str.replace(/,/g, '');
    }
  } 
  // Caso 3: Só tem vírgula → decimal brasileiro
  // "203,59" → "203.59"
  else if (hasComma) {
    str = str.replace(',', '.');
  }
  // Caso 4: Só tem ponto → pode ser decimal ou milhar
  // "203.59" (decimal) ou "1.234" (milhar)
  else if (hasDot) {
    const parts = str.split('.');
    // Se tem 2 casas depois do ponto, é decimal
    if (parts.length === 2 && parts[1].length === 2) {
      // "203.59" → mantém
    } 
    // Se tem mais de 2 pontos ou 3+ casas, é milhar
    else if (parts.length > 2 || (parts.length === 2 && parts[1].length >= 3)) {
      // "1.234" ou "1.234.567" → remove pontos
      str = str.replace(/\./g, '');
    }
  }
  
  const parsed = parseFloat(str);
  if (isNaN(parsed)) return 0;
  
  // Se o valor é menor que 1000, está em reais → converte para centavos
  return parsed < 1000 ? Math.round(parsed * 100) : Math.round(parsed);
}

/**
 * Calcula desconto percentual
 */
export function calculateDiscount(oldPriceCents: number, newPriceCents: number): number {
  if (!oldPriceCents || !newPriceCents || oldPriceCents <= newPriceCents) return 0;
  return Math.round(((oldPriceCents - newPriceCents) / oldPriceCents) * 100);
}

/**
 * Extrai preço atual de um produto (prioriza campos do scraper)
 */
export function getCurrentPrice(product: any): number {
  return parsePriceToCents(
    product.preco_para || 
    product.price || 
    product.preco || 
    0
  );
}

/**
 * Extrai preço antigo de um produto (prioriza campos do scraper)
 */
export function getOldPrice(product: any): number {
  return parsePriceToCents(
    product.preco_de || 
    product.oldPrice || 
    product.preco_anterior || 
    product.preco_old ||
    0
  );
}

/**
 * Retorna desconto do produto (calcula se necessário)
 */
export function getDiscount(product: any): number {
  // Se tem desconto direto
  if (product.desconto || product.discount) {
    const str = String(product.desconto || product.discount).replace('%', '').trim();
    const parsed = parseInt(str);
    if (!isNaN(parsed)) return parsed;
  }
  
  // Senão, calcula baseado nos preços
  const currentPrice = getCurrentPrice(product);
  const oldPrice = getOldPrice(product);
  return calculateDiscount(oldPrice, currentPrice);
}