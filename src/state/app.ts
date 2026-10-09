import { create } from 'zustand';
import { liveQuery } from 'dexie';
import { db } from '../db/db';
import { readDevice, readShop, writeDevice, loadPermissions, isSetupComplete } from '../db/settings';
import { resolve, defaults, type SettingKey, type SettingsValues } from '../config/registry';
import { can as canDo, DEFAULT_PERMISSIONS, type Action, type PermissionMatrix } from '../config/permissions';
import type { User } from '../db/types';
import { en, type MessageKey } from '../i18n/en';
import { my } from '../i18n/my';
import { formatMoney, formatQty, type MoneyFormat } from '../lib/money';
import { formatDate, formatTime } from '../lib/dates';
import { PosError } from '../db/services';

const SESSION_KEY = 'smart-pos.session';

interface AppState {
  ready: boolean;
  setupComplete: boolean;
  shop: Record<string, unknown>;
  device: Record<string, unknown>;
  settings: SettingsValues;
  permissions: PermissionMatrix;
  user: User | null;
  setDevice: (key: SettingKey, value: unknown) => void;
  signIn: (u: User) => void;
  signOut: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  setupComplete: false,
  shop: {},
  device: readDevice(),
  settings: resolve({}, readDevice()),
  permissions: DEFAULT_PERMISSIONS,
  user: null,
  setDevice: (key, value) => {
    const device = { ...get().device, [key]: value };
    writeDevice(device);
    set({ device, settings: resolve(get().shop, device) });
  },
  signIn: (u) => {
    try {
      localStorage.setItem(SESSION_KEY, u.id);
    } catch {
      /* ignore */
    }
    set({ user: u });
  },
  signOut: () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    set({ user: null });
  },
}));

let started = false;

/** Subscribe the store to the database. Settings, permissions and the signed-in user stay live. */
export function startApp(): void {
  if (started) return;
  started = true;
  liveQuery(async () => {
    const [shop, permissions, setupComplete, users] = await Promise.all([
      readShop(),
      loadPermissions(),
      isSetupComplete(),
      db.users.toArray(),
    ]);
    return { shop, permissions, setupComplete, users };
  }).subscribe({
    next: ({ shop, permissions, setupComplete, users }) => {
      const st = useApp.getState();
      let sessionId: string | null = null;
      try {
        sessionId = localStorage.getItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
      const current = st.user ?? users.find((u) => u.id === sessionId) ?? null;
      // Refresh the user record (role or active status may have changed elsewhere).
      const fresh = current ? users.find((u) => u.id === current.id && u.active) ?? null : null;
      useApp.setState({
        ready: true,
        setupComplete,
        shop,
        permissions,
        settings: resolve(shop, st.device),
        user: fresh,
      });
    },
    error: (e) => console.error('[smart-pos] settings subscription failed', e),
  });
}

// ---------- hooks ----------

export function useSettings(): SettingsValues {
  return useApp((s) => s.settings);
}

export function useUser(): User {
  const u = useApp((s) => s.user);
  if (!u) throw new Error('No signed-in user');
  return u;
}

export function useCan(): (a: Action) => boolean {
  const role = useApp((s) => s.user?.role);
  const matrix = useApp((s) => s.permissions);
  return (a: Action) => canDo(role, a, matrix);
}

export type T = (key: MessageKey, params?: Record<string, string | number>) => string;

export function translate(lang: string, key: MessageKey, params?: Record<string, string | number>): string {
  const dict: Record<string, string> = lang === 'my' ? my : en;
  let s = dict[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function useT(): T {
  const lang = useApp((s) => s.settings['locale.language']);
  return (key, params) => translate(lang, key, params);
}

export function useLang(): string {
  return useApp((s) => s.settings['locale.language']);
}

export interface Formatters {
  money: (minor: number) => string;
  num: (minor: number) => string;
  qty: (q: number) => string;
  date: (ts: number) => string;
  time: (ts: number) => string;
  decimals: number;
  digits: 'latin' | 'myanmar';
}

export function moneyFormat(s: SettingsValues): MoneyFormat {
  return {
    symbol: s['currency.symbol'],
    position: s['currency.position'] as MoneyFormat['position'],
    decimals: Number(s['currency.decimals']),
    digits: s['locale.digits'] as MoneyFormat['digits'],
  };
}

export function useFormat(): Formatters {
  const s = useSettings();
  const mf = moneyFormat(s);
  return {
    money: (m) => formatMoney(m, mf),
    num: (m) => formatMoney(m, { ...mf, symbol: '' }),
    qty: (q) => formatQty(q, mf.digits),
    date: (ts) => formatDate(ts, s['locale.dateFormat'], mf.digits),
    time: (ts) => formatTime(ts, mf.digits),
    decimals: mf.decimals,
    digits: mf.digits,
  };
}

/** Turn any thrown error into a message in the current language. */
export function errorMessage(t: T, e: unknown): string {
  if (e instanceof PosError) return t(e.code as MessageKey, e.params);
  if (e instanceof Error && e.message in en) return t(e.message as MessageKey);
  return t('err.generic', { msg: e instanceof Error ? e.message : String(e) });
}

export { defaults };
