import { useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClicksConversionsChart } from '@/components/charts/ClicksConversionsChart';
import { CategoryRevenueChart } from '@/components/charts/CategoryRevenueChart';
import { MarketplacePieChart } from '@/components/charts/MarketplacePieChart';
import { formatCurrency, formatNumber, formatPercent, Marketplace, getMarketplaceName } from '@/lib/mockData';
import { Calendar, Filter, TrendingUp, TrendingDown, Users, ShoppingCart, ArrowRight, Percent } from 'lucide-react';

export function AnalyticsPage() {
  const { dailyMetrics, categoryMetrics, marketplaceMetrics, products } = useDashboard();
  const [period, setPeriod] = useState('30');
  const [marketplace, setMarketplace] = useState<'all' | Marketplace>('all');

  const filteredMetrics = dailyMetrics.slice(-Number(period));

  // Funnel data
  const totalImpressions = filteredMetrics.reduce((sum, d) => sum + d.clicks * 3, 0);
  const totalClicks = filteredMetrics.reduce((sum, d) => sum + d.clicks, 0);
  const totalConversions = filteredMetrics.reduce((sum, d) => sum + d.conversions, 0);
  const totalRevenue = filteredMetrics.reduce((sum, d) => sum + d.revenue, 0);

  const ctr = (totalClicks / totalImpressions) * 100;
  const conversionRate = (totalConversions / totalClicks) * 100;
  const abandonRate = 100 - conversionRate;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Análise detalhada de performance e conversões</p>
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
          <Select value={marketplace} onValueChange={(v) => setMarketplace(v as any)}>
            <SelectTrigger className="w-44">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Marketplaces</SelectItem>
              <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
              <SelectItem value="amazon">Amazon</SelectItem>
              <SelectItem value="magalu">Magalu</SelectItem>
              <SelectItem value="shopee">Shopee</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Funnel Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Funil de Conversão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Impressions */}
            <div className="flex-1 text-center p-6 bg-primary/5 rounded-xl">
              <div className="text-3xl font-bold text-primary mb-1">
                {formatNumber(totalImpressions)}
              </div>
              <div className="text-sm text-muted-foreground">Impressões</div>
            </div>
            <ArrowRight className="w-6 h-6 text-muted-foreground hidden md:block" />
            {/* Clicks */}
            <div className="flex-1 text-center p-6 bg-chart-1/10 rounded-xl">
              <div className="text-3xl font-bold text-chart-1 mb-1">
                {formatNumber(totalClicks)}
              </div>
              <div className="text-sm text-muted-foreground">Cliques</div>
              <div className="text-xs text-muted-foreground mt-1">
                CTR: {formatPercent(ctr)}
              </div>
            </div>
            <ArrowRight className="w-6 h-6 text-muted-foreground hidden md:block" />
            {/* Conversions */}
            <div className="flex-1 text-center p-6 bg-status-active/10 rounded-xl">
              <div className="text-3xl font-bold text-status-active mb-1">
                {formatNumber(totalConversions)}
              </div>
              <div className="text-sm text-muted-foreground">Conversões</div>
              <div className="text-xs text-muted-foreground mt-1">
                Taxa: {formatPercent(conversionRate)}
              </div>
            </div>
            <ArrowRight className="w-6 h-6 text-muted-foreground hidden md:block" />
            {/* Revenue */}
            <div className="flex-1 text-center p-6 bg-amazon/10 rounded-xl">
              <div className="text-3xl font-bold text-amazon mb-1">
                {formatCurrency(totalRevenue)}
              </div>
              <div className="text-sm text-muted-foreground">Receita</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Abandon Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Abandono</p>
                <p className="text-2xl font-bold text-destructive">{formatPercent(abandonRate)}</p>
              </div>
              <div className="p-3 bg-destructive/10 rounded-full">
                <TrendingDown className="w-6 h-6 text-destructive" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {formatNumber(totalClicks - totalConversions)} usuários não converteram
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
                <p className="text-2xl font-bold">{formatCurrency(totalRevenue / totalConversions)}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-full">
                <ShoppingCart className="w-6 h-6 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Comissão média por conversão
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">ROI Estimado</p>
                <p className="text-2xl font-bold text-status-active">+{formatPercent(247)}</p>
              </div>
              <div className="p-3 bg-status-active/10 rounded-full">
                <TrendingUp className="w-6 h-6 text-status-active" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Retorno sobre investimento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ClicksConversionsChart data={filteredMetrics} />
        <MarketplacePieChart 
          data={marketplaceMetrics} 
          dataKey="conversions"
          title="Conversões por Marketplace"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryRevenueChart data={categoryMetrics} />
        <Card>
          <CardHeader>
            <CardTitle>Performance por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryMetrics.slice(0, 6).map((cat, index) => (
                <div key={cat.category} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate">{cat.category}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {formatCurrency(cat.revenue)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${(cat.revenue / categoryMetrics[0].revenue) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
