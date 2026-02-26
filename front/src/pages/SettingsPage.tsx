import { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Settings, Plus, Trash2, Store, ExternalLink, CheckCircle, XCircle, Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import axios from 'axios';

import { ENV } from '@/config/environment';
const API_URL = `${ENV.API_BASE_URL}/api`;

// ─────────────────────────────────────────────────────────
// HEADERS PADRÃO — ngrok obrigatório em todas as requisições
// ─────────────────────────────────────────────────────────
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

  // Mercado Livre State
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlAwaitingReturn, setMlAwaitingReturn] = useState(false);

  // Magalu State
  const [magaluId, setMagaluId] = useState('');
  const [savedMagaluId, setSavedMagaluId] = useState('');
  const [openMagaluDialog, setOpenMagaluDialog] = useState(false);
  const [magaluLoading, setMagaluLoading] = useState(false);

  // Refs para highlight
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

  // Processa retorno do OAuth ML
  useEffect(() => {
    const mlConnected = searchParams.get('ml_connected');
    const mlError     = searchParams.get('ml_error');

    if (mlConnected === 'true') {
      toast({
        title: '✅ Mercado Livre conectado!',
        description: 'Sua conta foi autenticada com sucesso.',
        className: 'bg-green-600 text-white border-none',
      });
      setMlAwaitingReturn(false);
      loadMLStatus();
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

  // Highlight ao vir de outra página
  useEffect(() => {
    const state = location.state as { highlightMarketplace?: Marketplace } | null;
    if (state?.highlightMarketplace) {
      const marketplace = state.highlightMarketplace;
      const cardRef = cardRefs[marketplace];
      setTimeout(() => {
        if (cardRef.current) {
          cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          cardRef.current.classList.add('marketplace-highlight');
          setTimeout(() => cardRef.current?.classList.remove('marketplace-highlight'), 4000);
        }
      }, 300);
    }
  }, [location.state]);

  // ─── Mercado Livre Actions ─────────────────────────────────────────────────
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
    window.open(`${ENV.API_BASE_URL}/api/ml/auth`, '_blank');
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

  // ─── Magalu Actions ────────────────────────────────────────────────────────
  const loadMagaluConfig = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/integrations/magalu`, {
        headers: NGROK_HEADERS,
      });
      if (data?.affiliateId) {
        setSavedMagaluId(data.affiliateId);
        setMagaluId(data.affiliateId);
        window.dispatchEvent(new CustomEvent('magalu-config-updated', { detail: { affiliateId: data.affiliateId } }));
      }
    } catch (error) {
      // Sem config salva
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
      window.dispatchEvent(new CustomEvent('magalu-config-updated', { detail: { affiliateId: magaluId } }));
      toast({
        title: '✅ Configuração salva!',
        description: `ID "${magaluId}" será usado nos próximos scrapings.`,
        className: 'bg-green-600 text-white border-none',
      });
    } catch (error) {
      toast({ title: 'Erro', description: 'Falha ao salvar configuração', variant: 'destructive' });
    } finally {
      setMagaluLoading(false);
    }
  };

  // ─── Helpers de UI ────────────────────────────────────────────────────────
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('pt-BR');
  };

  const isTokenExpired = (expiry: number | null) => {
    if (!expiry) return false;
    return Date.now() > expiry;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas conexões e contas de marketplace</p>
      </div>

      {/* ── MERCADO LIVRE ────────────────────────────────────────────────── */}
      <Card ref={mlCardRef} className="transition-all duration-300">
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
              <Button variant="destructive" size="sm" onClick={disconnectML}>
                <Trash2 className="w-4 h-4 mr-2" />
                Desconectar
              </Button>
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
                    {mlStatus.userId && (
                      <p className="text-sm text-muted-foreground">User ID: {mlStatus.userId}</p>
                    )}
                    {mlStatus.connectedAt && (
                      <p className="text-xs text-muted-foreground">
                        Conectado em: {formatDate(mlStatus.connectedAt)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className="bg-green-500 text-white">AUTENTICADO</Badge>
                  {mlStatus.hasCookies && (
                    <Badge variant="outline" className="text-xs">🍪 Cookies OK</Badge>
                  )}
                  {mlStatus.tokenExpiry && isTokenExpired(mlStatus.tokenExpiry) && (
                    <Badge variant="destructive" className="text-xs">Token expirado</Badge>
                  )}
                </div>
              </div>

              {!mlStatus.hasCookies && (
                <div className="flex items-start gap-2 p-3 border border-yellow-200 rounded-lg bg-yellow-50/50 dark:bg-yellow-950/20 text-sm text-yellow-800 dark:text-yellow-300">
                  <span>⚠️</span>
                  <span>
                    Cookies de sessão não capturados. Os links afiliados podem não funcionar corretamente.
                    Tente desconectar e reconectar a conta.
                  </span>
                </div>
              )}

              {mlStatus.tokenExpiry && isTokenExpired(mlStatus.tokenExpiry) && (
                <Button variant="outline" className="w-full" onClick={connectML}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Renovar autenticação
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <XCircle className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhuma conta conectada</p>
              <p className="text-sm">
                Clique em "Conectar Conta" para autenticar via Mercado Livre
              </p>
              {mlAwaitingReturn && (
                <p className="text-sm text-blue-500 mt-3 animate-pulse">
                  Complete o login na aba aberta e volte aqui para verificar a conexão.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── MAGALU ───────────────────────────────────────────────────────── */}
      <Card ref={magaluCardRef} className="transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKETPLACE_COLORS.magalu }} />
                Magazine Luiza
              </CardTitle>
              <CardDescription>Configure o ID do Parceiro Magalu</CardDescription>
            </div>

            <Dialog open={openMagaluDialog} onOpenChange={setOpenMagaluDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2" variant={savedMagaluId ? 'outline' : 'default'}>
                  <Settings className="w-4 h-4" />
                  {savedMagaluId ? 'Alterar ID' : 'Configurar ID'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configuração Magazine Luiza</DialogTitle>
                  <DialogDescription>
                    Insira o ID da sua loja (ex: magazinepromoforia). Este ID será usado para gerar os links de afiliado.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>ID do Parceiro / Loja</Label>
                    <div className="relative">
                      <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="ex: magazinepromoforia"
                        value={magaluId}
                        onChange={(e) => setMagaluId(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveMagaluConfig()}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O ID deve ser exatamente como aparece na URL da sua loja Magalu.
                    </p>
                  </div>
                  <Button onClick={saveMagaluConfig} disabled={magaluLoading} className="w-full">
                    {magaluLoading ? 'Salvando...' : 'Salvar Configuração'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {savedMagaluId ? (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-full">
                  <Store className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ID Ativo</p>
                  <p className="font-bold text-lg">{savedMagaluId}</p>
                </div>
              </div>
              <Badge className="bg-green-500 hover:bg-green-600 text-white">CONECTADO</Badge>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Settings className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhum ID configurado</p>
              <p className="text-sm">Clique em "Configurar ID" para adicionar</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AMAZON - EM BREVE ─────────────────────────────────────────────── */}
      <Card ref={amazonCardRef} className="opacity-50 transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKETPLACE_COLORS.amazon }} />
                Amazon
              </CardTitle>
              <CardDescription>Em breve</CardDescription>
            </div>
            <Button disabled className="gap-2">
              <Plus className="w-4 h-4" />
              Conectar Conta
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* ── SHOPEE - EM BREVE ─────────────────────────────────────────────── */}
      <Card ref={shopeeCardRef} className="opacity-50 transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MARKETPLACE_COLORS.shopee }} />
                Shopee
              </CardTitle>
              <CardDescription>Em breve</CardDescription>
            </div>
            <Button disabled className="gap-2">
              <Plus className="w-4 h-4" />
              Conectar Conta
            </Button>
          </div>
        </CardHeader>
      </Card>

      <style>{`
        @keyframes marketplace-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0); transform: scale(1); }
          25%       { box-shadow: 0 0 0 8px rgba(var(--primary-rgb), 0.3); transform: scale(1.01); }
          50%       { box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0); transform: scale(1); }
        }
        .marketplace-highlight {
          animation: marketplace-pulse 2s ease-out 2;
          border-color: hsl(var(--primary)) !important;
          border-width: 2px;
        }
        :root { --primary-rgb: 59, 130, 246; }
      `}</style>
    </div>
  );
}