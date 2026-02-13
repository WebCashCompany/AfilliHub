import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Settings, Plus, Trash2, CheckCircle, XCircle, Clock, Power, Store
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import axios from 'axios';

import { ENV } from '@/config/environment';
const API_URL = `${ENV.API_BASE_URL}/api`;

type Marketplace = 'mercadolivre' | 'amazon' | 'magalu' | 'shopee';

interface Account {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  lastValidated: string;
  status: 'valid' | 'expired' | 'error';
}

const MARKETPLACE_COLORS = {
  mercadolivre: '#FFE600',
  amazon: '#FF9900',
  magalu: '#0086FF',
  shopee: '#EE4D2D',
};

export function SettingsPage() {
  const location = useLocation();
  const { toast } = useToast();
  
  // Mercado Livre State
  const [mlAccounts, setMlAccounts] = useState<Account[]>([]);
  const [openMlDialog, setOpenMlDialog] = useState(false);
  const [accountName, setAccountName] = useState('');
  
  // Magalu State
  const [magaluId, setMagaluId] = useState('');
  const [savedMagaluId, setSavedMagaluId] = useState('');
  const [openMagaluDialog, setOpenMagaluDialog] = useState(false);
  
  const [loading, setLoading] = useState(false);

  // Refs para cada card de marketplace
  const mlCardRef = useRef<HTMLDivElement>(null);
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
    loadMLAccounts();
    loadMagaluConfig();
  }, []);

  // Efeito para highlight quando vier de outra página
  useEffect(() => {
    const state = location.state as { highlightMarketplace?: Marketplace } | null;
    if (state?.highlightMarketplace) {
      const marketplace = state.highlightMarketplace;
      const cardRef = cardRefs[marketplace];
      
      setTimeout(() => {
        if (cardRef.current) {
          cardRef.current.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
          cardRef.current.classList.add('marketplace-highlight');
          setTimeout(() => {
            cardRef.current?.classList.remove('marketplace-highlight');
          }, 4000);
        }
      }, 300);
    }
  }, [location.state]);

  // --- MERCADO LIVRE ACTIONS ---
  const loadMLAccounts = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/sessions/ml`);
      setMlAccounts(data.accounts || []);
    } catch (error) {
      console.error('Erro ao carregar contas ML:', error);
    }
  };

  const createAccount = async () => {
    if (!accountName.trim()) {
      toast({ title: "Erro", description: "Digite um nome para a conta", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/sessions/ml/create`, { name: accountName });
      toast({
        title: "Navegador aberto!",
        description: "Faça login no Mercado Livre. Quando fechar o navegador, a sessão será salva.",
      });
      setOpenMlDialog(false);
      setAccountName('');
      setTimeout(() => loadMLAccounts(), 3000);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao criar conta", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const setActive = async (accountId: string) => {
    try {
      await axios.put(`${API_URL}/sessions/ml/${accountId}/activate`);
      toast({ title: "Conta ativada!", description: "Esta conta será usada nas automações" });
      loadMLAccounts();
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao ativar conta", variant: "destructive" });
    }
  };

  const deleteAccount = async (accountId: string) => {
    try {
      await axios.delete(`${API_URL}/sessions/ml/${accountId}`);
      toast({ title: "Conta removida!", description: "A conta foi excluída com sucesso" });
      loadMLAccounts();
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao remover conta", variant: "destructive" });
    }
  };

  const reauth = async (accountId: string) => {
    try {
      await axios.post(`${API_URL}/sessions/ml/${accountId}/reauth`);
      toast({ title: "Navegador aberto!", description: "Faça login novamente" });
      setTimeout(() => loadMLAccounts(), 3000);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao reautenticar", variant: "destructive" });
    }
  };

  // --- MAGALU ACTIONS ---
  const loadMagaluConfig = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/integrations/magalu`);
      if (data && data.affiliateId) {
        setSavedMagaluId(data.affiliateId);
        setMagaluId(data.affiliateId);
        
        window.dispatchEvent(new CustomEvent('magalu-config-updated', { 
          detail: { affiliateId: data.affiliateId } 
        }));
      }
    } catch (error) {
      console.log('Nenhuma configuração do Magalu encontrada');
    }
  };

  const saveMagaluConfig = async () => {
    if (!magaluId.trim()) {
      toast({ title: "Erro", description: "Digite o ID do Parceiro Magalu", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/integrations/magalu`, { 
        provider: 'magalu',
        affiliateId: magaluId 
      });
      
      setSavedMagaluId(magaluId);
      setOpenMagaluDialog(false);
      
      window.dispatchEvent(new CustomEvent('magalu-config-updated', { 
        detail: { affiliateId: magaluId } 
      }));
      
      toast({ 
        title: "✅ Configuração salva!", 
        description: `ID "${magaluId}" será usado nos próximos scrapings.`,
        className: "bg-green-600 text-white border-none",
      });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao salvar configuração", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      valid: { color: 'bg-green-500', text: 'Válida' },
      expired: { color: 'bg-red-500', text: 'Expirada' },
      error: { color: 'bg-yellow-500', text: 'Erro' }
    };
    const s = styles[status as keyof typeof styles] || styles.error;
    return <Badge className={`${s.color} text-white`}>{s.text}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas conexões e contas de marketplace</p>
      </div>

      {/* MERCADO LIVRE */}
      <Card ref={mlCardRef} className="transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: MARKETPLACE_COLORS.mercadolivre }}
                />
                Mercado Livre
              </CardTitle>
              <CardDescription>Gerencie suas contas de afiliado</CardDescription>
            </div>
            
            <Dialog open={openMlDialog} onOpenChange={setOpenMlDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Conectar Conta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Conta - Mercado Livre</DialogTitle>
                  <DialogDescription>
                    Digite um nome para identificar esta conta. O navegador abrirá para você fazer login.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Nome da Conta</Label>
                    <Input
                      placeholder="Ex: Conta Principal"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createAccount()}
                    />
                  </div>
                  <Button onClick={createAccount} disabled={loading} className="w-full">
                    {loading ? 'Aguarde...' : 'Abrir Navegador'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {mlAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Settings className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhuma conta conectada</p>
              <p className="text-sm">Clique em "Conectar Conta" para adicionar</p>
            </div>
          ) : (
            mlAccounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{account.name}</h4>
                    {account.isActive && <Badge variant="default">ATIVA</Badge>}
                    {getStatusBadge(account.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{account.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Criada: {new Date(account.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  {!account.isActive && (
                    <Button variant="outline" size="sm" onClick={() => setActive(account.id)}>
                      <Power className="w-4 h-4 mr-1" />
                      Ativar
                    </Button>
                  )}
                  {account.status === 'expired' && (
                    <Button variant="outline" size="sm" onClick={() => reauth(account.id)}>
                      Reautenticar
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => deleteAccount(account.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* MAGALU */}
      <Card ref={magaluCardRef} className="transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: MARKETPLACE_COLORS.magalu }}
                />
                Magazine Luiza
              </CardTitle>
              <CardDescription>Configure o ID do Parceiro Magalu</CardDescription>
            </div>
            
            <Dialog open={openMagaluDialog} onOpenChange={setOpenMagaluDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2" variant={savedMagaluId ? "outline" : "default"}>
                  <Settings className="w-4 h-4" />
                  {savedMagaluId ? "Alterar ID" : "Configurar ID"}
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
                  <Button onClick={saveMagaluConfig} disabled={loading} className="w-full">
                    {loading ? 'Salvando...' : 'Salvar Configuração'}
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

      {/* AMAZON - EM BREVE */}
      <Card ref={amazonCardRef} className="opacity-50 transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: MARKETPLACE_COLORS.amazon }}
                />
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

      {/* SHOPEE - EM BREVE */}
      <Card ref={shopeeCardRef} className="opacity-50 transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: MARKETPLACE_COLORS.shopee }}
                />
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
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0);
            transform: scale(1);
          }
          25% {
            box-shadow: 0 0 0 8px rgba(var(--primary-rgb), 0.3);
            transform: scale(1.01);
          }
          50% {
            box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0);
            transform: scale(1);
          }
        }
        
        .marketplace-highlight {
          animation: marketplace-pulse 2s ease-out 2;
          border-color: hsl(var(--primary)) !important;
          border-width: 2px;
        }
        
        :root {
          --primary-rgb: 59, 130, 246;
        }
      `}</style>
    </div>
  );
}