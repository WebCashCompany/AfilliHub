import { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { 
  Settings, Plus, Trash2, Store, ExternalLink, CheckCircle, XCircle, Loader2, Key, Info, ShieldCheck, AlertCircle, HelpCircle
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
      toast({ title: 'Erro', description: 'O SSID é obrigatório para gerar links afiliados', variant: 'destructive' });
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
      
      // Notifica o sistema sobre a atualização do ML
      window.dispatchEvent(new CustomEvent('ml-connected'));
      
      toast({
        title: '✅ Sessão Ativada!',
        description: 'Agora seus links serão gerados como afiliado!',
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
    } catch (error) {
      console.error('Erro ao carregar Magalu:', error);
    }
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
      
      // Notifica o sistema sobre a atualização do Magalu
      window.dispatchEvent(new CustomEvent('magalu-config-updated'));
      
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

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas conexões e contas de marketplace para automação.</p>
      </div>

      <div className="grid gap-6">
        {/* ── MERCADO LIVRE ────────────────────────────────────────────────── */}
        <Card ref={mlCardRef} className="overflow-hidden border-zinc-800 bg-zinc-950/50 backdrop-blur-sm">
          <CardHeader className="border-b border-zinc-800/50 bg-zinc-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-xl bg-[#FFE600]/10">
                  <Store className="w-6 h-6 text-[#FFE600]" />
                </div>
                <div>
                  <CardTitle className="text-xl">Mercado Livre</CardTitle>
                  <CardDescription>Conexão oficial via OAuth para geração de links afiliados</CardDescription>
                </div>
              </div>

              {mlStatus?.authenticated ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-zinc-700 hover:bg-zinc-800" onClick={() => setOpenMLSessionDialog(true)}>
                    <Key className="w-4 h-4 mr-2" />
                    Sessão
                  </Button>
                  <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-red-400 hover:bg-red-400/10" onClick={disconnectML}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button onClick={connectML} className="bg-[#FFE600] text-black hover:bg-[#FFE600]/90 font-bold gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Conectar Conta
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {mlLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#FFE600]" />
                <p className="text-sm font-medium">Sincronizando com Mercado Livre...</p>
              </div>
            ) : mlStatus?.authenticated ? (
              <div className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                    <div className="p-2 rounded-full bg-emerald-500/10">
                      <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Status da Conta</p>
                      <p className="font-semibold text-emerald-500">Autenticado</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-4 p-4 rounded-xl border ${mlStatus.hasCookies ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                    <div className={`p-2 rounded-full ${mlStatus.hasCookies ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                      {mlStatus.hasCookies ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Geração Afiliada</p>
                      <p className={`font-semibold ${mlStatus.hasCookies ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {mlStatus.hasCookies ? 'Ativa' : 'Inativa'}
                      </p>
                    </div>
                  </div>
                </div>

                {!mlStatus.hasCookies && (
                  <div className="relative group overflow-hidden p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
                    <div className="flex items-start gap-4 relative z-10">
                      <div className="p-3 rounded-xl bg-amber-500/20 text-amber-500">
                        <Key className="w-6 h-6" />
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-bold text-amber-200">Ação Necessária: Ativar Sessão</h4>
                        <p className="text-sm text-amber-200/70 leading-relaxed">
                          Para que o sistema consiga gerar links <strong>afiliados</strong>, é necessário fornecer o token de sessão (SSID) da sua conta.
                        </p>
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
                          onClick={() => setOpenMLSessionDialog(true)}
                        >
                          Configurar sessão agora <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
                  <Store className="w-10 h-10 text-zinc-700" />
                </div>
                <div className="max-w-xs space-y-1">
                  <p className="font-bold text-zinc-300">Nenhuma conta conectada</p>
                  <p className="text-sm text-zinc-500">Conecte sua conta do Mercado Livre para começar a gerar links de afiliado automaticamente.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── MAGALU ──────────────────────────────────────────────────────── */}
        <Card ref={magaluCardRef} className="overflow-hidden border-zinc-800 bg-zinc-950/50 backdrop-blur-sm">
          <CardHeader className="border-b border-zinc-800/50 bg-zinc-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-xl bg-[#0086FF]/10">
                  <Store className="w-6 h-6 text-[#0086FF]" />
                </div>
                <div>
                  <CardTitle className="text-xl">Parceiro Magalu</CardTitle>
                  <CardDescription>ID de afiliado para links diretos</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-zinc-700 hover:bg-zinc-800" onClick={() => setOpenMagaluDialog(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Configurar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {savedMagaluId ? (
              <div className="flex items-center gap-4 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <div className="p-2 rounded-full bg-blue-500/10">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">ID do Parceiro</p>
                  <p className="font-semibold text-blue-500">{savedMagaluId}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                Nenhum ID configurado
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* MODAL DE SESSÃO ML */}
      <Dialog open={openMLSessionDialog} onOpenChange={setOpenMLSessionDialog}>
        <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Key className="w-6 h-6 text-amber-500" />
              Ativar Sessão
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Siga os passos abaixo para capturar o SSID e ativar a geração de links encurtados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                <HelpCircle className="w-4 h-4" />
                Como obter os dados?
              </div>
              <ol className="text-xs text-zinc-400 space-y-2 list-decimal ml-4">
                <li>Acesse o Mercado Livre no seu navegador.</li>
                <li>Aperte <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700">F12</kbd> &rarr; Aba <strong>Application</strong> (ou Aplicativo).</li>
                <li>No menu lateral, clique em <strong>Cookies</strong> &rarr; mercadolivre.com.br.</li>
                <li>Copie os valores de <strong>ssid</strong> e <strong>_csrf_token</strong>.</li>
              </ol>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ssid" className="text-zinc-300 font-medium">Valor do SSID (Obrigatório)</Label>
                <Input 
                  id="ssid" 
                  className="bg-zinc-900 border-zinc-800 focus:ring-amber-500/50"
                  placeholder="Ex: 1.23456789.123456789..." 
                  value={mlSSID} 
                  onChange={(e) => setMlSSID(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="csrf" className="text-zinc-300 font-medium">Valor do _csrf_token (Opcional)</Label>
                <Input 
                  id="csrf" 
                  className="bg-zinc-900 border-zinc-800 focus:ring-amber-500/50"
                  placeholder="Ex: a1b2c3d4..." 
                  value={mlCSRF} 
                  onChange={(e) => setMlCSRF(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="bg-zinc-900/20 p-4 -mx-6 -mb-6 border-t border-zinc-800/50">
            <Button variant="ghost" className="text-zinc-400 hover:text-zinc-200" onClick={() => setOpenMLSessionDialog(false)}>Cancelar</Button>
            <Button onClick={saveMLSession} disabled={mlSessionLoading} className="bg-amber-500 text-black hover:bg-amber-400 font-bold">
              {mlSessionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Ativar Geração Afiliada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL MAGALU */}
      <Dialog open={openMagaluDialog} onOpenChange={setOpenMagaluDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle>Configurar Magalu</DialogTitle>
            <DialogDescription className="text-zinc-400">Insira seu ID de afiliado do Parceiro Magalu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="magaluId">ID do Parceiro</Label>
              <Input id="magaluId" className="bg-zinc-900 border-zinc-800" value={magaluId} onChange={(e) => setMagaluId(e.target.value)} placeholder="Ex: seunome" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveMagaluConfig} disabled={magaluLoading} className="bg-blue-600 hover:bg-blue-500">
              {magaluLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar ID
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
 