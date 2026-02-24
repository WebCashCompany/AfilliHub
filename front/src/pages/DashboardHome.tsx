// src/pages/DashboardHome.tsx
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
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // Calculate totals
  const totalClicks = dailyMetrics.reduce((sum, d) => sum + d.clicks, 0);
  const totalConversions = dailyMetrics.reduce((sum, d) => sum + d.conversions, 0);
  const totalRevenue = dailyMetrics.reduce((sum, d) => sum + d.revenue, 0);
  const goalProgress = 78;

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

  const activeProducts = products.filter(p => p.status === 'active').length;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do seu desempenho de afiliados
          </p>
        </div>

        {/* Badge de produtos ativos — ocupa linha própria no mobile */}
        <div className="flex items-center gap-2 px-3 py-2 bg-status-active/10 rounded-lg self-start sm:self-auto">
          <TrendingUp className="w-4 h-4 text-status-active shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-status-active whitespace-nowrap">
            {activeProducts} produtos ativos
          </span>
        </div>
      </div>

      {/* ── KPI Cards
            Mobile  : 2 colunas
            Tablet  : 2 colunas
            Desktop : 4 colunas
      ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
          title="Receita"
          value={formatCurrency(totalRevenue)}
          change={Number(revenueChange.toFixed(1))}
          icon={DollarSign}
          variant="warning"
        />
        <KPICard
          title="Meta Mensal"
          value={`${goalProgress}%`}
          icon={Target}
          variant="default"
          changeLabel="meta mensal"
        />
      </div>

      {/* ── Charts Row 1
            Mobile  : 1 coluna (empilhados)
            Desktop : 3 colunas (gráfico de linha ocupa 2/3)
      ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Ocupa 2 colunas no desktop */}
        <div className="lg:col-span-2 min-w-0">
          <ClicksConversionsChart data={dailyMetrics} />
        </div>
        <div className="min-w-0">
          <MarketplacePieChart
            data={marketplaceMetrics}
            dataKey="revenue"
            title="Receita por Marketplace"
          />
        </div>
      </div>

      {/* ── Charts Row 2
            Mobile  : 1 coluna (empilhados)
            Desktop : 2 colunas
      ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="min-w-0">
          <TopProductsChart products={products} />
        </div>
        <div className="min-w-0">
          <MarketplacePieChart
            data={marketplaceMetrics}
            dataKey="clicks"
            title="Cliques por Marketplace"
          />
        </div>
      </div>

    </div>
  );
}