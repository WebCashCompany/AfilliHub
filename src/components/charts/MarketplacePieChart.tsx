import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';
import { MarketplaceMetrics, formatCurrency, getMarketplaceName } from '@/lib/mockData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MarketplacePieChartProps {
  data: MarketplaceMetrics[];
  dataKey?: 'revenue' | 'clicks' | 'products' | 'conversions';
  title?: string;
}

export function MarketplacePieChart({ 
  data, 
  dataKey = 'revenue',
  title = 'Distribuição por Marketplace' 
}: MarketplacePieChartProps) {
  const colors = {
    mercadolivre: 'hsl(52, 100%, 50%)',
    amazon: 'hsl(36, 100%, 50%)',
    magalu: 'hsl(209, 100%, 50%)',
    shopee: 'hsl(11, 84%, 56%)'
  };

  const chartData = data.map(item => ({
    name: getMarketplaceName(item.marketplace),
    value: item[dataKey],
    marketplace: item.marketplace
  }));

  const formatValue = (value: number) => {
    if (dataKey === 'revenue') return formatCurrency(value);
    return value.toLocaleString('pt-BR');
  };

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percent > 0.05 ? (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor="middle" 
        dominantBaseline="central"
        className="text-xs font-semibold"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={100}
                innerRadius={40}
                fill="#8884d8"
                dataKey="value"
                stroke="hsl(var(--card))"
                strokeWidth={3}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={colors[entry.marketplace as keyof typeof colors]} 
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-lg)'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [formatValue(value), '']}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => (
                  <span className="text-sm text-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
