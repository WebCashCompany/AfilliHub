// src/lib/priceUtils.ts - CORRIGIDO DEFINITIVAMENTE

/**
 * Converte preço de centavos para formato brasileiro
 * @param cents - Valor em centavos (ex: 3824 = R$ 38,24)
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

export const formatCurrencyFromCents = formatCurrency;

/**
 * Converte qualquer formato de preço para centavos
 * REGRA DEFINITIVA: Números SEM separador decimal JÁ ESTÃO EM CENTAVOS
 */
export function parsePriceToCents(value: any): number {
  if (!value) return 0;
  
  // ========================================
  // NÚMEROS
  // ========================================
  if (typeof value === 'number') {
    // Se já é um número inteiro sem decimais, assumir que está em centavos
    // Exemplo: 3824 → 3824 centavos = R$ 38,24
    return Math.round(value);
  }
  
  // ========================================
  // STRINGS
  // ========================================
  let str = String(value).trim();
  
  // Remove "R$" e espaços
  str = str.replace(/R\$/gi, '').replace(/\s+/g, '');
  
  if (!str) return 0;
  
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');
  
  // ----------------------------------------
  // CASO 1: SEM SEPARADOR DECIMAL
  // ----------------------------------------
  // Se não tem vírgula nem ponto, JÁ ESTÁ EM CENTAVOS
  // Exemplos:
  //   "3824" → 3824 centavos → R$ 38,24
  //   "17091" → 17091 centavos → R$ 170,91
  //   "382400" → 382400 centavos → R$ 3.824,00
  if (!hasComma && !hasDot) {
    const num = parseInt(str) || 0;
    return num; // JÁ ESTÁ EM CENTAVOS
  }
  
  // ----------------------------------------
  // CASO 2: COM VÍRGULA E PONTO
  // ----------------------------------------
  if (hasComma && hasDot) {
    const lastCommaIndex = str.lastIndexOf(',');
    const lastDotIndex = str.lastIndexOf('.');
    
    // Formato BR: 1.234,56
    if (lastCommaIndex > lastDotIndex) {
      str = str.replace(/\./g, '').replace(',', '.');
    } 
    // Formato US: 1,234.56
    else {
      str = str.replace(/,/g, '');
    }
    
    const num = parseFloat(str);
    return Math.round(num * 100);
  }
  
  // ----------------------------------------
  // CASO 3: SÓ VÍRGULA (decimal BR)
  // ----------------------------------------
  // Exemplos: "38,24" → 3824 centavos
  if (hasComma) {
    str = str.replace(',', '.');
    const num = parseFloat(str);
    return Math.round(num * 100);
  }
  
  // ----------------------------------------
  // CASO 4: SÓ PONTO
  // ----------------------------------------
  if (hasDot) {
    const parts = str.split('.');
    
    // Se tiver 2 casas após o ponto, é decimal: "38.24" → 3824 centavos
    if (parts.length === 2 && parts[1].length <= 2) {
      const num = parseFloat(str);
      return Math.round(num * 100);
    }
    
    // Senão é separador de milhar: "3.824" → 3824 reais → 382400 centavos
    str = str.replace(/\./g, '');
    const num = parseFloat(str);
    return Math.round(num * 100);
  }
  
  return 0;
}

/**
 * Calcula desconto percentual
 */
export function calculateDiscount(oldPriceCents: number, newPriceCents: number): number {
  if (!oldPriceCents || !newPriceCents || oldPriceCents <= newPriceCents) return 0;
  return Math.round(((oldPriceCents - newPriceCents) / oldPriceCents) * 100);
}

/**
 * Extrai preço atual de um produto
 */
export function getCurrentPrice(product: any): number {
  const rawPrice = product.preco_para || product.price || product.preco || 0;
  const marketplace = product.marketplace || '';
  
  // Se for número sem separador decimal
  if (typeof rawPrice === 'number' && Number.isInteger(rawPrice)) {
    // Magalu retorna em centavos
    if (marketplace === 'magalu') {
      return rawPrice;
    }
    // Mercado Livre retorna em reais
    if (marketplace === 'mercadolivre') {
      return rawPrice * 100;
    }
  }
  
  return parsePriceToCents(rawPrice);
}

/**
 * Extrai preço antigo de um produto
 */
export function getOldPrice(product: any): number {
  const rawPrice = product.preco_de || product.oldPrice || product.preco_anterior || product.preco_old || 0;
  const marketplace = product.marketplace || '';
  
  // Se for número sem separador decimal
  if (typeof rawPrice === 'number' && Number.isInteger(rawPrice)) {
    // Magalu retorna em centavos
    if (marketplace === 'magalu') {
      return rawPrice;
    }
    // Mercado Livre retorna em reais
    if (marketplace === 'mercadolivre') {
      return rawPrice * 100;
    }
  }
  
  return parsePriceToCents(rawPrice);
}

/**
 * Retorna desconto do produto
 */
export function getDiscount(product: any): number {
  // Prioridade 1: desconto do banco
  if (product.desconto) {
    const str = String(product.desconto).replace('%', '').trim();
    const parsed = parseInt(str);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  
  if (product.discount) {
    const str = String(product.discount).replace('%', '').trim();
    const parsed = parseInt(str);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  
  // Prioridade 2: calcular
  const currentPrice = getCurrentPrice(product);
  const oldPrice = getOldPrice(product);
  
  if (oldPrice > 0 && currentPrice > 0) {
    return calculateDiscount(oldPrice, currentPrice);
  }
  
  return 0;
} 