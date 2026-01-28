// src/components/modals/ConnectBotModal.tsx - CORRIGIDO PARA MULTI-SESSÃO
import { useState, useEffect, useRef } from 'react';
import { Loader2, MessageCircle, Send, CheckCircle, X } from 'lucide-react';
import { useWhatsApp } from '@/contexts/WhatsAppContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import QRCode from 'react-qr-code';

interface ConnectBotModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

type ConnectionStep = 'choose' | 'name' | 'connecting' | 'qrcode' | 'connected';

export function ConnectBotModal({ open, onClose, onConnected }: ConnectBotModalProps) {
  const [step, setStep] = useState<ConnectionStep>('choose');
  const [selectedPlatform, setSelectedPlatform] = useState<'whatsapp' | 'telegram' | null>(null);
  const [sessionName, setSessionName] = useState('');
  const { qrCode, isConnecting, connectNewSession } = useWhatsApp();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Limpar timeout ao desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Resetar ao abrir
  useEffect(() => {
    if (open) {
      setStep('choose');
      setSelectedPlatform(null);
      setSessionName('');
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [open]);

  // Monitorar QR Code
  useEffect(() => {
    if (!open) return;

    // Se recebeu QR Code
    if (qrCode && step === 'connecting') {
      setStep('qrcode');
    }
  }, [qrCode, open, step]);

  // Monitorar se conectou (qrCode fica null quando conecta)
  useEffect(() => {
    if (!open) return;

    // Se estava mostrando QR Code e ele sumiu, significa que conectou
    if (step === 'qrcode' && !qrCode && !isConnecting) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      setStep('connected');
      
      setTimeout(() => {
        onConnected();
        onClose();
      }, 1500);
    }
  }, [qrCode, isConnecting, open, step, onConnected, onClose]);

  const handleSelectPlatform = (platform: 'whatsapp' | 'telegram') => {
    setSelectedPlatform(platform);
    
    if (platform === 'telegram') {
      toast({
        title: "Em breve!",
        description: "Telegram será disponibilizado em breve.",
      });
      return;
    }

    setStep('name');
  };

  const handleConnect = async () => {
    if (!sessionName.trim()) {
      toast({
        title: "Digite um nome",
        description: "Por favor, digite um nome para identificar esta sessão.",
        variant: "destructive"
      });
      return;
    }

    setStep('connecting');
    
    try {
      await connectNewSession(sessionName.trim());

      // Timeout de 2 minutos
      timeoutRef.current = setTimeout(() => {
        if (step !== 'connected') {
          toast({
            title: "Tempo esgotado",
            description: "Não foi possível conectar. Tente novamente.",
            variant: "destructive"
          });
          setStep('choose');
        }
      }, 120000);

    } catch (error: any) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      toast({
        title: "Erro ao conectar",
        description: error.message || "Não foi possível iniciar a conexão.",
        variant: "destructive"
      });
      setStep('choose');
    }
  };

  const handleClose = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Conectar Bot</h2>
            <p className="text-sm text-muted-foreground">
              {step === 'qrcode' ? 'Escaneie o QR Code' : 
               step === 'name' ? 'Nome da sessão' : 
               'Escolha a plataforma'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'choose' && (
          <div className="grid grid-cols-2 gap-4 py-4">
            <div
              className="cursor-pointer border rounded-lg p-6 flex flex-col items-center gap-3 hover:border-green-500 transition-all"
              onClick={() => handleSelectPlatform('whatsapp')}
            >
              <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-950/20 flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold">WhatsApp</p>
                <p className="text-xs text-muted-foreground">Envie para grupos</p>
              </div>
            </div>

            <div
              className="cursor-pointer border rounded-lg p-6 flex flex-col items-center gap-3 hover:border-blue-500 transition-all opacity-50"
              onClick={() => handleSelectPlatform('telegram')}
            >
              <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
                <Send className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold">Telegram</p>
                <p className="text-xs text-muted-foreground">Em breve</p>
              </div>
            </div>
          </div>
        )}

        {step === 'name' && (
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sessionName">Nome da Sessão</Label>
              <Input
                id="sessionName"
                placeholder="Ex: numero-principal, numero-vendas"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
              <p className="text-xs text-muted-foreground">
                Escolha um nome para identificar esta conexão
              </p>
            </div>
            
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setStep('choose')}
                className="px-4 py-2 text-sm rounded-md hover:bg-muted transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleConnect}
                disabled={!sessionName.trim()}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Conectar
              </button>
            </div>
          </div>
        )}

        {step === 'connecting' && (
          <div className="py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Inicializando bot...</p>
              <p className="text-sm text-muted-foreground">
                Aguarde, gerando QR Code...
              </p>
            </div>
          </div>
        )}

        {step === 'qrcode' && qrCode && (
          <div className="py-6 flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCode value={qrCode} size={256} />
            </div>
            <div className="text-center">
              <p className="font-medium">Escaneie com seu WhatsApp</p>
              <p className="text-sm text-muted-foreground mt-2">
                WhatsApp → Dispositivos Conectados → Conectar
              </p>
            </div>
          </div>
        )}

        {step === 'connected' && (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-950/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-green-600 dark:text-green-400">
                Conectado com sucesso!
              </p>
              <p className="text-sm text-muted-foreground">
                Redirecionando...
              </p>
            </div>
          </div>
        )}

        {step === 'choose' && (
          <div className="flex justify-end mt-4">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm rounded-md hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}