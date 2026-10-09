import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookUser,
  Boxes,
  HandCoins,
  Home,
  LogOut,
  MoreHorizontal,
  Package,
  ReceiptText,
  Settings as SettingsIcon,
  ShoppingBasket,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { useApp, useCan, useSettings, useT } from './state/app';
import type { MessageKey } from './i18n/en';
import type { Action } from './config/permissions';
import type { SettingKey } from './config/registry';
import { Sheet, Toasts } from './ui/kit';
import { PrintHost } from './features/print/print';
import { Setup } from './features/auth/Setup';
import { Lock } from './features/auth/Lock';
import { Dashboard } from './features/dashboard/Dashboard';
import { Sell } from './features/sell/Sell';
import { Vouchers } from './features/vouchers/Vouchers';
import { Purchases } from './features/purchases/Purchases';
import { Inventory } from './features/inventory/Inventory';
import { Catalog } from './features/catalog/Catalog';
import { Contacts } from './features/contacts/Contacts';
import { Credit } from './features/credit/Credit';
import { Expenses } from './features/expenses/Expenses';
import { Reports, ReportView } from './features/reports/Reports';
import { Settings } from './features/settings/Settings';

interface NavItem {
  to: string;
  label: MessageKey;
  icon: ReactNode;
  modules?: SettingKey[]; // any of these modules on
  perm?: Action;
  element: ReactNode;
}

const NAV: NavItem[] = [
  { to: '/', label: 'nav.dashboard', icon: <Home size={22} />, element: <Dashboard /> },
  { to: '/sell', label: 'nav.sell', icon: <ShoppingCart size={22} />, perm: 'sell', element: <Sell /> },
  { to: '/vouchers', label: 'nav.vouchers', icon: <ReceiptText size={22} />, element: <Vouchers /> },
  { to: '/purchases', label: 'nav.purchases', icon: <ShoppingBasket size={22} />, modules: ['module.purchases'], perm: 'purchases.manage', element: <Purchases /> },
  { to: '/inventory', label: 'nav.inventory', icon: <Boxes size={22} />, modules: ['module.inventory'], element: <Inventory /> },
  { to: '/catalog', label: 'nav.catalog', icon: <Package size={22} />, element: <Catalog /> },
  { to: '/contacts', label: 'nav.contacts', icon: <BookUser size={22} />, modules: ['module.customers', 'module.purchases'], element: <Contacts /> },
  { to: '/credit', label: 'nav.credit', icon: <HandCoins size={22} />, modules: ['module.customerCredit', 'module.supplierCredit'], perm: 'credit.settle', element: <Credit /> },
  { to: '/expenses', label: 'nav.expenses', icon: <Wallet size={22} />, modules: ['module.expenses'], perm: 'expenses.manage', element: <Expenses /> },
  { to: '/reports', label: 'nav.reports', icon: <BarChart3 size={22} />, perm: 'reports.view', element: <Reports /> },
  { to: '/settings', label: 'nav.settings', icon: <SettingsIcon size={22} />, element: <Settings /> },
];

function useVisibleNav(): NavItem[] {
  const s = useSettings();
  const can = useCan();
  return NAV.filter(
    (n) => (!n.modules || n.modules.some((m) => s[m] === true)) && (!n.perm || can(n.perm)),
  );
}

function Shell() {
  const t = useT();
  const items = useVisibleNav();
  const user = useApp((s) => s.user);
  const signOut = useApp((s) => s.signOut);
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);

  // Phone tab bar: four most-used destinations + "More".
  const primary = items.filter((i) => ['/', '/sell', '/vouchers', '/reports', '/catalog'].includes(i.to)).slice(0, 4);
  const rest = items.filter((i) => !primary.includes(i));

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="rail-brand" aria-hidden>
          <ReceiptText size={22} />
        </div>
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            {n.icon}
            <span>{t(n.label)}</span>
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="rail-user">{user?.name}</div>
        <button className="rail-item" onClick={signOut}>
          <LogOut size={20} />
          <span>{t('nav.lock')}</span>
        </button>
      </nav>
      <main className="main">
        <Routes>
          {items.map((n) => (
            <Route key={n.to} path={n.to} element={n.element} />
          ))}
          {items.some((n) => n.to === '/reports') && <Route path="/reports/:id" element={<ReportView />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="tabbar" aria-label="Main">
        {primary.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            {n.icon}
            <span>{t(n.label)}</span>
          </NavLink>
        ))}
        <button onClick={() => setMore(true)}>
          <MoreHorizontal size={22} />
          <span>{t('nav.more')}</span>
        </button>
      </nav>
      {more && (
        <Sheet title={t('nav.more')} onClose={() => setMore(false)}>
          <div className="panel">
            {rest.map((n) => (
              <NavLink key={n.to} to={n.to} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                {n.icon}
                {t(n.label)}
              </NavLink>
            ))}
            <button className="list-row" onClick={signOut}>
              <LogOut size={22} />
              {t('nav.lock')}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function useDocumentSettings() {
  const s = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = s['ui.theme'] === 'dark' || (s['ui.theme'] === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--surface').trim() || '#ffffff');
    };
    root.dataset.accent = s['ui.accent'];
    root.dataset.density = s['ui.density'];
    root.lang = s['locale.language'];
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s]);
  useEffect(() => {
    document.title = s['shop.name'] ? `${s['shop.name']} · Smart POS` : 'Smart POS';
  }, [s]);
}

export function App() {
  const ready = useApp((s) => s.ready);
  const setupComplete = useApp((s) => s.setupComplete);
  const user = useApp((s) => s.user);
  useDocumentSettings();

  let body: ReactNode;
  if (!ready) body = null;
  else if (!setupComplete) body = <Setup />;
  else if (!user) body = <Lock />;
  else
    body = (
      <HashRouter>
        <Shell />
      </HashRouter>
    );

  return (
    <>
      {body}
      <Toasts />
      <PrintHost />
    </>
  );
}
