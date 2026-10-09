// Typed settings registry. Every configurable behaviour in the app is declared
// here once: its type, default, scope, and (optionally) the module it depends on.
// The Settings screen is generated from this list, so adding a setting here is
// enough to make it editable.
//
// Scope:
//   shop   – stored in the database, shared by every device that uses this data
//   device – stored in this browser only (printer, theme, …)

export type SettingScope = 'shop' | 'device';

interface Base<T> {
  key: string;
  group: SettingGroup;
  scope: SettingScope;
  default: T;
  /** Setting is only shown (and only takes effect) when this boolean setting is on. */
  requires?: string;
}

export interface BoolDef extends Base<boolean> {
  type: 'boolean';
}
export interface NumberDef extends Base<number> {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}
export interface TextDef extends Base<string> {
  type: 'text';
  multiline?: boolean;
  maxLength?: number;
}
export interface SelectDef extends Base<string> {
  type: 'select';
  options: string[];
}

export type SettingDef = BoolDef | NumberDef | TextDef | SelectDef;

export type SettingGroup =
  | 'shop'
  | 'modules'
  | 'sales'
  | 'tax'
  | 'currency'
  | 'numbering'
  | 'inventory'
  | 'printing'
  | 'language'
  | 'appearance';

export const SETTING_GROUPS: SettingGroup[] = [
  'shop',
  'modules',
  'sales',
  'tax',
  'currency',
  'numbering',
  'inventory',
  'printing',
  'language',
  'appearance',
];

