import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  Settings, Key, Bell, Webhook, Palette, Shield, 
  Save, Eye, EyeOff, CheckCircle, ExternalLink, RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function SettingsPage() {
  const { toast } = useToast();

  // API Settings
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [mlToken, setMlToken] = useState('MLBR-xxxxx-xxxxx-xxxxx-xxxxx');
  const [amazonId, setAmazonId] = useState('affiliate-tag-20');
  const [magaluId, setMagaluId] = useState('mg-affiliate-123');
  const [shopeeId, setShopeeId] = useState('sh_aff_456789');

  // Notification Settings
  const [emailNotif, setEmailNotif] = useState(true);
  const [browserNotif, setBrowserNotif] = useState(true);
  const [scrapingNotif, setScrapingNotif] = useState(true);
  const [goalNotif, setGoalNotif] = useState(true);
  const [riskNotif, setRiskNotif] = useState(true);

  // Webhook Settings
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(false);

  // Theme Settings
  const [isDark, setIsDark] = useState(false);

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = (section: string) => {
    toast({
      title: "Configurações salvas!",
      description: `As configurações de ${section} foram atualizadas.`,
    });
  };

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  const maskToken = (token: string) => {
    if (token.length <= 8) return '••••••••';
    return token.substring(0, 4) + '••••••••' + token.substring(token.length - 4);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie suas preferências e integrações
        </p>
      </div>

      <Tabs defaultValue="api" className="space-y-6">
        <TabsList>
          <TabsTrigger value="api" className="gap-2">
            <Key className="w-4 h-4" />
            APIs & Tokens
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="w-4 h-4" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="theme" className="gap-2">
            <Palette className="w-4 h-4" />
            Aparência
          </TabsTrigger>
        </TabsList>

        {/* API & Tokens */}
        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                Credenciais de Afiliado
              </CardTitle>
              <CardDescription>
                Configure suas chaves de API para cada marketplace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Mercado Livre */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-ml" />
                  Token Mercado Livre
                </Label>
                <div className="flex gap-2">
                  <Input
                    type={showKeys.ml ? 'text' : 'password'}
                    value={showKeys.ml ? mlToken : maskToken(mlToken)}
                    onChange={(e) => setMlToken(e.target.value)}
                    className="font-mono"
                  />
                  <Button variant="outline" size="icon" onClick={() => toggleShowKey('ml')}>
                    {showKeys.ml ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Amazon */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amazon" />
                  Amazon Associate ID
                </Label>
                <div className="flex gap-2">
                  <Input
                    type={showKeys.amazon ? 'text' : 'password'}
                    value={showKeys.amazon ? amazonId : maskToken(amazonId)}
                    onChange={(e) => setAmazonId(e.target.value)}
                    className="font-mono"
                  />
                  <Button variant="outline" size="icon" onClick={() => toggleShowKey('amazon')}>
                    {showKeys.amazon ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Magalu */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-magalu" />
                  Magalu Affiliate ID
                </Label>
                <div className="flex gap-2">
                  <Input
                    type={showKeys.magalu ? 'text' : 'password'}
                    value={showKeys.magalu ? magaluId : maskToken(magaluId)}
                    onChange={(e) => setMagaluId(e.target.value)}
                    className="font-mono"
                  />
                  <Button variant="outline" size="icon" onClick={() => toggleShowKey('magalu')}>
                    {showKeys.magalu ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Shopee */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-shopee" />
                  Shopee Affiliate ID
                </Label>
                <div className="flex gap-2">
                  <Input
                    type={showKeys.shopee ? 'text' : 'password'}
                    value={showKeys.shopee ? shopeeId : maskToken(shopeeId)}
                    onChange={(e) => setShopeeId(e.target.value)}
                    className="font-mono"
                  />
                  <Button variant="outline" size="icon" onClick={() => toggleShowKey('shopee')}>
                    {showKeys.shopee ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Separator />

              <Button onClick={() => handleSave('API')} className="gap-2">
                <Save className="w-4 h-4" />
                Salvar Credenciais
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Preferências de Notificação
              </CardTitle>
              <CardDescription>
                Escolha como deseja receber alertas e atualizações
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Notificações por Email</Label>
                  <p className="text-sm text-muted-foreground">Receba atualizações no seu email</p>
                </div>
                <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Notificações do Navegador</Label>
                  <p className="text-sm text-muted-foreground">Alertas em tempo real no navegador</p>
                </div>
                <Switch checked={browserNotif} onCheckedChange={setBrowserNotif} />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base font-medium">Tipos de Alerta</Label>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Scraping concluído</Label>
                    <p className="text-sm text-muted-foreground">Quando uma coleta é finalizada</p>
                  </div>
                  <Switch checked={scrapingNotif} onCheckedChange={setScrapingNotif} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Progresso de metas</Label>
                    <p className="text-sm text-muted-foreground">Atualizações sobre suas metas</p>
                  </div>
                  <Switch checked={goalNotif} onCheckedChange={setGoalNotif} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Produtos em risco</Label>
                    <p className="text-sm text-muted-foreground">Alertas de produtos sem performance</p>
                  </div>
                  <Switch checked={riskNotif} onCheckedChange={setRiskNotif} />
                </div>
              </div>

              <Separator />

              <Button onClick={() => handleSave('Notificações')} className="gap-2">
                <Save className="w-4 h-4" />
                Salvar Preferências
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks */}
        <TabsContent value="webhooks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="w-5 h-5 text-primary" />
                Integração via Webhook
              </CardTitle>
              <CardDescription>
                Receba eventos em tempo real na sua aplicação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ativar Webhooks</Label>
                  <p className="text-sm text-muted-foreground">Enviar eventos para URL externa</p>
                </div>
                <Switch checked={webhookEnabled} onCheckedChange={setWebhookEnabled} />
              </div>

              {webhookEnabled && (
                <div className="space-y-4 animate-fade-in">
                  <div className="space-y-2">
                    <Label>URL do Webhook</Label>
                    <Input
                      placeholder="https://seu-servidor.com/webhook"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                    />
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <Label className="text-sm">Eventos enviados:</Label>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-status-active" />
                        scraping.completed
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-status-active" />
                        product.added
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-status-active" />
                        product.deleted
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-status-active" />
                        goal.reached
                      </li>
                    </ul>
                  </div>

                  <Button variant="outline" className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Testar Webhook
                  </Button>
                </div>
              )}

              <Separator />

              <Button onClick={() => handleSave('Webhooks')} className="gap-2">
                <Save className="w-4 h-4" />
                Salvar Configuração
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Theme */}
        <TabsContent value="theme" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                Aparência
              </CardTitle>
              <CardDescription>
                Personalize a aparência do dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Modo Escuro</Label>
                  <p className="text-sm text-muted-foreground">Alterne entre tema claro e escuro</p>
                </div>
                <Switch checked={isDark} onCheckedChange={toggleTheme} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => { setIsDark(false); document.documentElement.classList.remove('dark'); }}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    !isDark ? 'border-primary' : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="h-20 bg-white rounded-lg mb-3 border" />
                  <p className="font-medium">Claro</p>
                </button>
                <button
                  onClick={() => { setIsDark(true); document.documentElement.classList.add('dark'); }}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    isDark ? 'border-primary' : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="h-20 bg-slate-900 rounded-lg mb-3" />
                  <p className="font-medium">Escuro</p>
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
