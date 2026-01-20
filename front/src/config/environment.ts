// src/config/environment.ts

/**
 * ═══════════════════════════════════════════════════════════
 * CONFIGURAÇÃO DE AMBIENTE - TYPE-SAFE
 * ═══════════════════════════════════════════════════════════
 * 
 * Centraliza todas as variáveis de ambiente com validação
 * e fallbacks para desenvolvimento.
 */

interface Environment {
  API_BASE_URL: string;
  API_TIMEOUT: number;
  IS_DEVELOPMENT: boolean;
  IS_PRODUCTION: boolean;
}

const getEnvVar = (key: string, defaultValue: string = ''): string => {
  return import.meta.env[key] || defaultValue;
};

export const ENV: Environment = {
  // URL base da API - fallback para desenvolvimento local
  API_BASE_URL: getEnvVar('VITE_API_BASE_URL', 'http://localhost:3001'),
  
  // Timeout das requisições (30 segundos)
  API_TIMEOUT: parseInt(getEnvVar('VITE_API_TIMEOUT', '30000')),
  
  // Flags de ambiente
  IS_DEVELOPMENT: import.meta.env.DEV,
  IS_PRODUCTION: import.meta.env.PROD,
};

// Log de configuração apenas em desenvolvimento
if (ENV.IS_DEVELOPMENT) {
  console.log('🔧 Environment Config:', {
    API_BASE_URL: ENV.API_BASE_URL,
    API_TIMEOUT: ENV.API_TIMEOUT,
    MODE: ENV.IS_DEVELOPMENT ? 'development' : 'production'
  });
}

export default ENV;