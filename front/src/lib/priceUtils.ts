// src/lib/priceUtils.ts - CORRIGIDO DEFINITIVAMENTE

/**
 * Converte preço de centavos para formato brasileiro
 * @param cents - Valor em centavos (ex: 1296 = R$ 12,96)
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
 * REGRA: Strings sem separador decimal do ML/Scrapers JÁ ESTÃO EM CENTAVOS
 */
export function parsePriceToCents(value: any): number {
  if (!value) return 0;
  
  // ========================================
  // NÚMEROS
  // ========================================
  if (typeof value === 'number') {
    // Números pequenos < 100 provavelmente são reais
    if (value < 100) {
      return Math.round(value * 100);
    }
    // Números >= 100 já são centavos
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
  // CASO 1: SEM SEPARADOR (ML/Scrapers)
  // ----------------------------------------
  // "1296" → 1296 REAIS → 129600 centavos
  // "503" → 503 REAIS → 50300 centavos
  if (!hasComma && !hasDot) {
    const num = parseInt(str) || 0;
    // Sempre multiplica por 100 (está em reais)
    return num * 100;
  }
  
  // ----------------------------------------
  // CASO 2: COM VÍRGULA E PONTO
  // ----------------------------------------
  if (hasComma && hasDot) {
    const lastCommaIndex = str.lastIndexOf(',');
    const lastDotIndex = str.lastIndexOf('.');
    
    if (lastCommaIndex > lastDotIndex) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
    
    const num = parseFloat(str);
    return Math.round(num * 100);
  }
  
  // ----------------------------------------
  // CASO 3: SÓ VÍRGULA (decimal BR)
  // ----------------------------------------
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
    
    if (parts.length === 2 && parts[1].length <= 2) {
      const num = parseFloat(str);
      return Math.round(num * 100);
    }
    
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
  return parsePriceToCents(
    product.preco_para || 
    product.price || 
    product.preco || 
    0
  );
}

/**
 * Extrai preço antigo de um produto
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