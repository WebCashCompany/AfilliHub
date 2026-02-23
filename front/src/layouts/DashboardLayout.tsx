// src/layouts/DashboardLayout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  BarChart2,
  Zap,
  Package,
  Send,
  FileText,
  Target,
  Settings,
  Trash2,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  Building2,
  Users,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  allowedRoles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/analytics', label: 'Analytics', icon: BarChart2 },
  { path: '/automation', label: 'Automação', icon: Zap, allowedRoles: ['administrador', 'empresa', 'colaborador'] },
  { path: '/products', label: 'Produtos', icon: Package, allowedRoles: ['administrador', 'empresa', 'colaborador'] },
  { path: '/distribution', label: 'Divulgação', icon: Send },
  { path: '/reports', label: 'Relatórios', icon: FileText },
  { path: '/goals', label: 'Metas', icon: Target },
  { path: '/settings', label: 'Configurações', icon: Settings },
  { path: '/trash', label: 'Lixeira', icon: Trash2 },
];

const ROLE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  administrador: { label: 'Administrador', icon: Shield, color: 'text-blue-400' },
  empresa: { label: 'Empresa', icon: Building2, color: 'text-purple-400' },
  colaborador: { label: 'Colaborador', icon: Users, color: 'text-green-400' },
};

export function DashboardLayout() {
  const { profile, signOut, role } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (!item.allowedRoles) {
      if (role === 'colaborador') return false;
      return true;
    }
    if (!role) return false;
    return item.allowedRoles.includes(role);
  });

  const roleInfo = role ? ROLE_LABELS[role] : null;
  const RoleIcon = roleInfo?.icon ?? User;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen bg-background overflow-hidden">

        {/* ══════════════════════ SIDEBAR ══════════════════════ */}
        <aside
          style={{ width: collapsed ? 60 : 240, transition: 'width 120ms ease-out' }}
          className="relative flex flex-col h-full bg-card border-r border-border shrink-0 overflow-hidden"
        >
          {/* Botão colapso */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="absolute -right-3 top-[4.25rem] z-50 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={collapsed ? 'Expandir' : 'Recolher'}
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>

          {/* ── Logo ── */}
          <div className="h-16 flex items-center border-b border-border shrink-0 px-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-primary" fill="currentColor" />
              </div>
              {!collapsed && (
                <span className="font-bold text-sm tracking-wider text-foreground whitespace-nowrap">
                  AFILLIHUB
                </span>
              )}
            </div>
          </div>

          {/* ── Navegação ── */}
          <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden" style={{ padding: '12px 8px' }}>
            <div className="flex flex-col gap-0.5">
              {visibleNavItems.map(({ path, label, icon: Icon }) => (
                <Tooltip key={path}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={path}
                      end={path === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center h-10 rounded-lg text-sm font-medium transition-colors duration-100',
                          collapsed ? 'justify-center w-full' : 'gap-3 px-3',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={cn('shrink-0', isActive ? 'text-primary' : '')}
                            style={{ width: 18, height: 18 }}
                          />
                          {!collapsed && <span className="truncate">{label}</span>}
                        </>
                      )}
                    </NavLink>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right" className="text-xs font-medium">
                      {label}
                    </TooltipContent>
                  )}
                </Tooltip>
              ))}
            </div>
          </nav>

          {/* ── Usuário ── */}
          <div className="border-t border-border shrink-0 p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'w-full flex items-center rounded-lg hover:bg-muted transition-colors duration-100 group',
                    collapsed ? 'justify-center h-10' : 'gap-3 px-3 py-2'
                  )}
                >
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                      {profile?.name ? getInitials(profile.name) : <User className="w-3.5 h-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-foreground truncate leading-tight">
                          {profile?.name || 'Usuário'}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <RoleIcon className={cn('w-3 h-3 shrink-0', roleInfo?.color)} />
                          <p className={cn('text-[11px] truncate', roleInfo?.color)}>
                            {roleInfo?.label}
                          </p>
                        </div>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side={collapsed ? 'right' : 'top'}
                className="w-52"
              >
                <div className="px-3 py-2">
                  <p className="text-sm font-medium truncate">{profile?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-red-500 focus:text-red-500 focus:bg-red-500/10 gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sair da conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* ══════════════════════ MAIN ══════════════════════ */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

      </div>
    </TooltipProvider>
  );
}