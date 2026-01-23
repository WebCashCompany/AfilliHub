// src/components/modals/SelectGroupsModal.tsx

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, Users, Search, X } from 'lucide-react';
import { whatsappService, type WhatsAppGroup } from '@/api/services/whatsapp.service';
import { useToast } from '@/hooks/use-toast';

interface SelectGroupsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (selectedGroups: WhatsAppGroup[]) => void;
  initialSelected?: WhatsAppGroup[];
}

export function SelectGroupsModal({ 
  open, 
  onClose, 
  onSave,
  initialSelected = []
}: SelectGroupsModalProps) {
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Carregar grupos ao abrir
  useEffect(() => {
    if (open) {
      loadGroups();
      setSelectedIds(initialSelected.map(g => g.id));
    }
  }, [open]);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await whatsappService.listGroups();
      setGroups(data);
    } catch (error) {
      toast({
        title: "Erro ao carregar grupos",
        description: "Não foi possível buscar os grupos do WhatsApp.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    const selected = groups.filter(g => selectedIds.includes(g.id));
    onSave(selected);
    onClose();
  };

  const filteredGroups = groups.filter(g =>
    g.nome.toLowerCase().includes(search.toLowerCase())
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-lg p-6 z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Selecionar Grupos do WhatsApp
            </h2>
            <p className="text-sm text-muted-foreground">
              Escolha os grupos onde as ofertas serão enviadas
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando grupos...</p>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar grupo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Groups List */}
            <div className="h-[300px] overflow-y-auto pr-2 space-y-2">
              {filteredGroups.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <p>Nenhum grupo encontrado</p>
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div
                    key={group.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedIds.includes(group.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                    onClick={() => handleToggle(group.id)}
                  >
                    <Checkbox
                      checked={selectedIds.includes(group.id)}
                      onCheckedChange={() => handleToggle(group.id)}
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

            {/* Selected Count */}
            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg mt-4">
                <span className="text-sm font-medium">
                  {selectedIds.length} grupo{selectedIds.length > 1 ? 's' : ''} selecionado{selectedIds.length > 1 ? 's' : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                >
                  Limpar
                </Button>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || selectedIds.length === 0}
          >
            Salvar Seleção
          </Button>
        </div>
      </div>
    </div>
  );
}