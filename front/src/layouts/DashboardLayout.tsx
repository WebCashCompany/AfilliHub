// src/layouts/DashboardLayout.tsx
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
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
  Sun,
  Moon,
  Menu,
  X,
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
import { useState, useEffect, useCallback } from 'react';
import logoSrc from '@/assets/logo.png';

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

// Itens que aparecem na bottom nav mobile (os mais usados)
const MOBILE_BOTTOM_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/automation', label: 'Automação', icon: Zap, allowedRoles: ['administrador', 'empresa', 'colaborador'] },
  { path: '/products', label: 'Produtos', icon: Package },
  { path: '/distribution', label: 'Divulgação', icon: Send },
];

const ROLE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  administrador: { label: 'Administrador', icon: Shield, color: 'text-blue-400' },
  empresa: { label: 'Empresa', icon: Building2, color: 'text-purple-400' },
  colaborador: { label: 'Colaborador', icon: Users, color: 'text-green-400' },
};

// ── Hook para detectar mobile ────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

// ── Item de navegação desktop ────────────────────────────────
function SidebarNavItem({
  path,
  label,
  icon: Icon,
  collapsed,
}: {
  path: string;
  label: string;
  icon: React.ElementType;
  collapsed: boolean;
}) {
  const location = useLocation();
  const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={path}
          end={path === '/'}
          className={cn(
            'flex flex-row items-center h-10 rounded-lg text-sm font-medium transition-colors duration-100',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" className="text-xs font-medium">
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ── Item de navegação no drawer mobile ──────────────────────
function DrawerNavItem({
  path,
  label,
  icon: Icon,
  onClick,
}: {
  path: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  const location = useLocation();
  const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <NavLink
      to={path}
      end={path === '/'}
      onClick={onClick}
      className={cn(
        'flex flex-row items-center gap-3 h-12 px-4 rounded-xl text-sm font-medium transition-colors duration-150',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon style={{ width: 20, height: 20, flexShrink: 0 }} />
      <span>{label}</span>
      {isActive && (
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
      )}
    </NavLink>
  );
}

// ── Botão de toggle de tema ──────────────────────────────────
function ThemeToggleButton({ collapsed }: { collapsed: boolean }) {
  const { preferences, updateTheme } = useUserPreferences();

  const isDark =
    preferences?.theme === 'dark' ||
    (preferences?.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleToggle = () => updateTheme(isDark ? 'light' : 'dark');
  const label = isDark ? 'Modo claro' : 'Modo escuro';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleToggle}
          className={cn(
            'flex flex-row items-center h-10 w-full rounded-lg text-sm font-medium transition-colors duration-100 text-muted-foreground hover:bg-muted hover:text-foreground',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          )}
          aria-label={label}
        >
          {isDark
            ? <Sun style={{ width: 18, height: 18, flexShrink: 0 }} />
            : <Moon style={{ width: 18, height: 18, flexShrink: 0 }} />}
          {!collapsed && <span className="truncate">{label}</span>}
        </button>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" className="text-xs font-medium">
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ── Bottom Navigation Bar (Mobile) ──────────────────────────
function MobileBottomNav({
  items,
  onMenuOpen,
}: {
  items: NavItem[];
  onMenuOpen: () => void;
}) {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center bg-card border-t border-border"
      style={{ height: 64, paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150"
          >
            <div
              className={cn(
                'flex items-center justify-center w-10 h-7 rounded-lg transition-all duration-200',
                isActive ? 'bg-primary/15' : ''
              )}
            >
              <Icon
                style={{ width: 20, height: 20 }}
                className={cn(
                  'transition-colors duration-150',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />
            </div>
            <span
              className={cn(
                'text-[10px] font-medium leading-none transition-colors duration-150',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {item.label}
            </span>
          </NavLink>
        );
      })}

      {/* Botão "Mais" para abrir o drawer */}
      <button
        onClick={onMenuOpen}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150"
      >
        <div className="flex items-center justify-center w-10 h-7 rounded-lg">
          <Menu style={{ width: 20, height: 20 }} className="text-muted-foreground" />
        </div>
        <span className="text-[10px] font-medium leading-none text-muted-foreground">Mais</span>
      </button>
    </nav>
  );
}

// ── Mobile Top Header ────────────────────────────────────────
function MobileHeader({
  profile,
  role,
  onMenuOpen,
  onSignOut,
}: {
  profile: { name?: string; email?: string } | null;
  role: string | null;
  onMenuOpen: () => void;
  onSignOut: () => void;
}) {
  const { preferences, updateTheme } = useUserPreferences();
  const isDark =
    preferences?.theme === 'dark' ||
    (preferences?.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-card border-b border-border px-4"
      style={{ height: 56, paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Logo */}
      <NavLink to="/" end className="flex items-center gap-2 cursor-pointer select-none">
        <img
          src={logoSrc}
          alt="Logo"
          style={{ width: 48, height: 48, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,180,255,0.5))' }}
        />
        <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: '1rem', letterSpacing: '0.15em', color: 'var(--foreground)' }}>
          VANT
        </span>
      </NavLink>

      {/* Ações */}
      <div className="flex items-center gap-1">
        {/* Toggle tema */}
        <button
          onClick={() => updateTheme(isDark ? 'light' : 'dark')}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          aria-label={isDark ? 'Modo claro' : 'Modo escuro'}
        >
          {isDark
            ? <Sun style={{ width: 18, height: 18 }} />
            : <Moon style={{ width: 18, height: 18 }} />}
        </button>

        {/* Avatar + menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <Avatar style={{ width: 28, height: 28 }}>
                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                  {profile?.name ? getInitials(profile.name) : <User style={{ width: 14, height: 14 }} />}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-3 py-2">
              <p className="text-sm font-medium truncate">{profile?.name || 'Usuário'}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onSignOut}
              className="text-red-500 focus:text-red-500 focus:bg-red-500/10 gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sair da conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ── Mobile Drawer (menu lateral deslizante) ──────────────────
function MobileDrawer({
  open,
  onClose,
  items,
  profile,
  role,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  profile: { name?: string; email?: string } | null;
  role: string | null;
  onSignOut: () => void;
}) {
  const roleInfo = role ? ROLE_LABELS[role] : null;
  const RoleIcon = roleInfo?.icon ?? User;

  const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();

  // Fechar com ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Bloquear scroll do body quando aberto
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed top-0 left-0 bottom-0 z-50 w-72 bg-card border-r border-border flex flex-col',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header do drawer */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-border shrink-0">
          <NavLink to="/" end onClick={onClose} className="flex items-center gap-2 cursor-pointer select-none">
            <img
              src={logoSrc}
              alt="Logo"
              style={{ width: 48, height: 48, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,180,255,0.5))' }}
            />
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: '1rem', letterSpacing: '0.15em', color: 'var(--foreground)' }}>
              VANT
            </span>
          </NavLink>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Perfil do usuário */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Avatar style={{ width: 36, height: 36 }}>
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {profile?.name ? getInitials(profile.name) : <User style={{ width: 16, height: 16 }} />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{profile?.name || 'Usuário'}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <RoleIcon className={cn('w-3 h-3 shrink-0', roleInfo?.color)} />
                <p className={cn('text-[11px] truncate', roleInfo?.color)}>{roleInfo?.label}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Itens de navegação */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-1">
          {items.map((item) => (
            <DrawerNavItem
              key={item.path}
              path={item.path}
              label={item.label}
              icon={item.icon}
              onClick={onClose}
            />
          ))}
        </nav>

        {/* Rodapé: sair */}
        <div className="border-t border-border p-3 shrink-0">
          <button
            onClick={() => { onClose(); onSignOut(); }}
            className="flex items-center gap-3 w-full h-12 px-4 rounded-xl text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors duration-150"
          >
            <LogOut style={{ width: 20, height: 20 }} />
            Sair da conta
          </button>
        </div>
      </div>
    </>
  );
}

// ── Botão flutuante com logo ─────────────────────────────────
function FloatingLogoButton() {
  return (
    <a
      href="https://webcash.vercel.app"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Visitar site Webcash"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 60,
        display: 'block',
        textDecoration: 'none',
      }}
      className="group"
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.12)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
          opacity: 0.3,
          cursor: 'pointer',
          transition: 'opacity 250ms ease, transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease',
        }}
        className="
          group-hover:!opacity-100
          group-hover:!shadow-[0_4px_24px_rgba(0,180,255,0.45)]
          group-hover:[border-color:rgba(0,180,255,0.6)]
          group-hover:scale-110
        "
      >
        <img
          src="https://avatars.githubusercontent.com/u/249851017?v=4"
          alt="Webcash"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    </a>
  );
}

// ── Layout principal ─────────────────────────────────────────
export function DashboardLayout() {
  const { profile, signOut, role } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate('/login');
  }, [signOut, navigate]);

  const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.allowedRoles) {
      if (role === 'colaborador') return false;
      return true;
    }
    if (!role) return false;
    return item.allowedRoles.includes(role);
  });

  // Filtra também os itens da bottom nav de acordo com as permissões
  const visibleBottomItems = MOBILE_BOTTOM_ITEMS.filter((item) => {
    const full = NAV_ITEMS.find((n) => n.path === item.path);
    if (!full) return false;
    if (!full.allowedRoles) {
      if (role === 'colaborador') return false;
      return true;
    }
    if (!role) return false;
    return full.allowedRoles.includes(role);
  });

  const roleInfo = role ? ROLE_LABELS[role] : null;
  const RoleIcon = roleInfo?.icon ?? User;

  // ── RENDER MOBILE ────────────────────────────────────────
  if (isMobile) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-col h-[100dvh] bg-background">
          {/* Header fixo no topo */}
          <MobileHeader
            profile={profile}
            role={role}
            onMenuOpen={() => setDrawerOpen(true)}
            onSignOut={handleSignOut}
          />

          {/* Drawer lateral */}
          <MobileDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            items={visibleNavItems}
            profile={profile}
            role={role}
            onSignOut={handleSignOut}
          />

          {/* Conteúdo com padding para header e bottom nav */}
          <main
            className="flex-1 overflow-auto"
            style={{ paddingTop: 56, paddingBottom: 64 }}
          >
            <Outlet />
          </main>

          {/* Bottom Navigation */}
          <MobileBottomNav
            items={visibleBottomItems}
            onMenuOpen={() => setDrawerOpen(true)}
          />

          {/* Botão flutuante */}
          <FloatingLogoButton />
        </div>
      </TooltipProvider>
    );
  }

  // ── RENDER DESKTOP (100% igual ao original) ──────────────
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen bg-background overflow-hidden">

        {/* Wrapper do sidebar */}
        <div
          style={{
            width: collapsed ? 60 : 240,
            transition: 'width 120ms ease',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {/* ══════════════════════ SIDEBAR ══════════════════════ */}
          <aside className="absolute inset-0 flex flex-col bg-card border-r border-border">

            {/* ── Logo ── */}
            <div className="h-16 flex items-center border-b border-border shrink-0 px-4">
              <NavLink to="/" end className="flex items-center gap-3 cursor-pointer select-none" style={{ minWidth: 0 }}>
                <img
                  src={logoSrc}
                  alt="Logo"
                  style={{ width: 48, height: 48, flexShrink: 0, objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 0 8px rgba(0,180,255,0.5))', marginTop: 6 }}
                />
                {!collapsed && (
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: '1.15rem', letterSpacing: '0.18em', color: 'var(--foreground)', whiteSpace: 'nowrap', lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                    VANT
                  </span>
                )}
              </NavLink>
            </div>

            {/* ── Navegação ── */}
            <nav
              className="flex-1 overflow-y-auto overflow-x-hidden"
              style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {visibleNavItems.map((item) => (
                <SidebarNavItem
                  key={item.path}
                  path={item.path}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                />
              ))}
            </nav>

            {/* ── Botão de tema ── */}
            <div style={{ padding: '0 8px 4px' }}>
              <ThemeToggleButton collapsed={collapsed} />
            </div>

            {/* ── Usuário ── */}
            <div className="border-t border-border shrink-0 p-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    style={{
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      gap: collapsed ? 0 : 12,
                      padding: collapsed ? '8px 0' : '8px 12px',
                      borderRadius: 8,
                    }}
                    className="hover:bg-muted transition-colors duration-100"
                  >
                    <Avatar style={{ width: 28, height: 28, flexShrink: 0 }}>
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                        {profile?.name ? getInitials(profile.name) : <User style={{ width: 14, height: 14 }} />}
                      </AvatarFallback>
                    </Avatar>
                    {!collapsed && (
                      <>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
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
                        <ChevronDown style={{ width: 14, height: 14, flexShrink: 0 }} className="text-muted-foreground" />
                      </>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side={collapsed ? 'right' : 'top'} className="w-52">
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

          {/* ══ Botão colapso ══ */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            style={{
              position: 'absolute',
              right: -12,
              top: 68,
              zIndex: 50,
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              transition: 'background-color 100ms, color 100ms',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--muted)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--card)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)';
            }}
            aria-label={collapsed ? 'Expandir' : 'Recolher'}
          >
            {collapsed
              ? <ChevronRight style={{ width: 12, height: 12 }} />
              : <ChevronLeft style={{ width: 12, height: 12 }} />}
          </button>
        </div>

        {/* ══════════════════════ MAIN ══════════════════════ */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* Botão flutuante */}
        <FloatingLogoButton />

      </div>
    </TooltipProvider>
  );
}