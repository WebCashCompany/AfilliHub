import { useDashboard } from '@/contexts/DashboardContext';
import { KPICard } from '@/components/dashboard/KPICard';
import { ClicksConversionsChart } from '@/components/charts/ClicksConversionsChart';
import { TopProductsChart } from '@/components/charts/TopProductsChart';
import { MarketplacePieChart } from '@/components/charts/MarketplacePieChart';
import { MousePointer, ShoppingCart, DollarSign, Target, TrendingUp } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/mockData';

export function DashboardHome() {
  const { products, dailyMetrics, marketplaceMetrics, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // Calculate totals
  const totalClicks = dailyMetrics.reduce((sum, d) => sum + d.clicks, 0);
  const totalConversions = dailyMetrics.reduce((sum, d) => sum + d.conversions, 0);
  const totalRevenue = dailyMetrics.reduce((sum, d) => sum + d.revenue, 0);
  const avgCTR = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
  const goalProgress = 78; // Simulated

  // Calculate changes (comparing last 15 days to previous 15 days)
  const midPoint = Math.floor(dailyMetrics.length / 2);
  const recentClicks = dailyMetrics.slice(midPoint).reduce((sum, d) => sum + d.clicks, 0);
  const previousClicks = dailyMetrics.slice(0, midPoint).reduce((sum, d) => sum + d.clicks, 0);
  const clicksChange = previousClicks > 0 ? ((recentClicks - previousClicks) / previousClicks) * 100 : 0;

  const recentConversions = dailyMetrics.slice(midPoint).reduce((sum, d) => sum + d.conversions, 0);
  const previousConversions = dailyMetrics.slice(0, midPoint).reduce((sum, d) => sum + d.conversions, 0);
  const conversionsChange = previousConversions > 0 ? ((recentConversions - previousConversions) / previousConversions) * 100 : 0;

  const recentRevenue = dailyMetrics.slice(midPoint).reduce((sum, d) => sum + d.revenue, 0);
  const previousRevenue = dailyMetrics.slice(0, midPoint).reduce((sum, d) => sum + d.revenue, 0);
  const revenueChange = previousRevenue > 0 ? ((recentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu desempenho de afiliados</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-status-active/10 rounded-lg">
          <TrendingUp className="w-4 h-4 text-status-active" />
          <span className="text-sm font-medium text-status-active">
            {products.filter(p => p.status === 'active').length} produtos ativos
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total de Cliques"
          value={formatNumber(totalClicks)}
          change={Number(clicksChange.toFixed(1))}
          icon={MousePointer}
          variant="primary"
        />
        <KPICard
          title="Conversões"
          value={formatNumber(totalConversions)}
          change={Number(conversionsChange.toFixed(1))}
          icon={ShoppingCart}
          variant="success"
        />
        <KPICard
          title="Receita (Comissões)"
          value={formatCurrency(totalRevenue)}
          change={Number(revenueChange.toFixed(1))}
          icon={DollarSign}
          variant="warning"
        />
        <KPICard
          title="Progresso da Meta"
          value={`${goalProgress}%`}
          icon={Target}
          variant="default"
          changeLabel="meta mensal"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ClicksConversionsChart data={dailyMetrics} />
        <MarketplacePieChart 
          data={marketplaceMetrics} 
          dataKey="revenue"
          title="Receita por Marketplace"
        />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopProductsChart products={products} />
        <MarketplacePieChart 
          data={marketplaceMetrics} 
          dataKey="clicks"
          title="Cliques por Marketplace"
        />
      </div>
    </div>
  );
}
