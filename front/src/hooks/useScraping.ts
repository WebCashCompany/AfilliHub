// src/hooks/use-scraping.ts

/**
 * ═══════════════════════════════════════════════════════════
 * USE SCRAPING HOOK
 * ═══════════════════════════════════════════════════════════
 * 
 * Hook personalizado para operações de scraping.
 */

import { useState } from 'react';
import { scrapingService } from '@/api/services/scraping.service';
import type { ScrapingRequestPayload, ScrapingResponse, ApiError } from '@/types/api.types';
import { useToast } from '@/hooks/useToast';

interface UseScrapingReturn {
  startScraping: (payload: ScrapingRequestPayload) => Promise<ScrapingResponse | null>;
  isLoading: boolean;
  error: ApiError | null;
  data: ScrapingResponse | null;
}

export function useScraping(): UseScrapingReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [data, setData] = useState<ScrapingResponse | null>(null);
  const { toast } = useToast();

  const startScraping = async (payload: ScrapingRequestPayload): Promise<ScrapingResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await scrapingService.start(payload);

      if (response.success && response.data) {
        setData(response.data);
        
        toast({
          title: "✅ Scraping concluído!",
          description: `${response.data.total} produtos foram coletados com sucesso.`,
        });

        return response.data;
      } else {
        throw new Error(response.error || 'Erro desconhecido');
      }
    } catch (err: any) {
      const apiError: ApiError = {
        message: err.message || 'Erro ao iniciar scraping',
        code: err.code,
        status: err.status,
        details: err.details,
      };

      setError(apiError);

      toast({
        title: "❌ Erro no scraping",
        description: apiError.message,
        variant: "destructive",
      });

      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    startScraping,
    isLoading,
    error,
    data,
  };
}

export default useScraping;