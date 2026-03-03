import { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { 
  Settings, Plus, Trash2, Store, ExternalLink, CheckCircle, XCircle, Loader2, Key, Info
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import axios from 'axios';

import { ENV } from '@/config/environment';
const API_URL = `${ENV.API_BASE_URL}/api`;

const NGROK_HEADERS = {
  'ngrok-skip-browser-warning': 'true',
  'Content-Type': 'application/json',
};

type Marketplace = 'mercadolivre' | 'amazon' | 'magalu' | 'shopee';

interface MLStatus {
  authenticated: boolean;
  connectedAt: string | null;
  userId: string | null;
  hasCookies: boolean;
  tokenExpiry: number | null;
}

const MARKETPLACE_COLORS = {
  mercadolivre: '#FFE600',
  amazon: '#FF9900',
  magalu: '#0086FF',
  shopee: '#EE4D2D',
};

export function SettingsPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlAwaitingReturn, setMlAwaitingReturn] = useState(false);

  // Estados para o Modal de Sessão ML
  const [openMLSessionDialog, setOpenMLSessionDialog] = useState(false);
  const [mlSSID, setMlSSID] = useState('');
  const [mlCSRF, setMlCSRF] = useState('');
  const [mlSessionLoading, setMlSessionLoading] = useState(false);

  const [magaluId, setMagaluId] = useState('');
  const [savedMagaluId, setSavedMagaluId] = useState('');
  const [openMagaluDialog, setOpenMagaluDialog] = useState(false);
  const [magaluLoading, setMagaluLoading] = useState(false);

  const mlCardRef     = useRef<HTMLDivElement>(null);
  const amazonCardRef = useRef<HTMLDivElement>(null);
  const magaluCardRef = useRef<HTMLDivElement>(null);
  const shopeeCardRef = useRef<HTMLDivElement>(null);

  const cardRefs: Record<Marketplace, React.RefObject<HTMLDivElement>> = {
    mercadolivre: mlCardRef,
    amazon: amazonCardRef,
    magalu: magaluCardRef,
    shopee: shopeeCardRef,
  };

  useEffect(() => {
    loadMLStatus();
    loadMagaluConfig();
  }, []);

  useEffect(() => {
    const mlConnected = searchParams.get('ml_connected');
    const mlError     = searchParams.get('ml_error');
    const needSession = searchParams.get('need_session');

    if (mlConnected === 'true') {
      toast({
        title: '✅ Mercado Livre conectado!',
        description: 'Sua conta foi autenticada com sucesso.',
        className: 'bg-green-600 text-white border-none',
      });
      setMlAwaitingReturn(false);
      loadMLStatus();
      
      // Se precisar de sessão, abre o modal automaticamente
      if (needSession === 'true') {
        setOpenMLSessionDialog(true);
      }
      
      setSearchParams({});
    }

    if (mlError) {
      const messages: Record<string, string> = {
        no_code:               'Código de autorização não recebido.',
        token_exchange_failed: 'Falha ao trocar o código por token. Tente novamente.',
        access_denied:         'Acesso negado pelo Mercado Livre.',
      };
      toast({
        title: '❌ Falha ao conectar ML',
        description: messages[mlError] || `Erro: ${mlError}`,
        variant: 'destructive',
      });
      setMlAwaitingReturn(false);
      setSearchParams({});
    }
  }, [searchParams]);

  const loadMLStatus = async () => {
    setMlLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/ml/status`, {
        headers: NGROK_HEADERS,
      });
      setMlStatus(data);
      if (data.authenticated) setMlAwaitingReturn(false);
    } catch (error) {
      setMlStatus(null);
    } finally {
      setMlLoading(false);
    }
  };

  const connectML = () => {
    setMlAwaitingReturn(true);
    window.location.href = `${ENV.API_BASE_URL}/api/ml/auth`;
  };

  const disconnectML = async () => {
    try {
      await axios.delete(`${API_URL}/ml/disconnect`, {
        headers: NGROK_HEADERS,
      });
      setMlStatus(null);
      toast({ title: 'Conta desconectada', description: 'Mercado Livre foi desvinculado.' });
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao desconectar.', variant: 'destructive' });
    }
  };

  const saveMLSession = async () => {
    if (!mlSSID.trim()) {
      toast({ title: 'Erro', description: 'O SSID é obrigatório para gerar links meli.la', variant: 'destructive' });
      return;
    }
    setMlSessionLoading(true);
    try {
      await axios.post(
        `${API_URL}/ml/session`,
        { ssid: mlSSID, csrf: mlCSRF },
        { headers: NGROK_HEADERS }
      );
      setOpenMLSessionDialog(false);
      loadMLStatus();
      toast({
        title: '✅ Sessão Ativada!',
        description: 'Agora seus links serão gerados como meli.la',
        className: 'bg-green-600 text-white border-none',
      });
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao salvar sessão.', variant: 'destructive' });
    } finally {
      setMlSessionLoading(false);
    }
  };

  const loadMagaluConfig = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/integrations/magalu`, {
        headers: NGROK_HEADERS,
      });
      if (data?.affiliateId) {
        setSavedMagaluId(data.affiliateId);
        setMagaluId(data.affiliateId);
      }
    } catch (error) {}
  };

  const saveMagaluConfig = async () => {
    if (!magaluId.trim()) {
      toast({ title: 'Erro', description: 'Digite o ID do Parceiro Magalu', variant: 'destructive' });
      return;
    }
    setMagaluLoading(true);
    try {
      await axios.post(
        `${API_URL}/integrations/magalu`,
        { provider: 'magalu', affiliateId: magaluId },
        { headers: NGROK_HEADERS }
      );
      setSavedMagaluId(magaluId);
      setOpenMagaluDialog(false);
      toast({
        title: '✅ Configuração salva!',
        description: `ID "${magaluId}" será usado nos scrapings.`,
        className: 'bg-green-600 text-white border-none',
      });
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao salvar configuração', variant: 'destructive' });
    } finally {
      setMagaluLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('pt-BR');
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas conexões e contas de marketplace</p>
      </div>

      {/* ── MERCADO LIVRE ────────────────────────────────────────────────── */}
      <Card ref={mlCardRef}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKETPLACE_COLORS.mercadolivre }} />
                Mercado Livre
              </CardTitle>
              <CardDescription>Autenticação via OAuth oficial do ML</CardDescription>
            </div>

            {mlStatus?.authenticated ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenMLSessionDialog(true)}>
                  <Key className="w-4 h-4 mr-2" />
                  Atualizar Sessão
                </Button>
                <Button variant="destructive" size="sm" onClick={disconnectML}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Desconectar
                </Button>
              </div>
            ) : (
              <Button onClick={connectML} className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Conectar Conta
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {mlLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Verificando status...
            </div>
          ) : mlStatus?.authenticated ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded-full">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold">Conta conectada</p>
                    <p className="text-sm text-muted-foreground">User ID: {mlStatus.userId}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className="bg-green-500 text-white">AUTENTICADO</Badge>
                  {mlStatus.hasCookies ? (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-200">✅ Sessão Ativa (meli.la)</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">⚠️ Sessão Inativa (Link Comum)</Badge>
                  )}
                </div>
              </div>

              {!mlStatus.hasCookies && (
                <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50/50 text-sm text-yellow-800">
                  <div className="flex items-center gap-2 mb-2 font-bold">
                    <Info className="w-4 h-4" />
                    Ação Necessária
                  </div>
                  <p>Para gerar links encurtados <strong>meli.la</strong>, você precisa ativar a sessão.</p>
                  <Button variant="link" className="p-0 h-auto text-yellow-900 underline" onClick={() => setOpenMLSessionDialog(true)}>
                    Clique aqui para ativar a sessão agora.
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <XCircle className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhuma conta conectada</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL DE SESSÃO ML */}
      <Dialog open={openMLSessionDialog} onOpenChange={setOpenMLSessionDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Ativar Sessão de Afiliado</DialogTitle>
            <DialogDescription>
              O Mercado Livre exige o cookie SSID para gerar links encurtados meli.la.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-800 space-y-1">
              <p><strong>Como pegar:</strong></p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Acesse o Mercado Livre no seu navegador.</li>
                <li>Aperte F12 -> Aba "Application" (ou Aplicativo).</li>
                <li>No menu lateral, clique em "Cookies" -> mercadolivre.com.br.</li>
                <li>Copie os valores de <strong>ssid</strong> e <strong>_csrf_token</strong>.</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ssid">Valor do SSID (Obrigatório)</Label>
              <Input 
                id="ssid" 
                placeholder="Ex: 1.23456789.123456789..." 
                value={mlSSID} 
                onChange={(e) => setMlSSID(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="csrf">Valor do _csrf_token (Opcional)</Label>
              <Input 
                id="csrf" 
                placeholder="Ex: a1b2c3d4..." 
                value={mlCSRF} 
                onChange={(e) => setMlCSRF(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMLSessionDialog(false)}>Cancelar</Button>
            <Button onClick={saveMLSession} disabled={mlSessionLoading}>
              {mlSessionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Ativar Geração meli.la
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MAGALU ──────────────────────────────────────────────────────── */}
      <Card ref={magaluCardRef}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKETPLACE_COLORS.magalu }} />
                Parceiro Magalu
              </CardTitle>
              <CardDescription>ID de afiliado para links diretos</CardDescription>
            </div>
            <Dialog open={openMagaluDialog} onOpenChange={setOpenMagaluDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Configurar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configurar Magalu</DialogTitle>
                  <DialogDescription>Insira seu ID de afiliado do Parceiro Magalu.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="magaluId">ID do Parceiro</Label>
                    <Input id="magaluId" value={magaluId} onChange={(e) => setMagaluId(e.target.value)} placeholder="Ex: seunome" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={saveMagaluConfig} disabled={magaluLoading}>
                    {magaluLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Salvar ID
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {savedMagaluId ? (
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-blue-50/50">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-semibold">ID Ativo: {savedMagaluId}</p>
                <p className="text-xs text-muted-foreground">Links serão gerados automaticamente.</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground border border-dashed rounded-lg">
              Nenhum ID configurado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
