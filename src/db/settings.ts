import { db } from './db';
import { DEFS, coerce, resolve, type SettingKey, type SettingsValues } from '../config/registry';
import { normalizePermissions, type PermissionMatrix } from '../config/permissions';

export const DEVICE_STORAGE_KEY = 'smart-pos.device';
const RESERVED = new Set(['permissions', 'setupComplete']);

export function readDevice(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function writeDevice(values: Record<string, unknown>): void {
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Storage can be unavailable (private mode); settings then last for this session only.
  }
}

export async function readShop(): Promise<Record<string, unknown>> {
  const rows = await db.settings.toArray();
  const out: Record<string, unknown> = {};
  for (const r of rows) if (!RESERVED.has(r.key)) out[r.key] = r.value;
  return out;
}

export async function loadSettings(): Promise<SettingsValues> {
  return resolve(await readShop(), readDevice());
}

/** Save a shop-scoped setting. Device-scoped settings go through the device store. */
export async function saveShopSetting(key: SettingKey, value: unknown): Promise<void> {
  const def = DEFS[key];
  if (!def) throw new Error(`Unknown setting ${key}`);
  await db.settings.put({ key, value: coerce(def, value) });
}

export async function loadPermissions(): Promise<PermissionMatrix> {
  const row = await db.settings.get('permissions');
  return normalizePermissions(row?.value);
}

export async function savePermissions(m: PermissionMatrix): Promise<void> {
  await db.settings.put({ key: 'permissions', value: m });
}

export async function isSetupComplete(): Promise<boolean> {
  return (await db.settings.get('setupComplete'))?.value === true;
}

export async function markSetupComplete(): Promise<void> {
  await db.settings.put({ key: 'setupComplete', value: true });
}
