import type { Role } from '../db/types';

export const ACTIONS = [
  'sell',
  'sell.discount',
  'sell.overrideDiscountLimit',
  'sell.credit',
  'sale.void',
  'sale.viewAll',
  'purchases.manage',
  'inventory.adjust',
  'inventory.transfer',
  'catalog.manage',
  'contacts.manage',
  'credit.settle',
  'expenses.manage',
  'reports.view',
  'reports.profit',
  'settings.manage',
  'users.manage',
  'data.manage',
] as const;

export type Action = (typeof ACTIONS)[number];
export type PermissionMatrix = Record<Exclude<Role, 'owner'>, Record<Action, boolean>>;

const all = (v: boolean) => Object.fromEntries(ACTIONS.map((a) => [a, v])) as Record<Action, boolean>;

export const DEFAULT_PERMISSIONS: PermissionMatrix = {
  manager: {
    ...all(true),
    'settings.manage': false,
    'users.manage': false,
    'data.manage': false,
  },
  cashier: {
    ...all(false),
    sell: true,
    'sell.discount': true,
    'sell.credit': true,
  },
};

export function normalizePermissions(raw: unknown): PermissionMatrix {
  const out: PermissionMatrix = {
    manager: { ...DEFAULT_PERMISSIONS.manager },
    cashier: { ...DEFAULT_PERMISSIONS.cashier },
  };
  if (raw && typeof raw === 'object') {
    for (const role of ['manager', 'cashier'] as const) {
      const r = (raw as Record<string, unknown>)[role];
      if (r && typeof r === 'object') {
        for (const a of ACTIONS) {
          const v = (r as Record<string, unknown>)[a];
          if (typeof v === 'boolean') out[role][a] = v;
        }
      }
    }
  }
  return out;
}

/** The owner can always do everything, so a shop can never lock itself out. */
export function can(role: Role | undefined, action: Action, matrix: PermissionMatrix): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  return matrix[role][action];
}
