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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  /** Roles que têm acesso. Se undefined = acesso total */
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .slice(0, 2)
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  // Filtra itens de nav baseado na role do usuário
  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (!item.allowedRoles) {
      // Sem restrição — só mostra para admin e empresa
      if (role === 'colaborador') return false;
      return true;
    }
    if (!role) return false;
    return item.allowedRoles.includes(role);
  });

  const roleInfo = role ? ROLE_LABELS[role] : null;
  const RoleIcon = roleInfo?.icon ?? User;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ═══════════════════════════════════ */}
      {/* SIDEBAR                             */}
      {/* ═══════════════════════════════════ */}
      <aside className="w-60 flex flex-col bg-card border-r border-border shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" fill="currentColor" />
            </div>
            <span className="font-bold text-sm tracking-wider text-foreground">AFILLIHUB</span>
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-primary' : '')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Usuário logado */}
        <div className="p-3 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left group">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                    {profile?.name ? getInitials(profile.name) : <User className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {profile?.name || 'Usuário'}
                  </p>
                  <div className="flex items-center gap-1">
                    <RoleIcon className={cn('w-3 h-3', roleInfo?.color)} />
                    <p className={cn('text-[11px] truncate', roleInfo?.color)}>
                      {roleInfo?.label}
                    </p>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52 mb-1">
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

      {/* ═══════════════════════════════════ */}
      {/* CONTEÚDO PRINCIPAL                  */}
      {/* ═══════════════════════════════════ */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}