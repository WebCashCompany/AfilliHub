// src/components/dashboard/AutomationTimer.tsx - COM ENVIO AUTOMÁTICO

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Bot, Pause, Play, X, Clock, Zap } from 'lucide-react';

interface AutomationTimerProps {
  intervalMinutes: number;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onTimerComplete: () => void; // ✅ CALLBACK PARA ENVIAR PRODUTO
  onSendNow: () => void; // ✅ CALLBACK PARA ENVIAR IMEDIATAMENTE
  isPaused: boolean;
  totalSent: number; // ✅ TOTAL DE ENVIOS REALIZADOS
  isSending?: boolean; // ✅ ESTADO DE ENVIO
}

export function AutomationTimer({
  intervalMinutes,
  onPause,
  onResume,
  onCancel,
  onTimerComplete,
  onSendNow,
  isPaused,
  totalSent,
  isSending = false,
}: AutomationTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const saved = localStorage.getItem('automation_timer_time_left');
    if (saved) {
      const savedTime = parseInt(saved);
      if (!isNaN(savedTime) && savedTime > 0) {
        return savedTime;
      }
    }
    return intervalMinutes * 60;
  });

  useEffect(() => {
    localStorage.setItem('automation_timer_time_left', String(timeLeft));
  }, [timeLeft]);

  // ✅ TIMER PRINCIPAL - QUANDO ZERA, ENVIA PRODUTO
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // ✅ TEMPO ZEROU - ENVIAR PRODUTO!
          onTimerComplete();
          return intervalMinutes * 60; // Reinicia o timer
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, intervalMinutes, onTimerComplete]);

  const handleSendNow = () => {
    // ✅ ENVIAR IMEDIATAMENTE E ZERAR O TIMER
    onSendNow();
    setTimeLeft(intervalMinutes * 60); // Zera o timer
  };

  const handleCancel = () => {
    localStorage.removeItem('automation_timer_time_left');
    localStorage.removeItem('automation_current_index');
    localStorage.removeItem('automation_total_sent');
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((intervalMinutes * 60 - timeLeft) / (intervalMinutes * 60)) * 100;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 shadow-sm">
      <div className="relative">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
          <Bot className={`w-5 h-5 text-white ${!isPaused ? 'animate-pulse' : ''}`} />
        </div>
        {!isPaused && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-950 animate-pulse" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground">Automação Ativa</span>
          {isPaused && (
            <Badge variant="outline" className="text-xs">
              Pausada
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            <span className="text-lg font-bold font-mono text-violet-600 dark:text-violet-400 tabular-nums">
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {totalSent} envios realizados
          </div>
        </div>
        <div className="w-full h-1.5 bg-violet-200 dark:bg-violet-900 rounded-full overflow-hidden mt-1.5">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all duration-1000 ease-linear rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider>
          {/* ✅ BOTÃO ENVIAR AGORA */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSendNow}
                disabled={isSending || isPaused}
                className="h-9 w-9 hover:bg-green-100 dark:hover:bg-green-900/50"
              >
                <Zap className={`w-4 h-4 text-green-600 dark:text-green-400 ${isSending ? 'animate-pulse' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Enviar agora e zerar timer</p>
            </TooltipContent>
          </Tooltip>

          {isPaused ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onResume}
                  className="h-9 w-9 hover:bg-violet-100 dark:hover:bg-violet-900/50"
                >
                  <Play className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Retomar automação</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onPause}
                  className="h-9 w-9 hover:bg-violet-100 dark:hover:bg-violet-900/50"
                >
                  <Pause className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Pausar automação</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCancel}
                className="h-9 w-9 hover:bg-red-100 dark:hover:bg-red-900/50"
              >
                <X className="w-4 h-4 text-red-600 dark:text-red-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Cancelar automação</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}