export const REGISTRY = [
  // Shop profile
  { key: 'shop.name', group: 'shop', scope: 'shop', type: 'text', default: 'My Shop', maxLength: 60 },
  { key: 'shop.phone', group: 'shop', scope: 'shop', type: 'text', default: '', maxLength: 40 },
  { key: 'shop.address', group: 'shop', scope: 'shop', type: 'text', default: '', multiline: true, maxLength: 200 },

  // Feature modules — switching one off hides it everywhere but never deletes its data.
  { key: 'module.purchases', group: 'modules', scope: 'shop', type: 'boolean', default: true },
  { key: 'module.inventory', group: 'modules', scope: 'shop', type: 'boolean', default: true },
  { key: 'module.customers', group: 'modules', scope: 'shop', type: 'boolean', default: true },
  { key: 'module.customerCredit', group: 'modules', scope: 'shop', type: 'boolean', default: true, requires: 'module.customers' },
  { key: 'module.supplierCredit', group: 'modules', scope: 'shop', type: 'boolean', default: true, requires: 'module.purchases' },
  { key: 'module.expenses', group: 'modules', scope: 'shop', type: 'boolean', default: true },
  { key: 'module.tables', group: 'modules', scope: 'shop', type: 'boolean', default: false },
  { key: 'module.multiLocation', group: 'modules', scope: 'shop', type: 'boolean', default: false, requires: 'module.inventory' },

  // Selling rules
  { key: 'sales.allowNegativeStock', group: 'sales', scope: 'shop', type: 'boolean', default: true, requires: 'module.inventory' },
  { key: 'sales.lineDiscount', group: 'sales', scope: 'shop', type: 'boolean', default: true },
  { key: 'sales.orderDiscount', group: 'sales', scope: 'shop', type: 'boolean', default: true },
  { key: 'sales.maxDiscountPct', group: 'sales', scope: 'shop', type: 'number', default: 20, min: 0, max: 100, step: 1, suffix: '%' },
  { key: 'sales.holdVouchers', group: 'sales', scope: 'shop', type: 'boolean', default: true },
  { key: 'sales.priceEdit', group: 'sales', scope: 'shop', type: 'boolean', default: false },
  { key: 'sales.requireCustomerForCredit', group: 'sales', scope: 'shop', type: 'boolean', default: true, requires: 'module.customerCredit' },
  { key: 'sales.rounding', group: 'sales', scope: 'shop', type: 'select', default: 'none', options: ['none', '5', '10', '50', '100'] },
  { key: 'sales.roundingMode', group: 'sales', scope: 'shop', type: 'select', default: 'nearest', options: ['nearest', 'up', 'down'] },
  { key: 'sales.quickCash', group: 'sales', scope: 'shop', type: 'boolean', default: true },

  // Tax
  { key: 'tax.mode', group: 'tax', scope: 'shop', type: 'select', default: 'off', options: ['off', 'exclusive', 'inclusive'] },
  { key: 'tax.rate', group: 'tax', scope: 'shop', type: 'number', default: 5, min: 0, max: 100, step: 0.5, suffix: '%' },
  { key: 'tax.label', group: 'tax', scope: 'shop', type: 'text', default: 'Commercial tax', maxLength: 30 },

  // Currency
  { key: 'currency.code', group: 'currency', scope: 'shop', type: 'text', default: 'MMK', maxLength: 3 },
  { key: 'currency.symbol', group: 'currency', scope: 'shop', type: 'text', default: 'Ks', maxLength: 6 },
  { key: 'currency.decimals', group: 'currency', scope: 'shop', type: 'select', default: '0', options: ['0', '2'] },
  { key: 'currency.position', group: 'currency', scope: 'shop', type: 'select', default: 'after', options: ['before', 'after'] },

  // Document numbering
  { key: 'numbering.salePrefix', group: 'numbering', scope: 'shop', type: 'text', default: 'S', maxLength: 6 },
  { key: 'numbering.purchasePrefix', group: 'numbering', scope: 'shop', type: 'text', default: 'P', maxLength: 6 },
  { key: 'numbering.deviceCode', group: 'numbering', scope: 'device', type: 'text', default: '01', maxLength: 4 },
  { key: 'numbering.padding', group: 'numbering', scope: 'shop', type: 'number', default: 4, min: 1, max: 8, step: 1 },
  { key: 'numbering.reset', group: 'numbering', scope: 'shop', type: 'select', default: 'daily', options: ['never', 'daily', 'monthly', 'yearly'] },

  // Inventory
  { key: 'inventory.costing', group: 'inventory', scope: 'shop', type: 'select', default: 'average', options: ['average', 'last'], requires: 'module.inventory' },
  { key: 'inventory.defaultReorder', group: 'inventory', scope: 'shop', type: 'number', default: 5, min: 0, step: 1, requires: 'module.inventory' },

  // Printing (per device — each tablet has its own printer)
  { key: 'print.paper', group: 'printing', scope: 'device', type: 'select', default: '80', options: ['58', '80', 'a4'] },
  { key: 'print.auto', group: 'printing', scope: 'device', type: 'boolean', default: false },
  { key: 'print.copies', group: 'printing', scope: 'device', type: 'number', default: 1, min: 1, max: 3, step: 1 },
  { key: 'print.header', group: 'printing', scope: 'shop', type: 'text', default: '', multiline: true, maxLength: 200 },
  { key: 'print.footer', group: 'printing', scope: 'shop', type: 'text', default: 'Thank you!', multiline: true, maxLength: 200 },
  { key: 'print.showCashier', group: 'printing', scope: 'shop', type: 'boolean', default: true },
  { key: 'print.showCustomer', group: 'printing', scope: 'shop', type: 'boolean', default: true },

  // Language & formats
  { key: 'locale.language', group: 'language', scope: 'device', type: 'select', default: 'my', options: ['my', 'en'] },
  { key: 'locale.digits', group: 'language', scope: 'device', type: 'select', default: 'latin', options: ['latin', 'myanmar'] },
  { key: 'locale.dateFormat', group: 'language', scope: 'shop', type: 'select', default: 'DD/MM/YYYY', options: ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'] },

  // Appearance
  { key: 'ui.theme', group: 'appearance', scope: 'device', type: 'select', default: 'system', options: ['system', 'light', 'dark'] },
  { key: 'ui.accent', group: 'appearance', scope: 'device', type: 'select', default: 'jade', options: ['jade', 'indigo', 'ochre', 'slate'] },
  { key: 'ui.density', group: 'appearance', scope: 'device', type: 'select', default: 'comfortable', options: ['comfortable', 'compact'] },
  { key: 'ui.gridColumns', group: 'appearance', scope: 'device', type: 'select', default: 'auto', options: ['auto', '3', '4', '5', '6'] },
] as const satisfies readonly SettingDef[];

type Reg = (typeof REGISTRY)[number];
export type SettingKey = Reg['key'];

type ValueOf<D> = D extends { type: 'boolean' }
  ? boolean
  : D extends { type: 'number' }
    ? number
    : string;

export type SettingsValues = { [K in SettingKey]: ValueOf<Extract<Reg, { key: K }>> };

export const DEFS: Record<string, SettingDef> = Object.fromEntries(
  (REGISTRY as readonly SettingDef[]).map((d) => [d.key, d]),
);

export function defaults(): SettingsValues {
  return Object.fromEntries(REGISTRY.map((d) => [d.key, d.default])) as SettingsValues;
}

/** Coerce an unknown stored value into the definition's type, falling back to the default. */
export function coerce(def: SettingDef, raw: unknown): boolean | number | string {
  switch (def.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : def.default;
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return def.default;
      let v = n;
      if (def.min !== undefined) v = Math.max(def.min, v);
      if (def.max !== undefined) v = Math.min(def.max, v);
      return v;
    }
    case 'select':
      return typeof raw === 'string' && def.options.includes(raw) ? raw : def.default;
    case 'text':
      return typeof raw === 'string' ? raw.slice(0, def.maxLength ?? 500) : def.default;
  }
}

/**
 * Merge stored values over defaults. Device values win over shop values.
 * A setting whose `requires` dependency is off resolves to its default-off state
 * for booleans, so dependent behaviour switches off with its module.
 */
export function resolve(
  shop: Record<string, unknown>,
  device: Record<string, unknown>,
): SettingsValues {
  const out: Record<string, boolean | number | string> = {};
  for (const def of REGISTRY as readonly SettingDef[]) {
    const raw = def.scope === 'device' ? (def.key in device ? device[def.key] : shop[def.key]) : shop[def.key];
    out[def.key] = raw === undefined ? def.default : coerce(def, raw);
  }
  // Apply dependencies (after all values are known).
  for (const def of REGISTRY as readonly SettingDef[]) {
    if (def.requires && out[def.requires] === false && def.type === 'boolean') {
      out[def.key] = false;
    }
  }
  return out as SettingsValues;
}

export function isActive(values: Record<string, unknown>, def: SettingDef): boolean {
  if (!def.requires) return true;
  const parent = DEFS[def.requires];
  return values[def.requires] === true && (!parent || isActive(values, parent));
}
