import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/context/useToast';
import { BrandLogo, SandboxBanner } from '@/components/layout/BrandLogo';
import { NAV_ITEMS } from '@/components/layout/navigation';
import { Button } from '@/components/ui/Button';

export function AppLayout() {
  const { session, business, signOut } = useAuth();
  const { notify } = useToast();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    notify('You have been signed out.', 'info');
  };

  const navList = (
    <nav aria-label="Main navigation" className="flex-1 space-y-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              isActive ? 'bg-white/10 text-white shadow-sm' : 'text-navy-200 hover:bg-white/5 hover:text-white'
            }`
          }
        >
          <item.icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  const sidebarFooter = (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <div className="px-3">
        <p className="truncate text-sm font-medium text-white">{business?.name ?? 'Your business'}</p>
        <p className="truncate text-xs text-navy-300">{session?.user.email}</p>
      </div>
      <Button variant="ghost" size="sm" fullWidth onClick={handleSignOut} icon={<LogOut className="h-4 w-4" aria-hidden="true" />} className="justify-start text-navy-200 hover:bg-white/5 hover:text-white">
        Sign out
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed inset-x-0 top-0 z-30">
        <SandboxBanner />
      </div>

      <aside className="fixed inset-y-0 left-0 top-[36px] z-20 hidden w-64 flex-col bg-navy-900 p-4 lg:flex">
        <div className="px-2 pb-6 pt-2">
          <BrandLogo light />
        </div>
        {navList}
        {sidebarFooter}
      </aside>

      <header className="fixed inset-x-0 top-[36px] z-20 flex items-center justify-between bg-navy-900 px-4 py-3 lg:hidden">
        <BrandLogo light />
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="rounded-lg p-2 text-white transition-colors hover:bg-white/10"
        >
          {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 top-[100px] z-10 flex flex-col bg-navy-900 p-4 animate-fade-in lg:hidden">
          {navList}
          {sidebarFooter}
        </div>
      )}

      <main className="px-4 pb-16 pt-[120px] sm:px-6 lg:ml-64 lg:px-10 lg:pt-[68px]">
        <div className="mx-auto max-w-6xl animate-fade-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
