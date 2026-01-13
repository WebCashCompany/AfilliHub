import { useState, useMemo } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MarketplaceBadge } from '@/components/dashboard/MarketplaceBadge';
import { 
  Send, MessageCircle, Search, CheckCircle, Eye, Copy,
  Smartphone, ExternalLink, Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, Product } from '@/lib/mockData';

export function DistributionPage() {
  const { products } = useDashboard();
  const { toast } = useToast();
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [botConnected, setBotConnected] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  const activeProducts = products.filter(p => p.status === 'active' || p.status === 'protected');
  
  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 50);
  }, [activeProducts, search]);

  const selectedProducts = products.filter(p => selectedIds.includes(p.id));

  const handleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleConnectBot = () => {
    setBotConnected(true);
    toast({
      title: "Bot conectado!",
      description: "DivulgaLinks está pronto para enviar suas ofertas.",
    });
  };

  const handleSend = () => {
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

    const channels = [];
    if (whatsappEnabled) channels.push('WhatsApp');
    if (telegramEnabled) channels.push('Telegram');

    toast({
      title: "Ofertas enviadas!",
      description: `${selectedIds.length} ofertas enviadas para ${channels.join(' e ')}.`,
    });

    setSelectedIds([]);
  };

  const generateMessagePreview = (product: Product) => {
    const message = customMessage || `🔥 *OFERTA IMPERDÍVEL!*\n\n`;
    return `${message}📦 *${product.name}*\n\n` +
           `💰 De: ~R$ ${product.originalPrice.toFixed(2)}~\n` +
           `🏷️ Por: *${formatCurrency(product.price)}*\n` +
           `📉 Desconto: *${product.discount}% OFF*\n\n` +
           `🛒 Compre agora: ${product.affiliateLink}\n\n` +
           `⚡ Corra! Estoque limitado!`;
  };

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
        {botConnected && (
          <Badge variant="outline" className="gap-2 px-3 py-1.5 border-status-active text-status-active">
            <CheckCircle className="w-4 h-4" />
            Bot Conectado
          </Badge>
        )}
      </div>

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
                <Button onClick={() => setSelectedIds([])}>Limpar seleção</Button>
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
                  <Button onClick={handleConnectBot} className="w-full gap-2">
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
                          <p className="text-xs text-muted-foreground">3 grupos conectados</p>
                        </div>
                      </div>
                      <Switch 
                        checked={whatsappEnabled} 
                        onCheckedChange={setWhatsappEnabled}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Send className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Telegram</p>
                          <p className="text-xs text-muted-foreground">2 canais conectados</p>
                        </div>
                      </div>
                      <Switch 
                        checked={telegramEnabled} 
                        onCheckedChange={setTelegramEnabled}
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
                <div className="p-4 bg-muted rounded-lg">
                  <pre className="text-xs whitespace-pre-wrap font-sans">
                    {generateMessagePreview(selectedProducts[0])}
                  </pre>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mt-2 gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(generateMessagePreview(selectedProducts[0]));
                      toast({ title: "Copiado!", description: "Mensagem copiada para a área de transferência." });
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    Copiar
                  </Button>
                </div>
              )}

              <Button 
                className="w-full gap-2" 
                size="lg"
                disabled={!botConnected || selectedIds.length === 0}
                onClick={handleSend}
              >
                <Send className="w-4 h-4" />
                Enviar {selectedIds.length} Ofertas
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
