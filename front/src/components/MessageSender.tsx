// src/components/MessageSender.tsx
import { useState, useEffect } from 'react';
import { useWhatsApp } from '@/contexts/WhatsAppContext';
import { whatsappService } from '@/api/services/whatsapp.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle, Send, Loader2, MessageSquare } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Product {
  id: string;
  nome: string;
  preco: string;
  desconto?: string;
  imagem: string;
  link: string;
}

export function MessageSender() {
  const {
    currentSessionId,
    groups,
    selectedGroups,
    setSelectedGroups,
    loadGroups,
    getActiveSession
  } = useWhatsApp();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeSession = getActiveSession();

  // Carregar grupos quando sessão mudar
  useEffect(() => {
    if (currentSessionId && groups.length === 0) {
      loadGroups(currentSessionId);
    }
  }, [currentSessionId]);

  // Carregar produtos (exemplo)
  useEffect(() => {
    // Aqui você buscaria os produtos da sua API
    setProducts([
      {
        id: '1',
        nome: 'Produto Exemplo 1',
        preco: 'R$ 99,90',
        desconto: '-50%',
        imagem: 'https://via.placeholder.com/150',
        link: 'https://exemplo.com/produto1'
      },
      {
        id: '2',
        nome: 'Produto Exemplo 2',
        preco: 'R$ 149,90',
        desconto: '-30%',
        imagem: 'https://via.placeholder.com/150',
        link: 'https://exemplo.com/produto2'
      }
    ]);
  }, []);

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleProductToggle = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSelectAllGroups = () => {
    if (selectedGroups.length === groups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(groups.map(g => g.id));
    }
  };

  const handleSelectAllProducts = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map(p => p.id));
    }
  };

  const createMessage = (product: Product): string => {
    if (customMessage) {
      return customMessage
        .replace('{nome}', product.nome)
        .replace('{preco}', product.preco)
        .replace('{desconto}', product.desconto || '')
        .replace('{link}', product.link);
    }

    return `🎯 *OFERTA ESPECIAL!*

📦 Produto: ${product.nome}
💰 Preço: ${product.preco}
${product.desconto ? `🔥 Desconto: ${product.desconto}` : ''}

🔗 Link: ${product.link}

⏰ Oferta por tempo limitado!`;
  };

  const handleSend = async () => {
    if (!currentSessionId) {
      setResult({ type: 'error', message: 'Selecione uma sessão ativa' });
      return;
    }

    if (selectedGroups.length === 0) {
      setResult({ type: 'error', message: 'Selecione pelo menos um grupo' });
      return;
    }

    if (selectedProducts.length === 0) {
      setResult({ type: 'error', message: 'Selecione pelo menos um produto' });
      return;
    }

    setIsSending(true);
    setResult(null);

    try {
      const selectedProductsData = products.filter(p => selectedProducts.includes(p.id));
      
      // Enviar para cada grupo
      for (const groupId of selectedGroups) {
        const ofertas = selectedProductsData.map(product => ({
          nome: product.nome,
          mensagem: createMessage(product),
          imagem: product.imagem,
          link: product.link
        }));

        await whatsappService.sendOffers({
          sessionId: currentSessionId,
          grupoId: groupId,
          ofertas
        });
      }

      setResult({
        type: 'success',
        message: `Enviado com sucesso para ${selectedGroups.length} grupo(s)!`
      });

      // Limpar seleções
      setSelectedProducts([]);
      
    } catch (error: any) {
      setResult({
        type: 'error',
        message: error.message || 'Erro ao enviar mensagens'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendTest = async () => {
    if (!currentSessionId) {
      setResult({ type: 'error', message: 'Selecione uma sessão ativa' });
      return;
    }

    if (selectedGroups.length === 0) {
      setResult({ type: 'error', message: 'Selecione um grupo para teste' });
      return;
    }

    setIsSending(true);
    setResult(null);

    try {
      await whatsappService.sendTest(currentSessionId, selectedGroups[0]);
      
      setResult({
        type: 'success',
        message: 'Mensagem de teste enviada!'
      });
    } catch (error: any) {
      setResult({
        type: 'error',
        message: error.message || 'Erro ao enviar teste'
      });
    } finally {
      setIsSending(false);
    }
  };

  if (!activeSession || !activeSession.conectado) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert>
            <MessageSquare className="h-4 w-4" />
            <AlertDescription>
              Conecte uma sessão do WhatsApp para enviar mensagens
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Seleção de Grupos */}
      <Card>
        <CardHeader>
          <CardTitle>Selecionar Grupos ({selectedGroups.length})</CardTitle>
          <CardDescription>
            Escolha os grupos que receberão as mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAllGroups}
            >
              {selectedGroups.length === groups.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </Button>
            <span className="text-sm text-gray-500">
              {selectedGroups.length} de {groups.length} selecionados
            </span>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              Nenhum grupo encontrado
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50"
                >
                  <Checkbox
                    id={group.id}
                    checked={selectedGroups.includes(group.id)}
                    onCheckedChange={() => handleGroupToggle(group.id)}
                  />
                  <Label htmlFor={group.id} className="flex-1 cursor-pointer">
                    <div>
                      <p className="font-medium">{group.nome}</p>
                      <p className="text-xs text-gray-500">
                        {group.participantes} participantes
                      </p>
                    </div>
                  </Label>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seleção de Produtos */}
      <Card>
        <CardHeader>
          <CardTitle>Selecionar Produtos ({selectedProducts.length})</CardTitle>
          <CardDescription>
            Escolha os produtos que serão divulgados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAllProducts}
            >
              {selectedProducts.length === products.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </Button>
            <span className="text-sm text-gray-500">
              {selectedProducts.length} de {products.length} selecionados
            </span>
          </div>

          <div className="space-y-2">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50"
              >
                <Checkbox
                  id={product.id}
                  checked={selectedProducts.includes(product.id)}
                  onCheckedChange={() => handleProductToggle(product.id)}
                />
                <img
                  src={product.imagem}
                  alt={product.nome}
                  className="w-12 h-12 object-cover rounded"
                />
                <Label htmlFor={product.id} className="flex-1 cursor-pointer">
                  <div>
                    <p className="font-medium">{product.nome}</p>
                    <p className="text-sm text-gray-500">
                      {product.preco} {product.desconto && `• ${product.desconto}`}
                    </p>
                  </div>
                </Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mensagem Personalizada */}
      <Card>
        <CardHeader>
          <CardTitle>Mensagem Personalizada (Opcional)</CardTitle>
          <CardDescription>
            Use {'{nome}'}, {'{preco}'}, {'{desconto}'}, {'{link}'} para variáveis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Deixe em branco para usar mensagem padrão"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={6}
          />
        </CardContent>
      </Card>

      {/* Resultado */}
      {result && (
        <Alert variant={result.type === 'error' ? 'destructive' : 'default'}>
          {result.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}

      {/* Botões de Ação */}
      <div className="flex gap-3">
        <Button
          onClick={handleSendTest}
          variant="outline"
          disabled={isSending || selectedGroups.length === 0}
          className="flex-1"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <MessageSquare className="w-4 h-4 mr-2" />
          )}
          Enviar Teste
        </Button>

        <Button
          onClick={handleSend}
          disabled={isSending || selectedGroups.length === 0 || selectedProducts.length === 0}
          className="flex-1"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Enviar Mensagens
        </Button>
      </div>
    </div>
  );
}