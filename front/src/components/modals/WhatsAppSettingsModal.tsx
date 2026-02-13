// src/components/modals/WhatsAppSettingsModal.tsx - CORRIGIDO: LIXEIRA = EXCLUIR / RADIO = CONECTAR/DESCONECTAR
import { useState, useEffect } from 'react';
import { useWhatsApp } from '@/contexts/WhatsAppContext';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  X, 
  Smartphone, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Loader2,
  Users,
  Search,
  Settings,
  ChevronRight,
  Power,
  PowerOff
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { whatsappService, type WhatsAppGroup } from '@/api/services/whatsapp.service';

interface WhatsAppSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialSelectedGroups?: WhatsAppGroup[];
  onSaveGroups?: (groups: WhatsAppGroup[]) => void;
}

export function WhatsAppSettingsModal({ 
  open, 
  onClose,
  initialSelectedGroups = [],
  onSaveGroups
}: WhatsAppSettingsModalProps) {
  const {
    sessions,
    currentSessionId,
    qrCode,
    isConnecting,
    setCurrentSession,
    connectNewSession,
    disconnectSession
  } = useWhatsApp();

  const { toast } = useToast();
  
  const [newSessionName, setNewSessionName] = useState('');
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  
  const [selectedSessionForGroups, setSelectedSessionForGroups] = useState<string | null>(null);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [searchGroups, setSearchGroups] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedSessionForGroups(null);
      setGroups([]);
      setSelectedGroupIds(initialSelectedGroups.map(g => g.id));
    }
  }, [open]);

  const loadGroupsForSession = async (sessionId: string) => {
    setLoadingGroups(true);
    try {
      const data = await whatsappService.listGroups(sessionId);
      setGroups(data);
    } catch (error) {
      toast({
        title: "Erro ao carregar grupos",
        description: "Não foi possível buscar os grupos do WhatsApp.",
        variant: "destructive"
      });
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleSelectSessionForGroups = async (sessionId: string) => {
    setSelectedSessionForGroups(sessionId);
    await loadGroupsForSession(sessionId);
  };

  const handleBackToSessionSelection = () => {
    setSelectedSessionForGroups(null);
    setGroups([]);
    setSearchGroups('');
  };

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
      toast({
        title: "Conectando...",
        description: "Aguarde o QR Code aparecer"
      });
    } catch (error: any) {
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // ⭐ EXCLUIR SESSÃO (Botão Lixeira)
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm(`Deseja realmente EXCLUIR a sessão "${sessionId}"?`)) {
      return;
    }

    try {
      await disconnectSession(sessionId);
      toast({
        title: "Sessão excluída",
        description: `Sessão "${sessionId}" foi removida.`
      });
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // ⭐ CONECTAR/DESCONECTAR SESSÃO (Botão Radio Verde)
  const handleToggleSession = async (session: any) => {
    if (session.conectado) {
      // Desconectar
      if (!confirm(`Deseja DESCONECTAR a sessão "${session.sessionId}"?`)) {
        return;
      }
      
      try {
        await disconnectSession(session.sessionId);
        toast({
          title: "Sessão desconectada",
          description: `Sessão "${session.sessionId}" foi desconectada.`
        });
      } catch (error: any) {
        toast({
          title: "Erro ao desconectar",
          description: error.message,
          variant: "destructive"
        });
      }
    } else {
      // Reconectar
      try {
        await connectNewSession(session.sessionId);
        toast({
          title: "Reconectando...",
          description: "Aguarde o QR Code aparecer"
        });
      } catch (error: any) {
        toast({
          title: "Erro ao reconectar",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSession(sessionId);
    toast({
      title: "Sessão alterada",
      description: `Agora usando "${sessionId}"`
    });
  };

  const handleToggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId) 
        : [...prev, groupId]
    );
  };

  const handleSaveGroups = () => {
    const selected = groups.filter(g => selectedGroupIds.includes(g.id));
    if (onSaveGroups) {
      onSaveGroups(selected);
    }
    toast({
      title: "Grupos salvos!",
      description: `${selected.length} grupo${selected.length > 1 ? 's' : ''} selecionado${selected.length > 1 ? 's' : ''}`
    });
    onClose();
  };

  const filteredGroups = groups.filter(g =>
    g.nome.toLowerCase().includes(searchGroups.toLowerCase())
  );

  const onlineSessions = Array.isArray(sessions) ? sessions.filter(s => s.conectado) : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configurações do WhatsApp
            </h2>
            <p className="text-sm text-muted-foreground">
              Gerencie sessões e selecione grupos
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QR Code */}
        {qrCode && (
          <div className="mb-6 p-4 border-2 border-green-500 rounded-lg bg-green-50 dark:bg-green-950/20">
            <div className="flex flex-col items-center gap-3">
              <p className="font-medium text-green-700 dark:text-green-400">
                Escaneie o QR Code
              </p>
              <div className="bg-white p-3 rounded-lg">
                <QRCode value={qrCode} size={200} />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                WhatsApp → Dispositivos Conectados → Conectar
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="sessions" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sessions">
              <Smartphone className="w-4 h-4 mr-2" />
              Sessões
            </TabsTrigger>
            <TabsTrigger value="groups">
              <Users className="w-4 h-4 mr-2" />
              Grupos
            </TabsTrigger>
          </TabsList>

          {/* TAB: SESSÕES */}
          <TabsContent value="sessions" className="space-y-4 mt-4">
            {!showNewSessionForm && (
              <Button 
                onClick={() => setShowNewSessionForm(true)}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Conectar Novo Número
              </Button>
            )}

            {showNewSessionForm && (
              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="newSession">Nome da Sessão</Label>
                <Input
                  id="newSession"
                  placeholder="Ex: numero-principal, numero-vendas"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnectNew()}
                  disabled={isConnecting}
                />
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
              </div>
            )}

            {/* Lista de Sessões */}
            <div className="space-y-2">
              {!Array.isArray(sessions) || sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma sessão conectada</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      currentSessionId === session.sessionId
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* ⭐ BOTÃO RADIO - CONECTAR/DESCONECTAR */}
                      <button
                        onClick={() => handleToggleSession(session)}
                        className="flex items-center justify-center"
                      >
                        {session.conectado ? (
                          <Power className="w-5 h-5 text-green-500 cursor-pointer hover:text-green-600" />
                        ) : (
                          <PowerOff className="w-5 h-5 text-gray-400 cursor-pointer hover:text-gray-600" />
                        )}
                      </button>
                      
                      <div>
                        <p className="font-medium">{session.sessionId}</p>
                        {session.phoneNumber && (
                          <p className="text-xs text-muted-foreground">
                            {session.phoneNumber}
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
                          Usar
                        </Button>
                      ) : null}

                      {/* ⭐ BOTÃO LIXEIRA - EXCLUIR */}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteSession(session.sessionId)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* TAB: GRUPOS */}
          <TabsContent value="groups" className="space-y-4 mt-4">
            {!selectedSessionForGroups ? (
              <div className="space-y-3">
                <div className="text-center py-4">
                  <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium mb-2">Selecione um número</p>
                  <p className="text-sm text-muted-foreground">
                    Escolha qual número deseja gerenciar os grupos
                  </p>
                </div>

                {onlineSessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nenhuma sessão online</p>
                    <p className="text-xs mt-2">Conecte um número primeiro</p>
                  </div>
                ) : (
                  onlineSessions.map((session) => (
                    <button
                      key={session.sessionId}
                      onClick={() => handleSelectSessionForGroups(session.sessionId)}
                      className="w-full flex items-center justify-between p-4 border rounded-lg hover:border-primary hover:bg-primary/5 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                          <Smartphone className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">{session.sessionId}</p>
                          {session.phoneNumber && (
                            <p className="text-sm text-muted-foreground">
                              {session.phoneNumber}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 pb-3 border-b">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToSessionSelection}
                  >
                    ← Voltar
                  </Button>
                  <div className="flex-1">
                    <p className="font-medium">
                      {sessions.find(s => s.sessionId === selectedSessionForGroups)?.sessionId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Selecione os grupos
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar grupo..."
                    value={searchGroups}
                    onChange={(e) => setSearchGroups(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {loadingGroups ? (
                  <div className="py-12 flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Carregando grupos...</p>
                  </div>
                ) : (
                  <div className="h-[300px] overflow-y-auto space-y-2">
                    {filteredGroups.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Nenhum grupo encontrado</p>
                      </div>
                    ) : (
                      filteredGroups.map((group) => (
                        <div
                          key={group.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedGroupIds.includes(group.id)
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/30'
                          }`}
                          onClick={() => handleToggleGroup(group.id)}
                        >
                          <Checkbox
                            checked={selectedGroupIds.includes(group.id)}
                            onCheckedChange={() => handleToggleGroup(group.id)}
                          />
                          <div className="flex-1">
                            <p className="font-medium">{group.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.participantes} participantes
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {selectedGroupIds.length > 0 && (
                  <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                    <span className="text-sm font-medium">
                      {selectedGroupIds.length} grupo{selectedGroupIds.length > 1 ? 's' : ''} selecionado{selectedGroupIds.length > 1 ? 's' : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedGroupIds([])}
                    >
                      Limpar
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6 pt-6 border-t">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button 
            onClick={handleSaveGroups}
            disabled={selectedGroupIds.length === 0}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Salvar Seleção
          </Button>
        </div>
      </div>
    </div>
  );
}