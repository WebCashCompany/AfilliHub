import { useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CategoryRevenueChart } from '@/components/charts/CategoryRevenueChart';
import { MarketplacePieChart } from '@/components/charts/MarketplacePieChart';
import { 
  FileText, Download, Calendar, Clock, Mail, FileSpreadsheet,
  FileText as FilePdf, Table, Send, CheckCircle
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatNumber } from '@/lib/mockData';

export function ReportsPage() {
  const { products, dailyMetrics, categoryMetrics, marketplaceMetrics } = useDashboard();
  const { toast } = useToast();
  
  const [reportType, setReportType] = useState('financial');
  const [period, setPeriod] = useState('30');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleFrequency, setScheduleFrequency] = useState('weekly');

  const totalRevenue = dailyMetrics.reduce((sum, d) => sum + d.revenue, 0);
  const totalConversions = dailyMetrics.reduce((sum, d) => sum + d.conversions, 0);
  const totalClicks = dailyMetrics.reduce((sum, d) => sum + d.clicks, 0);
  const activeProducts = products.filter(p => p.status === 'active').length;
  const protectedProducts = products.filter(p => p.status === 'protected').length;
  const riskProducts = products.filter(p => p.status === 'risk').length;

  const handleExport = (format: string) => {
    toast({
      title: `Exportando ${format.toUpperCase()}`,
      description: "Seu relatório está sendo gerado...",
    });

    setTimeout(() => {
      toast({
        title: "Download iniciado!",
        description: `Relatório ${format.toUpperCase()} pronto para download.`,
      });
    }, 1500);
  };

  const handleScheduleSave = () => {
    if (scheduleEnabled && !scheduleEmail) {
      toast({
        title: "Email obrigatório",
        description: "Informe um email para receber os relatórios.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: scheduleEnabled ? "Agendamento salvo!" : "Agendamento desativado",
      description: scheduleEnabled 
        ? `Relatórios serão enviados ${scheduleFrequency === 'daily' ? 'diariamente' : 'semanalmente'} para ${scheduleEmail}`
        : "O envio automático foi desativado.",
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Gere e exporte relatórios detalhados</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={reportType} onValueChange={setReportType}>
        <TabsList className="mb-6">
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="inventory">Inventário</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="financial" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-2xl font-bold text-status-active">{formatCurrency(totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Conversões</p>
                <p className="text-2xl font-bold">{formatNumber(totalConversions)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
                <p className="text-2xl font-bold">{formatCurrency(totalRevenue / totalConversions)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                <p className="text-2xl font-bold">{((totalConversions / totalClicks) * 100).toFixed(1)}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CategoryRevenueChart data={categoryMetrics} />
            <MarketplacePieChart data={marketplaceMetrics} dataKey="revenue" title="Receita por Marketplace" />
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          {/* Inventory Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total de Produtos</p>
                <p className="text-2xl font-bold">{formatNumber(products.length)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Ativos</p>
                <p className="text-2xl font-bold text-status-active">{formatNumber(activeProducts)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Protegidos</p>
                <p className="text-2xl font-bold text-status-protected">{formatNumber(protectedProducts)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Em Risco</p>
                <p className="text-2xl font-bold text-status-risk">{formatNumber(riskProducts)}</p>
              </CardContent>
            </Card>
          </div>

          <MarketplacePieChart data={marketplaceMetrics} dataKey="products" title="Produtos por Marketplace" />
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MarketplacePieChart data={marketplaceMetrics} dataKey="clicks" title="Cliques por Marketplace" />
            <MarketplacePieChart data={marketplaceMetrics} dataKey="conversions" title="Conversões por Marketplace" />
          </div>
        </TabsContent>
      </Tabs>

      {/* Export & Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              Exportar Relatório
            </CardTitle>
            <CardDescription>
              Baixe o relatório no formato desejado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <Button 
                variant="outline" 
                className="flex-col h-24 gap-2"
                onClick={() => handleExport('pdf')}
              >
                <FilePdf className="w-8 h-8 text-destructive" />
                <span>PDF</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex-col h-24 gap-2"
                onClick={() => handleExport('excel')}
              >
                <FileSpreadsheet className="w-8 h-8 text-status-active" />
                <span>Excel</span>
              </Button>
              <Button 
                variant="outline" 
                className="flex-col h-24 gap-2"
                onClick={() => handleExport('csv')}
              >
                <Table className="w-8 h-8 text-primary" />
                <span>CSV</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Agendamento de Envio
            </CardTitle>
            <CardDescription>
              Receba relatórios automaticamente por email
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="schedule">Ativar envio automático</Label>
              <Switch 
                id="schedule"
                checked={scheduleEnabled}
                onCheckedChange={setScheduleEnabled}
              />
            </div>

            {scheduleEnabled && (
              <>
                <div className="space-y-2">
                  <Label>Email de destino</Label>
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    value={scheduleEmail}
                    onChange={(e) => setScheduleEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Frequência</Label>
                  <Select value={scheduleFrequency} onValueChange={setScheduleFrequency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diário</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Button onClick={handleScheduleSave} className="w-full gap-2">
              <CheckCircle className="w-4 h-4" />
              Salvar Configuração
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
