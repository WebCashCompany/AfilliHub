// src/components/modals/ConnectBotModal.tsx - COM QR CODE NA TELA

import { useState, useEffect } from 'react';
import { Loader2, MessageCircle, Send, CheckCircle, X } from 'lucide-react';
import { whatsappService } from '@/api/services/whatsapp.service';
import { useToast } from '@/hooks/use-toast';
import QRCode from 'react-qr-code'; // Instalar: npm install react-qr-code

interface ConnectBotModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

type ConnectionStep = 'choose' | 'connecting' | 'qrcode' | 'connected';

export function ConnectBotModal({ open, onClose, onConnected }: ConnectBotModalProps) {
  const [step, setStep] = useState<ConnectionStep>('choose');
  const [selectedPlatform, setSelectedPlatform] = useState<'whatsapp' | 'telegram' | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const { toast } = useToast();

  // Resetar ao abrir
  useEffect(() => {
    if (open) {
      setStep('choose');
      setSelectedPlatform(null);
      setQrCode(null);
    }
  }, [open]);

  const handleSelectPlatform = async (platform: 'whatsapp' | 'telegram') => {
    setSelectedPlatform(platform);
    
    if (platform === 'telegram') {
      toast({
        title: "Em breve!",
        description: "Telegram será disponibilizado em breve.",
      });
      return;
    }

    // CONECTAR WHATSAPP
    setStep('connecting');
    
    try {
      // Iniciar conexão
      await whatsappService.connectBot();
      
      // Polling para pegar QR Code
      const pollInterval = setInterval(async () => {
        try {
          const status = await whatsappService.getStatus();
          
          // Se recebeu QR Code
          if (status.qrCode && !status.conectado) {
            setQrCode(status.qrCode);
            setStep('qrcode');
          }
          
          // Se conectou
          if (status.conectado) {
            clearInterval(pollInterval);
            setStep('connected');
            
            setTimeout(() => {
              onConnected();
              onClose();
            }, 1500);
          }
        } catch (error) {
          console.error('Erro no polling:', error);
        }
      }, 2000);

      // Timeout de 2 minutos
      setTimeout(() => {
        clearInterval(pollInterval);
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
      toast({
        title: "Erro ao conectar",
        description: error.message || "Não foi possível iniciar a conexão.",
        variant: "destructive"
      });
      setStep('choose');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md p-6 z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Conectar Bot</h2>
            <p className="text-sm text-muted-foreground">
              {step === 'qrcode' ? 'Escaneie o QR Code' : 'Escolha a plataforma'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        {step === 'choose' && (
          <div className="grid grid-cols-2 gap-4 py-4">
            {/* WhatsApp */}
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

            {/* Telegram */}
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
              onClick={onClose}
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