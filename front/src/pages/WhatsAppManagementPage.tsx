// src/pages/WhatsAppManagementPage.tsx - PÁGINA COMPLETA DE GERENCIAMENTO
import { useState } from 'react';
import { useWhatsApp } from '@/contexts/WhatsAppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Smartphone, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  Users,
  Radio
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { useToast } from '@/hooks/use-toast';

export function WhatsAppManagementPage() {
  const {
    sessions,
    currentSessionId,
    groups,
    qrCode,
    isConnecting,
    setCurrentSession,
    connectNewSession,
    disconnectSession,
    loadGroups
  } = useWhatsApp();

  const { toast } = useToast();
  const [newSessionName, setNewSessionName] = useState('');
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);

  const handleConnectNew = async () => {
    if (!newSessionName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Digite um nome para a sessão",
        variant: "destructive"
      });
      return;
    }

    try {
      await connectNewSession(newSessionName.trim());
      setNewSessionName('');
      setShowNewSessionForm(false);
    } catch (error: any) {
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    if (!confirm(`Deseja realmente desconectar a sessão "${sessionId}"?`)) {
      return;
    }

    try {
      await disconnectSession(sessionId);
      toast({
        title: "Sessão desconectada",
        description: `Sessão "${sessionId}" foi desconectada com sucesso.`
      });
    } catch (error: any) {
      toast({
        title: "Erro ao desconectar",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSession(sessionId);
    toast({
      title: "Sessão alterada",
      description: `Agora usando a sessão "${sessionId}" para enviar mensagens.`
    });
    
    // Carregar grupos da nova sessão
    await loadGroups(sessionId);
  };

  const activeSession = sessions.find(s => s.sessionId === currentSessionId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Gerenciamento de WhatsApp</h1>
        <p className="text-muted-foreground">
          Conecte múltiplos números e gerencie suas sessões
        </p>
      </div>

      {/* QR Code (se estiver conectando) */}
      {qrCode && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="text-green-700">Escaneie o QR Code</CardTitle>
            <CardDescription>
              Use o WhatsApp para escanear este código
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCode value={qrCode} size={256} />
            </div>
            <p className="text-sm text-center text-muted-foreground">
              WhatsApp → Dispositivos Conectados → Conectar
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sessão Ativa */}
      {activeSession && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-green-600" />
              Sessão Ativa
            </CardTitle>
            <CardDescription>
              Esta sessão será usada para enviar mensagens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-medium">{activeSession.sessionId}</p>
                  {activeSession.phoneNumber && (
                    <p className="text-sm text-muted-foreground">
                      {activeSession.phoneNumber}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600">
                  <Users className="w-3 h-3 mr-1" />
                  {groups.length} grupos
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Sessões */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Sessões Conectadas ({sessions.length})
              </CardTitle>
              <CardDescription>
                Gerencie todas as sessões do WhatsApp
              </CardDescription>
            </div>
            {!showNewSessionForm && (
              <Button onClick={() => setShowNewSessionForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Sessão
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Formulário Nova Sessão */}
          {showNewSessionForm && (
            <Card className="border-primary">
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newSession">Nome da Nova Sessão</Label>
                  <Input
                    id="newSession"
                    placeholder="Ex: numero-vendas, numero-suporte"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnectNew()}
                    disabled={isConnecting}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowNewSessionForm(false);
                      setNewSessionName('');
                    }}
                    disabled={isConnecting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleConnectNew}
                    disabled={isConnecting || !newSessionName.trim()}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Conectar
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de Sessões */}
          {sessions.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Nenhuma sessão conectada. Clique em "Nova Sessão" para conectar um número.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className={`flex items-center justify-between p-4 border rounded-lg transition-all ${
                    currentSessionId === session.sessionId
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        session.conectado ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                      }`}
                    />
                    <div>
                      <p className="font-medium">{session.sessionId}</p>
                      {session.phoneNumber && (
                        <p className="text-sm text-muted-foreground">
                          {session.phoneNumber}
                        </p>
                      )}
                      {session.connectedAt && (
                        <p className="text-xs text-muted-foreground">
                          Conectado em {new Date(session.connectedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={session.conectado ? 'default' : 'secondary'}>
                      {session.conectado ? 'Online' : 'Offline'}
                    </Badge>

                    {currentSessionId === session.sessionId ? (
                      <Badge variant="outline" className="border-green-500 text-green-700">
                        Em uso
                      </Badge>
                    ) : session.conectado ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSelectSession(session.sessionId)}
                      >
                        Usar esta
                      </Button>
                    ) : null}

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDisconnect(session.sessionId)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações */}
      <Card>
        <CardHeader>
          <CardTitle>Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">✅ Acesso Simultâneo</h3>
            <p className="text-sm text-muted-foreground">
              Você e sua equipe podem acessar de computadores diferentes. As mensagens serão 
              enviadas pelos números conectados aqui.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">🔄 Múltiplas Sessões</h3>
            <p className="text-sm text-muted-foreground">
              Conecte vários números WhatsApp. Você pode alternar entre eles para enviar mensagens.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">🔒 Desconectar</h3>
            <p className="text-sm text-muted-foreground">
              Clique no botão de lixeira para desconectar uma sessão. Você pode reconectar 
              o mesmo número depois.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}