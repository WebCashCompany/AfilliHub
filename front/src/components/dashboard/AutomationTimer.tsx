// src/components/dashboard/AutomationTimer.tsx
// Timer PURAMENTE VISUAL — o envio real é feito pelo backend.
// Sincroniza com nextFireAt (timestamp epoch em ms) vindo do servidor.

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Bot, Pause, Play, X, Clock, Zap } from 'lucide-react';

interface AutomationTimerProps {
  intervalMinutes: number;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onTimerComplete: () => void; // apenas visual — backend já enviou
  onSendNow: () => void;
  isPaused: boolean;
  totalSent: number;
  isSending?: boolean;
  nextFireAt?: number; // timestamp epoch (ms) vindo do backend
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
  nextFireAt,
}: AutomationTimerProps) {
  const totalSeconds = intervalMinutes * 60;

  const calcSecondsLeft = () => {
    if (isPaused) return totalSeconds;
    if (nextFireAt) {
      const diff = Math.round((nextFireAt - Date.now()) / 1000);
      return Math.max(0, diff);
    }
    return totalSeconds;
  };

  const [timeLeft, setTimeLeft] = useState(calcSecondsLeft);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef   = useRef(onTimerComplete);
  onCompleteRef.current = onTimerComplete;

  // Atualiza o display quando nextFireAt muda (backend reiniciou o ciclo)
  useEffect(() => {
    setTimeLeft(calcSecondsLeft());
  }, [nextFireAt, isPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick local a cada 500ms — apenas para atualizar o display
  useEffect(() => {
    if (isPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      if (nextFireAt) {
        const diff = Math.round((nextFireAt - Date.now()) / 1000);
        setTimeLeft(Math.max(0, diff));
      } else {
        setTimeLeft(prev => {
          if (prev <= 1) {
            onCompleteRef.current();
            return totalSeconds;
          }
          return prev - 1;
        });
      }
    }, 500);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPaused, nextFireAt, totalSeconds]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const formatTime = (s: number) => {
    const safe = Math.max(0, s);
    const m = Math.floor(safe / 60);
    const sec = safe % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const progress = Math.min(100, ((totalSeconds - timeLeft) / totalSeconds) * 100);

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
          {isPaused && <Badge variant="outline" className="text-xs">Pausada</Badge>}
          {isSending && (
            <Badge variant="outline" className="text-xs border-green-400 text-green-600 dark:text-green-400">Enviando…</Badge>
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
            {totalSent} {totalSent === 1 ? 'envio realizado' : 'envios realizados'}
          </div>
        </div>

        <div className="w-full h-1.5 bg-violet-200 dark:bg-violet-900 rounded-full overflow-hidden mt-1.5">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all duration-500 ease-linear rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={onSendNow} disabled={isSending || isPaused} className="h-9 w-9 hover:bg-green-100 dark:hover:bg-green-900/50">
                <Zap className={`w-4 h-4 text-green-600 dark:text-green-400 ${isSending ? 'animate-pulse' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Enviar agora e zerar timer</p></TooltipContent>
          </Tooltip>

          {isPaused ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={onResume} className="h-9 w-9 hover:bg-violet-100 dark:hover:bg-violet-900/50">
                  <Play className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Retomar automação</p></TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={onPause} className="h-9 w-9 hover:bg-violet-100 dark:hover:bg-violet-900/50">
                  <Pause className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Pausar automação</p></TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={onCancel} className="h-9 w-9 hover:bg-red-100 dark:hover:bg-red-900/50">
                <X className="w-4 h-4 text-red-600 dark:text-red-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Cancelar automação</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}