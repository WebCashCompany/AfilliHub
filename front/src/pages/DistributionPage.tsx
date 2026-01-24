// src/pages/DistributionPage.tsx - COM PERSISTÊNCIA COMPLETA

import { useState, useMemo, useEffect } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
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
import { ConnectBotModal } from '@/components/modals/ConnectBotModal';
import { SelectGroupsModal } from '@/components/modals/SelectGroupsModal';
import { 
  Send, MessageCircle, Search, CheckCircle, Eye, Copy,
  Smartphone, Zap, Bot, Settings, Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, Product } from '@/lib/mockData';
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
  const { status } = useWhatsApp(); // ✅ USA O CONTEXTO
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  
  // ✅ CARREGAR ESTADOS DO LOCALSTORAGE
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
  
  // WhatsApp groups - carregados do contexto
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
  
  // Modals
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  
  // Automation states
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [automationActive, setAutomationActive] = useState(false);
  const [automationPaused, setAutomationPaused] = useState(false);
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig | null>(null);

  // ✅ SALVAR whatsappEnabled NO LOCALSTORAGE
  useEffect(() => {
    localStorage.setItem('distribution_whatsapp_enabled', String(whatsappEnabled));
  }, [whatsappEnabled]);

  // ✅ SALVAR telegramEnabled NO LOCALSTORAGE
  useEffect(() => {
    localStorage.setItem('distribution_telegram_enabled', String(telegramEnabled));
  }, [telegramEnabled]);

  // ✅ SALVAR customMessage NO LOCALSTORAGE
  useEffect(() => {
    localStorage.setItem('distribution_custom_message', customMessage);
  }, [customMessage]);

  // ✅ SALVAR whatsappGroups NO LOCALSTORAGE
  useEffect(() => {
    localStorage.setItem('distribution_whatsapp_groups', JSON.stringify(whatsappGroups));
  }, [whatsappGroups]);

  const activeProducts = products.filter(p => p.status === 'active' || p.status === 'protected');
  
  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 50);
  }, [activeProducts, search]);

  const selectedProducts = products.filter(p => selectedIds.includes(p.id));

  // Extract unique categories and marketplaces
  const availableCategories = useMemo(() => {
    const categories = new Set(products.map(p => p.category));
    return Array.from(categories).sort();
  }, [products]);

  const availableMarketplaces = useMemo(() => {
    const marketplaces = new Set(products.map(p => p.marketplace));
    return Array.from(marketplaces).sort();
  }, [products]);

  const handleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBotConnected = () => {
    setShowConnectModal(false);
    setShowGroupsModal(true);
    
    toast({
      title: "Bot conectado!",
      description: "Agora selecione os grupos para enviar ofertas.",
    });
  };

  const handleGroupsSaved = (groups: WhatsAppGroup[]) => {
    setWhatsappGroups(groups);
    toast({
      title: "Grupos salvos!",
      description: `${groups.length} grupo${groups.length > 1 ? 's' : ''} selecionado${groups.length > 1 ? 's' : ''}.`,
    });
  };

  const calculateOldPrice = (product: Product): number => {
    if (product.discount > 0) {
      return product.price * (1 + product.discount / 100);
    }
    return product.price;
  };

  const generateMessagePreview = (product: Product) => {
    const oldPrice = calculateOldPrice(product);
    const message = customMessage || `🔥 *OFERTA IMPERDÍVEL!* 🔥`;
    const link = product.affiliateLink || product.link_afiliado || 'Link indisponível';
    
    return `${message}\n\n` +
           `📦 *${product.name}*\n\n` +
           `💰 De: ~R$ ${oldPrice.toFixed(2).replace('.', ',')}~\n` +
           `💵 Por: *${formatCurrency(product.price)}*\n` +
           `📉 Desconto: *${product.discount}%*\n\n` +
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

    if (whatsappEnabled && whatsappGroups.length === 0) {
      toast({
        title: "Selecione grupos",
        description: "Configure os grupos do WhatsApp antes de enviar.",
        variant: "destructive"
      });
      setShowGroupsModal(true);
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
            link: p.affiliateLink || p.link_afiliado || 'Link indisponível'
          }));

          console.log('📤 Enviando ofertas:', ofertas);

          await whatsappService.sendOffers({
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

  const handleStartAutomation = (config: AutomationConfig) => {
    setAutomationConfig(config);
    setAutomationActive(true);
    setAutomationPaused(false);
    
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
    toast({
      title: "Automação cancelada",
      description: "O bot foi desativado com sucesso.",
      variant: "destructive"
    });
  };

  // ✅ USAR O STATUS DO CONTEXTO
  const botConnected = status.conectado;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hub de Divulgação</h1>
          <p className="text-muted-foreground">
            Selecione produtos e compartilhe via bot nos seus canais
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Automation Button */}
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

      {/* Automation Timer */}
      {automationActive && automationConfig && (
        <AutomationTimer
          intervalMinutes={automationConfig.intervalMinutes}
          isPaused={automationPaused}
          onPause={handlePauseAutomation}
          onResume={handleResumeAutomation}
          onCancel={handleCancelAutomation}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Selection */}
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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Product List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredProducts.map((product) => (
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
                    src={product.image} 
                    alt={product.name}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <MarketplaceBadge marketplace={product.marketplace} size="sm" showLabel={false} />
                      <span className="text-sm text-status-active font-medium">
                        {formatCurrency(product.price)}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        -{product.discount}%
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                <span className="font-medium">{selectedIds.length} produtos selecionados</span>
                <Button variant="ghost" onClick={() => setSelectedIds([])}>Limpar seleção</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bot & Channels */}
        <div className="space-y-6">
          {/* Bot Connection */}
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
                  <Button onClick={() => setShowConnectModal(true)} className="w-full gap-2">
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

                  {/* Channels */}
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
                          onClick={() => setShowGroupsModal(true)}
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

          {/* Message Preview */}
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

      {/* Modals */}
      <ConnectBotModal
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnected={handleBotConnected}
      />

      <SelectGroupsModal
        open={showGroupsModal}
        onClose={() => setShowGroupsModal(false)}
        onSave={handleGroupsSaved}
        initialSelected={whatsappGroups}
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