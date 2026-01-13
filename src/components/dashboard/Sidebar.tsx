import { NavLink } from '@/components/NavLink';
import {
  LayoutDashboard,
  BarChart3,
  Zap,
  Package,
  Send,
  FileText,
  Target,
  Settings,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { icon: Zap, label: 'Automação', path: '/automation' },
  { icon: Package, label: 'Produtos', path: '/products' },
  { icon: Send, label: 'Divulgação', path: '/distribution' },
  { icon: FileText, label: 'Relatórios', path: '/reports' },
  { icon: Target, label: 'Metas', path: '/goals' },
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-card border-r border-border transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">Promoforia</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground",
              "hover:bg-accent hover:text-accent-foreground transition-all duration-200",
              "group"
            )}
            activeClassName="bg-primary/10 text-primary font-medium"
          >
            <item.icon className={cn(
              "w-5 h-5 flex-shrink-0 transition-transform duration-200",
              "group-hover:scale-110"
            )} />
            {!collapsed && (
              <span className="animate-fade-in">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Trash Link */}
      <div className="p-2 border-t border-border">
        <NavLink
          to="/trash"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground",
            "hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
          )}
          activeClassName="bg-destructive/10 text-destructive"
        >
          <Trash2 className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Lixeira</span>}
        </NavLink>
      </div>
    </aside>
  );
}
