// front/src/components/WhatsAppSessionManager.tsx
import { useState } from 'react';
import { useWhatsApp } from '@/contexts/WhatsAppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Loader2, Plus, Trash2, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import QRCode from 'react-qr-code';

export function WhatsAppSessionManager() {
  const {
    sessions,
    currentSessionId,
    isConnecting,
    qrCode,
    setCurrentSession,
    connectNewSession,
    disconnectSession,
    getActiveSession
  } = useWhatsApp();

  const [newSessionId, setNewSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleConnectNewSession = async () => {
    if (!newSessionId.trim()) {
      setError('Digite um nome para a sessão');
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await connectNewSession(newSessionId.trim());
      setSuccess('Aguarde o QR Code para escanear...');
      setNewSessionId('');
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar sessão');
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    if (!confirm(`Deseja realmente desconectar a sessão "${sessionId}"?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await disconnectSession(sessionId);
      setSuccess('Sessão desconectada com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Erro ao desconectar sessão');
    }
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSession(sessionId);
    setError(null);
    setSuccess(null);
  };

  const activeSession = getActiveSession();

  return (
    <div className="space-y-6">
      {/* Card de Nova Sessão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Conectar Novo Número
          </CardTitle>
          <CardDescription>
            Conecte múltiplos números WhatsApp simultaneamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sessionId">Nome da Sessão</Label>
            <div className="flex gap-2">
              <Input
                id="sessionId"
                placeholder="Ex: numero-principal, numero-vendas"
                value={newSessionId}
                onChange={(e) => setNewSessionId(e.target.value)}
                disabled={isConnecting}
              />
              <Button
                onClick={handleConnectNewSession}
                disabled={isConnecting || !newSessionId.trim()}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Conectando
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Conectar
                  </>
                )}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {qrCode && (
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border-2 border-green-500">
              <p className="text-sm font-medium mb-4 text-gray-700">
                Escaneie o QR Code com o WhatsApp
              </p>
              <QRCode value={qrCode} size={256} />
              <p className="text-xs text-gray-500 mt-4 text-center">
                Abra o WhatsApp → Mais Opções → Aparelhos Conectados → Conectar
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Sessões Ativas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Sessões Ativas ({sessions.length})
          </CardTitle>
          <CardDescription>
            Gerencie todos os números conectados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma sessão conectada</p>
              <p className="text-sm">Conecte um número para começar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className={`flex items-center justify-between p-4 border rounded-lg transition-all ${
                    currentSessionId === session.sessionId
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        session.conectado ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                    <div>
                      <p className="font-medium">{session.sessionId}</p>
                      {session.phoneNumber && (
                        <p className="text-sm text-gray-500">
                          {session.phoneNumber}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={session.conectado ? 'default' : 'secondary'}>
                      {session.conectado ? 'Online' : 'Offline'}
                    </Badge>

                    {currentSessionId !== session.sessionId && session.conectado && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSelectSession(session.sessionId)}
                      >
                        Selecionar
                      </Button>
                    )}

                    {currentSessionId === session.sessionId && (
                      <Badge variant="outline" className="border-green-500 text-green-700">
                        Em uso
                      </Badge>
                    )}

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

      {/* Sessão Ativa Atual */}
      {activeSession && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="text-green-700">Sessão Ativa</CardTitle>
            <CardDescription>
              Esta é a sessão que será usada para enviar mensagens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <div>
                <p className="font-medium">{activeSession.sessionId}</p>
                {activeSession.phoneNumber && (
                  <p className="text-sm text-gray-500">
                    Número: {activeSession.phoneNumber}
                  </p>
                )}
                {activeSession.connectedAt && (
                  <p className="text-xs text-gray-400">
                    Conectado em: {new Date(activeSession.connectedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}