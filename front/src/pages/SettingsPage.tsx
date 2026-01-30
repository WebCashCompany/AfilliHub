import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Settings, Plus, Trash2, CheckCircle, XCircle, Clock, Power
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

interface Account {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  lastValidated: string;
  status: 'valid' | 'expired' | 'error';
}

interface MarketplaceStatus {
  connected: boolean;
  accounts: number;
  activeAccount: Account | null;
  validAccounts: number;
  expiredAccounts: number;
}

export function SettingsPage() {
  const { toast } = useToast();
  const [mlAccounts, setMlAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [accountName, setAccountName] = useState('');

  useEffect(() => {
    loadMLAccounts();
  }, []);

  const loadMLAccounts = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/sessions/ml`);
      setMlAccounts(data.accounts || []);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
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

      setOpenDialog(false);
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FFE600]" />
                Mercado Livre
              </CardTitle>
              <CardDescription>Gerencie suas contas de afiliado</CardDescription>
            </div>
            
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
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

      {/* AMAZON - EM BREVE */}
      <Card className="opacity-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF9900]" />
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

      {/* MAGALU - EM BREVE */}
      <Card className="opacity-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#0086FF]" />
                Magazine Luiza
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
      <Card className="opacity-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#EE4D2D]" />
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
    </div>
  );
}