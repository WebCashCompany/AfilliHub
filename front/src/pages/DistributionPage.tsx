// src/pages/DistributionPage.tsx - INTEGRADO COM MODAL COMPLETO

import { useState, useMemo, useEffect, useRef } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { formatCurrency, getCurrentPrice, getOldPrice, getDiscount } from '@/lib/priceUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { AutomationModal } from '@/components/dashboard/AutomationModal';
import { AutomationTimer } from '@/components/dashboard/AutomationTimer';
import { WhatsAppSettingsModal } from '@/components/modals/WhatsAppSettingsModal';
import { 
  Send, MessageCircle, Search, CheckCircle, Eye, Copy,
  Smartphone, Zap, Bot, Settings, Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@/lib/mockData';
import { whatsappService, type WhatsAppGroup } from '@/api/services/whatsapp.service';
import { useWhatsApp } from '@/contexts/WhatsAppContext';

interface AutomationConfig {
  intervalMinutes: number;
  categories: string[];
  marketplaces: string[];
}

export function DistributionPage() {
  const { products } = useDashboard();
  const { toast } = useToast();
  const { getActiveSession, currentSessionId } = useWhatsApp();
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  
  const [whatsappEnabled, setWhatsappEnabled] = useState(() => {
    const saved = localStorage.getItem('distribution_whatsapp_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const [telegramEnabled, setTelegramEnabled] = useState(() => {
    const saved = localStorage.getItem('distribution_telegram_enabled');
    return saved !== null ? saved === 'true' : false;
  });

  const [customMessage, setCustomMessage] = useState(() => {
    return localStorage.getItem('distribution_custom_message') || '';
  });

  const [sending, setSending] = useState(false);
  
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[]>(() => {
    const saved = localStorage.getItem('distribution_whatsapp_groups');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao carregar grupos salvos:', e);
      }
    }
    return [];
  });
  
  const [showWhatsAppSettings, setShowWhatsAppSettings] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  
  const [automationActive, setAutomationActive] = useState(() => {
    const saved = localStorage.getItem('distribution_automation_active');
    return saved === 'true';
  });
  
  const [automationPaused, setAutomationPaused] = useState(() => {
    const saved = localStorage.getItem('distribution_automation_paused');
    return saved === 'true';
  });
  
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig | null>(() => {
    const saved = localStorage.getItem('distribution_automation_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao carregar automation config:', e);
      }
    }
    return null;
  });

  const [currentProductIndex, setCurrentProductIndex] = useState(() => {
    const saved = localStorage.getItem('automation_current_index');
    return saved ? parseInt(saved) : 0;
  });

  const [totalSent, setTotalSent] = useState(() => {
    const saved = localStorage.getItem('automation_total_sent');
    return saved ? parseInt(saved) : 0;
  });

  const sendingRef = useRef(false);
  const [isAutoSending, setIsAutoSending] = useState(false);

  useEffect(() => {
    localStorage.setItem('distribution_whatsapp_enabled', String(whatsappEnabled));
  }, [whatsappEnabled]);

  useEffect(() => {
    localStorage.setItem('distribution_telegram_enabled', String(telegramEnabled));
  }, [telegramEnabled]);

  useEffect(() => {
    localStorage.setItem('distribution_custom_message', customMessage);
  }, [customMessage]);

  useEffect(() => {
    localStorage.setItem('distribution_whatsapp_groups', JSON.stringify(whatsappGroups));
  }, [whatsappGroups]);

  useEffect(() => {
    localStorage.setItem('distribution_automation_active', String(automationActive));
  }, [automationActive]);

  useEffect(() => {
    localStorage.setItem('distribution_automation_paused', String(automationPaused));
  }, [automationPaused]);

  useEffect(() => {
    if (automationConfig) {
      localStorage.setItem('distribution_automation_config', JSON.stringify(automationConfig));
    } else {
      localStorage.removeItem('distribution_automation_config');
    }
  }, [automationConfig]);

  useEffect(() => {
    localStorage.setItem('automation_current_index', String(currentProductIndex));
  }, [currentProductIndex]);

  useEffect(() => {
    localStorage.setItem('automation_total_sent', String(totalSent));
  }, [totalSent]);

  const activeProducts = products.filter(p => p.status === 'active' || p.status === 'protected');
  
  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 50);
  }, [activeProducts, search]);

  const selectedProducts = products.filter(p => selectedIds.includes(p.id));

  const availableCategories = useMemo(() => {
    const categories = new Set(products.map(p => p.category));
    return Array.from(categories).sort();
  }, [products]);

  const availableMarketplaces = useMemo(() => {
    const marketplaces = new Set(products.map(p => p.marketplace));
    return Array.from(marketplaces).sort();
  }, [products]);

  const getEligibleProducts = () => {
    if (!automationConfig) return [];

    let eligible = activeProducts;

    if (!automationConfig.categories.includes('all')) {
      eligible = eligible.filter(p => 
        automationConfig.categories.includes(p.category)
      );
    }

    if (!automationConfig.marketplaces.includes('all')) {
      eligible = eligible.filter(p => 
        automationConfig.marketplaces.includes(p.marketplace)
      );
    }

    return eligible;
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleGroupsSaved = (groups: WhatsAppGroup[]) => {
    setWhatsappGroups(groups);
  };

  const generateMessagePreview = (product: Product) => {
    const currentPriceCents = getCurrentPrice(product);
    const oldPriceCents = getOldPrice(product);
    const discount = getDiscount(product);
    
    const message = customMessage || `🔥 *OFERTA IMPERDÍVEL!* 🔥`;
    const link = (product as any).link_afiliado || product.affiliateLink || 'Link indisponível';
    
    return `${message}\n\n` +
           `📦 *${(product as any).nome || product.name}*\n\n` +
           `💰 De: ~${formatCurrency(oldPriceCents)}~\n` +
           `💵 Por: *${formatCurrency(currentPriceCents)}*\n` +
           `📉 Desconto: *${discount}%*\n\n` +
           `🔗 Link: ${link}`;
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "Selecione produtos",
        description: "Escolha pelo menos um produto para divulgar.",
        variant: "destructive"
      });
      return;
    }

    if (!whatsappEnabled && !telegramEnabled) {
      toast({
        title: "Selecione um canal",
        description: "Ative pelo menos WhatsApp ou Telegram.",
        variant: "destructive"
      });
      return;
    }

    if (!currentSessionId) {
      toast({
        title: "Conecte uma sessão",
        description: "Conecte uma sessão do WhatsApp antes de enviar.",
        variant: "destructive"
      });
      setShowWhatsAppSettings(true);
      return;
    }

    if (whatsappEnabled && whatsappGroups.length === 0) {
      toast({
        title: "Selecione grupos",
        description: "Configure os grupos do WhatsApp antes de enviar.",
        variant: "destructive"
      });
      setShowWhatsAppSettings(true);
      return;
    }

    setSending(true);

    try {
      if (whatsappEnabled) {
        for (const group of whatsappGroups) {
          const ofertas = selectedProducts.map(p => ({
            nome: p.name,
            mensagem: generateMessagePreview(p),
            imagem: p.image,
            link: p.affiliateLink || (p as any).link_afiliado || 'Link indisponível'
          }));

          await whatsappService.sendOffers({
            sessionId: currentSessionId,
            grupoId: group.id,
            ofertas
          });
        }
      }

      toast({
        title: "Ofertas enviadas!",
        description: `${selectedIds.length} ofertas enviadas para ${whatsappGroups.length} grupo${whatsappGroups.length > 1 ? 's' : ''}.`,
      });

      setSelectedIds([]);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar",
        description: error.message || "Não foi possível enviar as ofertas.",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const sendNextProduct = async () => {
    if (sendingRef.current || automationPaused || !automationActive) return;
    
    const eligibleProducts = getEligibleProducts();
    
    if (eligibleProducts.length === 0) {
      console.warn('Nenhum produto elegível para automação');
      return;
    }

    if (!currentSessionId) {
      console.warn('Nenhuma sessão conectada');
      return;
    }

    if (whatsappGroups.length === 0) {
      console.warn('Nenhum grupo configurado');
      return;
    }

    sendingRef.current = true;
    setIsAutoSending(true);

    try {
      const productToSend = eligibleProducts[currentProductIndex];
      
      console.log(`🤖 Enviando produto ${currentProductIndex + 1}/${eligibleProducts.length}:`, productToSend.name);

      for (const group of whatsappGroups) {
        const ofertas = [{
          nome: productToSend.name,
          mensagem: generateMessagePreview(productToSend),
          imagem: productToSend.image,
          link: productToSend.affiliateLink || (productToSend as any).link_afiliado || 'Link indisponível'
        }];

        await whatsappService.sendOffers({
          sessionId: currentSessionId,
          grupoId: group.id,
          ofertas
        });
      }

      setTotalSent(prev => prev + 1);

      toast({
        title: "✅ Oferta enviada pela automação",
        description: `${productToSend.name} enviado para ${whatsappGroups.length} grupo${whatsappGroups.length > 1 ? 's' : ''}`,
      });

      setCurrentProductIndex(prevIndex => {
        const nextIndex = (prevIndex + 1) % eligibleProducts.length;
        return nextIndex;
      });

    } catch (error: any) {
      console.error('Erro ao enviar produto automaticamente:', error);
      toast({
        title: "Erro na automação",
        description: error.message || "Não foi possível enviar a oferta.",
        variant: "destructive"
      });
    } finally {
      sendingRef.current = false;
      setIsAutoSending(false);
    }
  };

  const handleStartAutomation = (config: AutomationConfig) => {
    setAutomationConfig(config);
    setAutomationActive(true);
    setAutomationPaused(false);
    setCurrentProductIndex(0);
    
    toast({
      title: "Automação iniciada!",
      description: `Bot enviará ofertas a cada ${config.intervalMinutes} minutos.`,
    });
  };

  const handlePauseAutomation = () => {
    setAutomationPaused(true);
    toast({
      title: "Automação pausada",
      description: "O bot foi pausado e aguarda retomada.",
    });
  };

  const handleResumeAutomation = () => {
    setAutomationPaused(false);
    toast({
      title: "Automação retomada",
      description: "O bot voltou a enviar ofertas automaticamente.",
    });
  };

  const handleCancelAutomation = () => {
    setAutomationActive(false);
    setAutomationPaused(false);
    setAutomationConfig(null);
    setCurrentProductIndex(0);
    setTotalSent(0);
    
    localStorage.removeItem('distribution_automation_active');
    localStorage.removeItem('distribution_automation_paused');
    localStorage.removeItem('distribution_automation_config');
    localStorage.removeItem('automation_timer_time_left');
    localStorage.removeItem('automation_timer_total_cycles');
    localStorage.removeItem('automation_current_index');
    localStorage.removeItem('automation_total_sent');
    
    toast({
      title: "Automação cancelada",
      description: "O bot foi desativado com sucesso.",
      variant: "destructive"
    });
  };

  const activeSession = getActiveSession();
  const botConnected = activeSession?.conectado || false;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hub de Divulgação</h1>
          <p className="text-muted-foreground">
            Selecione produtos e compartilhe via bot nos seus canais
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowAutomationModal(true)}
                  disabled={!botConnected || automationActive}
                  className="h-10 w-10 relative group hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all"
                >
                  <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform" />
                  {automationActive && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Configurar automação</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {botConnected && (
            <Badge variant="outline" className="gap-2 px-3 py-1.5 border-status-active text-status-active">
              <CheckCircle className="w-4 h-4" />
              Bot Conectado
            </Badge>
          )}
        </div>
      </div>

      {automationActive && automationConfig && (
        <AutomationTimer
          intervalMinutes={automationConfig.intervalMinutes}
          isPaused={automationPaused}
          onPause={handlePauseAutomation}
          onResume={handleResumeAutomation}
          onCancel={handleCancelAutomation}
          onTimerComplete={sendNextProduct}
          onSendNow={sendNextProduct}
          totalSent={totalSent}
          isSending={isAutoSending}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Selecionar Ofertas
            </CardTitle>
            <CardDescription>
              Escolha os produtos que deseja divulgar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredProducts.map((product) => {
                const currentPriceCents = getCurrentPrice(product);
                const oldPriceCents = getOldPrice(product);
                const discount = getDiscount(product);
                
                return (
                  <div 
                    key={product.id}
                    className={`flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer ${
                      selectedIds.includes(product.id) 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                    onClick={() => handleSelect(product.id)}
                  >
                    <Checkbox
                      checked={selectedIds.includes(product.id)}
                      onCheckedChange={() => handleSelect(product.id)}
                    />
                    <img 
                      src={(product as any).imagem || product.image} 
                      alt={(product as any).nome || product.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{(product as any).nome || product.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <MarketplaceBadge marketplace={product.marketplace} size="sm" showLabel={false} />
                        <div className="flex items-center gap-2">
                          {oldPriceCents > 0 && oldPriceCents > currentPriceCents && (
                            <span className="text-xs line-through text-muted-foreground">
                              {formatCurrency(oldPriceCents)}
                            </span>
                          )}
                          <span className="text-sm text-status-active font-medium">
                            {formatCurrency(currentPriceCents)}
                          </span>
                        </div>
                        {discount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            -{discount}%
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                <span className="font-medium">{selectedIds.length} produtos selecionados</span>
                <Button variant="ghost" onClick={() => setSelectedIds([])}>Limpar seleção</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Conexão com Bot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!botConnected ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <MessageCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Conecte o DivulgaLinks para automatizar seus envios
                  </p>
                  <Button onClick={() => setShowWhatsAppSettings(true)} className="w-full gap-2">
                    <Zap className="w-4 h-4" />
                    Conectar DivulgaLinks
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-status-active/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-status-active" />
                      <span className="font-medium">DivulgaLinks</span>
                    </div>
                    <Badge variant="outline">Ativo</Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-status-active/10 flex items-center justify-center">
                          <Smartphone className="w-5 h-5 text-status-active" />
                        </div>
                        <div>
                          <p className="font-medium">WhatsApp</p>
                          <p className="text-xs text-muted-foreground">
                            {whatsappGroups.length} grupo{whatsappGroups.length !== 1 ? 's' : ''} conectado{whatsappGroups.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowWhatsAppSettings(true)}
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                        <Switch 
                          checked={whatsappEnabled} 
                          onCheckedChange={setWhatsappEnabled}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg opacity-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Send className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Telegram</p>
                          <p className="text-xs text-muted-foreground">Em breve</p>
                        </div>
                      </div>
                      <Switch 
                        checked={telegramEnabled} 
                        onCheckedChange={setTelegramEnabled}
                        disabled
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                Preview da Mensagem
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagem personalizada (opcional)</Label>
                <Textarea
                  placeholder="🔥 *OFERTA IMPERDÍVEL!*"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={2}
                />
              </div>

              {selectedProducts.length > 0 && (
                <div className="space-y-3">
                  {selectedProducts.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {selectedProducts.map((p, idx) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            const previewElement = document.getElementById(`preview-${idx}`);
                            previewElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                          }}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 transition-colors"
                        >
                          Produto {idx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="max-h-[500px] overflow-y-auto space-y-4 pr-2">
                    {selectedProducts.map((product, idx) => (
                      <div key={product.id} id={`preview-${idx}`} className="space-y-3">
                        <div className="relative rounded-lg overflow-hidden border">
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="w-full h-48 object-cover"
                          />
                          <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1">
                            <span className="text-xs font-medium">📸 Imagem será enviada</span>
                          </div>
                          {selectedProducts.length > 1 && (
                            <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded px-2 py-1">
                              <span className="text-xs font-bold">{idx + 1}/{selectedProducts.length}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="p-4 bg-muted rounded-lg">
                          <pre className="text-xs whitespace-pre-wrap font-sans">
                            {generateMessagePreview(product)}
                          </pre>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="mt-2 gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(generateMessagePreview(product));
                              toast({ 
                                title: "Copiado!", 
                                description: `Mensagem do produto ${idx + 1} copiada.` 
                              });
                            }}
                          >
                            <Copy className="w-3 h-3" />
                            Copiar
                          </Button>
                        </div>

                        {idx < selectedProducts.length - 1 && (
                          <div className="border-t pt-4" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button 
                className="w-full gap-2" 
                size="lg"
                disabled={!botConnected || selectedIds.length === 0 || sending}
                onClick={handleSend}
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar {selectedIds.length} Ofertas
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <WhatsAppSettingsModal
        open={showWhatsAppSettings}
        onClose={() => setShowWhatsAppSettings(false)}
        initialSelectedGroups={whatsappGroups}
        onSaveGroups={handleGroupsSaved}
      />

      <AutomationModal
        open={showAutomationModal}
        onClose={() => setShowAutomationModal(false)}
        onStart={handleStartAutomation}
        availableCategories={availableCategories}
        availableMarketplaces={availableMarketplaces}
      />
    </div>
  );
}