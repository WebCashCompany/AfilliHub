import { useState } from 'react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { 
  Target, TrendingUp, TrendingDown, Edit2, Save, Plus,
  DollarSign, MousePointer, ShoppingCart, Calendar
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber } from '@/lib/mockData';

interface Goal {
  id: string;
  name: string;
  type: 'revenue' | 'clicks' | 'conversions';
  target: number;
  current: number;
  period: string;
}

export function GoalsPage() {
  const { dailyMetrics } = useDashboard();
  const { toast } = useToast();

  // Calculate current values from daily metrics
  const totalRevenue = dailyMetrics.reduce((sum, d) => sum + d.revenue, 0);
  const totalClicks = dailyMetrics.reduce((sum, d) => sum + d.clicks, 0);
  const totalConversions = dailyMetrics.reduce((sum, d) => sum + d.conversions, 0);

  const [goals, setGoals] = useState<Goal[]>([
    { id: '1', name: 'Faturamento Mensal', type: 'revenue', target: 15000, current: totalRevenue, period: 'Janeiro 2026' },
    { id: '2', name: 'Meta de Cliques', type: 'clicks', target: 80000, current: totalClicks, period: 'Janeiro 2026' },
    { id: '3', name: 'Conversões', type: 'conversions', target: 5000, current: totalConversions, period: 'Janeiro 2026' },
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<number>(0);

  const getIcon = (type: string) => {
    switch (type) {
      case 'revenue': return DollarSign;
      case 'clicks': return MousePointer;
      case 'conversions': return ShoppingCart;
      default: return Target;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'revenue': return 'text-amazon';
      case 'clicks': return 'text-primary';
      case 'conversions': return 'text-status-active';
      default: return 'text-foreground';
    }
  };

  const formatValue = (type: string, value: number) => {
    if (type === 'revenue') return formatCurrency(value);
    return formatNumber(value);
  };

  const calculateProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  const calculateProjection = (current: number, daysElapsed: number, daysInMonth: number) => {
    if (daysElapsed === 0) return current;
    return (current / daysElapsed) * daysInMonth;
  };

  const handleEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setEditTarget(goal.target);
  };

  const handleSave = (id: string) => {
    setGoals(prev => prev.map(g => 
      g.id === id ? { ...g, target: editTarget } : g
    ));
    setEditingId(null);
    toast({
      title: "Meta atualizada!",
      description: "Sua nova meta foi salva com sucesso.",
    });
  };

  const daysInMonth = 31;
  const currentDay = new Date().getDate();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Metas</h1>
          <p className="text-muted-foreground">
            Acompanhe o progresso das suas metas mensais
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">
            Dia {currentDay} de {daysInMonth} ({Math.round((currentDay / daysInMonth) * 100)}% do mês)
          </span>
        </div>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {goals.map((goal) => {
          const Icon = getIcon(goal.type);
          const progress = calculateProgress(goal.current, goal.target);
          const projection = calculateProjection(goal.current, currentDay, daysInMonth);
          const willMeetGoal = projection >= goal.target;

          return (
            <Card key={goal.id} className="relative overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-muted ${getColor(goal.type)}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{goal.name}</CardTitle>
                      <CardDescription>{goal.period}</CardDescription>
                    </div>
                  </div>
                  {editingId !== goal.id && (
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(goal)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current vs Target */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Atual</span>
                    <span className="text-2xl font-bold">{formatValue(goal.type, goal.current)}</span>
                  </div>
                  
                  {editingId === goal.id ? (
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Meta:</Label>
                      <Input
                        type="number"
                        value={editTarget}
                        onChange={(e) => setEditTarget(Number(e.target.value))}
                        className="w-32"
                      />
                      <Button size="sm" onClick={() => handleSave(goal.id)}>
                        <Save className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Meta</span>
                      <span className="text-lg font-medium text-muted-foreground">
                        {formatValue(goal.type, goal.target)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <Progress value={progress} className="h-3" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{progress.toFixed(1)}%</span>
                    <span className="text-muted-foreground">
                      Faltam {formatValue(goal.type, Math.max(0, goal.target - goal.current))}
                    </span>
                  </div>
                </div>

                {/* Projection */}
                <div className={`p-3 rounded-lg ${willMeetGoal ? 'bg-status-active/10' : 'bg-status-risk/10'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {willMeetGoal ? (
                      <TrendingUp className="w-4 h-4 text-status-active" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-status-risk" />
                    )}
                    <span className={`text-sm font-medium ${willMeetGoal ? 'text-status-active' : 'text-status-risk'}`}>
                      Projeção de Fechamento
                    </span>
                  </div>
                  <p className={`text-lg font-bold ${willMeetGoal ? 'text-status-active' : 'text-status-risk'}`}>
                    {formatValue(goal.type, projection)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {willMeetGoal 
                      ? `+${((projection / goal.target - 1) * 100).toFixed(0)}% acima da meta`
                      : `${((1 - projection / goal.target) * 100).toFixed(0)}% abaixo da meta`
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Monthly Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Resumo do Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {goals.map((goal) => {
              const progress = calculateProgress(goal.current, goal.target);
              const projection = calculateProjection(goal.current, currentDay, daysInMonth);
              
              return (
                <div key={goal.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{goal.name}</span>
                    <span className={`text-sm font-bold ${progress >= 100 ? 'text-status-active' : ''}`}>
                      {progress.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-1000 rounded-full"
                      style={{ 
                        width: `${progress}%`,
                        background: progress >= 100 
                          ? 'hsl(var(--status-active))'
                          : progress >= 80 
                            ? 'hsl(var(--primary))'
                            : progress >= 50
                              ? 'hsl(var(--amazon-orange))'
                              : 'hsl(var(--destructive))'
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatValue(goal.type, goal.current)}</span>
                    <span>{formatValue(goal.type, goal.target)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
