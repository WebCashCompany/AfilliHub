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
  ChevronRight
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
      {/* Logo Superior */}
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

      {/* Footer com a Logo da Empresa (Substituindo a Lixeira) */}
      <div className="p-4 border-t border-border mt-auto flex justify-center items-center">
        <div 
          className={cn(
            "transition-all duration-500 ease-in-out cursor-pointer flex flex-col items-center",
            "opacity-30 hover:opacity-100 grayscale hover:grayscale-0"
          )}
        >
          <img 
            src="https://avatars.githubusercontent.com/u/249851017?v=4" 
            alt="Logo Empresa" 
            className={cn(
              "rounded-lg object-contain transition-all duration-300",
              collapsed ? "w-7 h-7" : "w-10 h-10"
            )}
          />
          {!collapsed && (
            <span className="text-[8px] mt-1 font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
              Powered by
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}