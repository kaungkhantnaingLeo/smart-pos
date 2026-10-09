import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, KeyRound, Plus, Upload } from 'lucide-react';
import { db, DEFAULT_LOCATION_ID } from '../../db/db';
import type { PaymentKind, Role, User } from '../../db/types';
import { changePin, createUser, setUserActive } from '../../db/services';
import { exportAll, importAll, resetAll } from '../../db/seed';
import { saveShopSetting, savePermissions } from '../../db/settings';
import { REGISTRY, SETTING_GROUPS, isActive, type SettingDef, type SettingGroup, type SettingKey } from '../../config/registry';
import { ACTIONS, type PermissionMatrix } from '../../config/permissions';
import { en, type MessageKey } from '../../i18n/en';
import { useApp, useCan, useSettings, useT, useUser, errorMessage } from '../../state/app';
import { Dialog, Field, PageHead, Seg, Switch, toast } from '../../ui/kit';
import { NameList } from '../../ui/NameList';
import { cx, download, uid } from '../../lib/util';
import { dayKey } from '../../lib/dates';

type Section = SettingGroup | 'accounts' | 'paymentMethods' | 'tables' | 'locations' | 'permissions' | 'data' | 'about';

const VERSION = '0.1.0';

export function Settings() {
  const t = useT();
  const s = useSettings();
  const can = useCan();
  const [section, setSection] = useState<Section>('shop');

  const shopSections: { id: Section; label: MessageKey; show: boolean }[] = [
    { id: 'accounts', label: 'settings.accounts', show: can('users.manage') },
    { id: 'paymentMethods', label: 'settings.paymentMethods', show: can('settings.manage') },
    { id: 'tables', label: 'settings.tables', show: s['module.tables'] && can('settings.manage') },
    { id: 'locations', label: 'settings.locations', show: s['module.multiLocation'] && can('settings.manage') },
    { id: 'permissions', label: 'settings.permissions', show: can('users.manage') },
    { id: 'data', label: 'settings.data', show: can('data.manage') },
    { id: 'about', label: 'settings.about', show: true },
  ];

  return (
    <div className="page">
      <PageHead title={t('settings.title')} />
      <div className="settings">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          <div className="nav-title">{t('settings.section.general')}</div>
          {SETTING_GROUPS.map((g) => (
            <button key={g} className={cx(section === g && 'on')} onClick={() => setSection(g)}>
              {t(`group.${g}`)}
            </button>
          ))}
          <div className="nav-title">{t('settings.section.shop')}</div>
          {shopSections
            .filter((x) => x.show)
            .map((x) => (
              <button key={x.id} className={cx(section === x.id && 'on')} onClick={() => setSection(x.id)}>
                {t(x.label)}
              </button>
            ))}
        </nav>
        <div className="stack">
          {(SETTING_GROUPS as string[]).includes(section) ? (
            <SettingsGroup group={section as SettingGroup} />
          ) : section === 'accounts' ? (
            <Accounts />
          ) : section === 'paymentMethods' ? (
            <PaymentMethods />
          ) : section === 'tables' ? (
            <Tables />
          ) : section === 'locations' ? (
            <Locations />
          ) : section === 'permissions' ? (
            <Permissions />
          ) : section === 'data' ? (
            <DataPanel />
          ) : (
            <About />
          )}
        </div>
      </div>
    </div>
  );
}

function hasKey(k: string): k is MessageKey {
  return k in en;
}

function SettingsGroup({ group }: { group: SettingGroup }) {
  const t = useT();
  const defs = (REGISTRY as readonly SettingDef[]).filter((d) => d.group === group);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t(`group.${group}`)}</h2>
      </div>
      {defs.map((d) => (
        <SettingRow key={d.key} def={d} />
      ))}
    </div>
  );
}

function SettingRow({ def }: { def: SettingDef }) {
  const t = useT();
  const s = useSettings();
  const can = useCan();
  const setDevice = useApp((x) => x.setDevice);
  const key = def.key as SettingKey;
  const value = s[key];
  const active = isActive(s as unknown as Record<string, unknown>, def);
  const editable = def.scope === 'device' || can('settings.manage');
  const disabled = !active || !editable;
  const help = `set.${def.key}.help`;

  async function save(v: unknown, announce = false) {
    try {
      if (def.scope === 'device') setDevice(key, v);
      else await saveShopSetting(key, v);
      if (announce) toast(t('settings.saved'));
    } catch (e) {
      toast(errorMessage(t, e), 'error');
    }
  }

  const optLabel = (o: string) => (hasKey(`opt.${o}`) ? t(`opt.${o}` as MessageKey) : o);

  let control: ReactNode;
  if (def.type === 'boolean') {
    control = <Switch checked={value as boolean} onChange={(v) => save(v)} disabled={disabled} label={t(`set.${def.key}` as MessageKey)} />;
  } else if (def.type === 'select') {
    control =
      def.options.length <= 3 && def.options.every((o) => optLabel(o).length <= 14) ? (
        <Seg value={value as string} onChange={(v) => !disabled && save(v)} options={def.options.map((o) => ({ value: o, label: optLabel(o) }))} label={t(`set.${def.key}` as MessageKey)} />
      ) : (
        <select className="select" value={value as string} disabled={disabled} onChange={(e) => save(e.target.value)} aria-label={t(`set.${def.key}` as MessageKey)}>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {def.key === 'sales.rounding' && o !== 'none' ? o : optLabel(o)}
            </option>
          ))}
        </select>
      );
  } else {
    control = <TextSetting def={def} value={value as string | number} disabled={disabled} onSave={(v) => save(v, true)} />;
  }

  return (
    <div className={cx('setting', !active && 'disabled')}>
      <div className="s-text">
        <div>
          {t(`set.${def.key}` as MessageKey)}
          {def.scope === 'device' && <span className="device-tag">{t('settings.deviceOnly')}</span>}
        </div>
        {hasKey(help) && <div className="help">{t(help)}</div>}
      </div>
      <div className="s-control">{control}</div>
    </div>
  );
}

function TextSetting(props: { def: SettingDef; value: string | number; disabled: boolean; onSave: (v: string | number) => void }) {
  const t = useT();
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  const def = props.def;
  const commit = () => {
    if (text === String(props.value)) return;
    if (def.type === 'number') {
      const n = Number(text);
      if (!Number.isFinite(n)) return setText(String(props.value));
      props.onSave(n);
    } else props.onSave(text);
  };
  if (def.type === 'text' && def.multiline) {
    return (
      <textarea
        className="textarea"
        value={text}
        disabled={props.disabled}
        maxLength={def.maxLength}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        aria-label={t(`set.${def.key}` as MessageKey)}
      />
    );
  }
  return (
    <div className="row" style={{ width: '100%' }}>
      <input
        className={cx('input', def.type === 'number' && 'num')}
        value={text}
        disabled={props.disabled}
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        maxLength={def.type === 'text' ? def.maxLength : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={t(`set.${def.key}` as MessageKey)}
      />
      {def.type === 'number' && def.suffix && <span className="soft">{def.suffix}</span>}
    </div>
  );
}

// ---------- accounts ----------

function Accounts() {
  const t = useT();
  const me = useUser();
  const users = useLiveQuery(() => db.users.toArray(), []);
  const [adding, setAdding] = useState(false);
  const [pinFor, setPinFor] = useState<User | null>(null);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t('settings.accounts')}</h2>
        <button className="btn primary sm" onClick={() => setAdding(true)}>
          <Plus size={16} />
          {t('accounts.new')}
        </button>
      </div>
      {users?.map((u) => (
        <div key={u.id} className="list-row">
          <span className="avatar" style={{ width: 36, height: 36, fontSize: 15 }}>
            {u.name.charAt(0).toUpperCase()}
          </span>
          <div className="grow">
            <div>
              {u.name} {u.id === me.id && <span className="badge ok">{t('accounts.you')}</span>}
              {!u.active && <span className="badge" style={{ marginLeft: 6 }}>{t('common.inactive')}</span>}
            </div>
          </div>
          <select
            className="select"
            style={{ width: 140 }}
            value={u.role}
            aria-label={t('accounts.role')}
            disabled={u.id === me.id}
            onChange={async (e) => {
              await db.users.update(u.id, { role: e.target.value as Role });
              toast(t('common.saved'));
            }}
          >
            {(['owner', 'manager', 'cashier'] as Role[]).map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
          <button className="btn sm" onClick={() => setPinFor(u)}>
            <KeyRound size={15} />
            {t('accounts.changePin')}
          </button>
          {u.id !== me.id && (
            <button
              className="btn sm ghost"
              onClick={async () => {
                try {
                  await setUserActive(u.id, !u.active);
                } catch (e) {
                  toast(errorMessage(t, e), 'error');
                }
              }}
            >
              {u.active ? t('common.deactivate') : t('common.activate')}
            </button>
          )}
        </div>
      ))}
      {adding && <NewAccount onClose={() => setAdding(false)} />}
      {pinFor && <PinDialog user={pinFor} onClose={() => setPinFor(null)} />}
    </div>
  );
}

function NewAccount({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [pin, setPin] = useState('');
  return (
    <Dialog
      title={t('accounts.new')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!name.trim() || !/^\d{4,6}$/.test(pin)}
            onClick={async () => {
              try {
                await createUser(name, role, pin);
                toast(t('common.saved'));
                onClose();
              } catch (e) {
                toast(errorMessage(t, e), 'error');
              }
            }}
          >
            {t('common.create')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('common.name')} htmlFor="a-name">
          <input id="a-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
        </Field>
        <Field label={t('accounts.role')}>
          <Seg
            value={role}
            onChange={setRole}
            options={(['cashier', 'manager', 'owner'] as Role[]).map((r) => ({ value: r, label: t(`role.${r}`) }))}
          />
        </Field>
        <Field label={t('setup.pin')} htmlFor="a-pin">
          <input id="a-pin" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </Field>
      </div>
    </Dialog>
  );
}

function PinDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const t = useT();
  const [pin, setPin] = useState('');
  return (
    <Dialog
      title={`${t('accounts.changePin')} · ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!/^\d{4,6}$/.test(pin)}
            onClick={async () => {
              try {
                await changePin(user.id, pin);
                toast(t('accounts.pinChanged'));
                onClose();
              } catch (e) {
                toast(errorMessage(t, e), 'error');
              }
            }}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      <Field label={t('setup.pin')} htmlFor="new-pin">
        <input id="new-pin" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
      </Field>
    </Dialog>
  );
}

// ---------- payment methods, tables, locations ----------

const KINDS: PaymentKind[] = ['cash', 'wallet', 'card', 'bank', 'other'];

function PaymentMethods() {
  const t = useT();
  const methods = useLiveQuery(() => db.paymentMethods.orderBy('sort').toArray(), []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PaymentKind>('wallet');
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t('settings.paymentMethods')}</h2>
        <button className="btn primary sm" onClick={() => setAdding(true)}>
          <Plus size={16} />
          {t('pm.new')}
        </button>
      </div>
      {methods?.map((m) => (
        <div key={m.id} className="list-row">
          <input
            className="input grow"
            defaultValue={m.name}
            aria-label={t('common.name')}
            onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && db.paymentMethods.update(m.id, { name: e.target.value.trim() })}
          />
          <select className="select" style={{ width: 200 }} value={m.kind} aria-label={t('pm.kind')} onChange={(e) => db.paymentMethods.update(m.id, { kind: e.target.value as PaymentKind })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`pm.kind.${k}`)}
              </option>
            ))}
          </select>
          <Switch checked={m.active} onChange={(v) => db.paymentMethods.update(m.id, { active: v })} label={m.name} />
        </div>
      ))}
      {adding && (
        <Dialog
          title={t('pm.new')}
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn" onClick={() => setAdding(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn primary"
                disabled={!name.trim()}
                onClick={async () => {
                  await db.paymentMethods.add({ id: uid(), name: name.trim(), kind, active: true, sort: methods?.length ?? 0 });
                  setName('');
                  setAdding(false);
                }}
              >
                {t('common.create')}
              </button>
            </>
          }
        >
          <div className="stack">
            <Field label={t('common.name')} htmlFor="pm-name">
              <input id="pm-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label={t('pm.kind')} htmlFor="pm-kind">
              <select id="pm-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`pm.kind.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Tables() {
  const t = useT();
  const tables = useLiveQuery(() => db.diningTables.orderBy('sort').toArray(), []);
  return (
    <NameList
      items={tables}
      canEdit
      addLabel={t('tables.new')}
      onAdd={async (name) => void (await db.diningTables.add({ id: uid(), name, seats: 4, sort: tables?.length ?? 0 }))}
      onRename={async (id, name) => void (await db.diningTables.update(id, { name }))}
      usage={(id) => db.sales.where('tableId').equals(id).count()}
      onDelete={(id) => db.diningTables.delete(id)}
    />
  );
}

function Locations() {
  const t = useT();
  const locations = useLiveQuery(() => db.locations.toArray(), []);
  return (
    <NameList
      items={locations}
      canEdit
      addLabel={t('locations.new')}
      onAdd={async (name) => void (await db.locations.add({ id: uid(), name }))}
      onRename={async (id, name) => void (await db.locations.update(id, { name }))}
      usage={async (id) => (id === DEFAULT_LOCATION_ID ? 1 : (await db.stock.where('locationId').equals(id).toArray()).filter((r) => r.qty !== 0).length)}
      onDelete={(id) => db.locations.delete(id)}
    />
  );
}

// ---------- permissions ----------

function Permissions() {
  const t = useT();
  const matrix = useApp((s) => s.permissions);
  async function toggle(role: keyof PermissionMatrix, a: (typeof ACTIONS)[number], v: boolean) {
    const next: PermissionMatrix = { ...matrix, [role]: { ...matrix[role], [a]: v } };
    await savePermissions(next);
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t('settings.permissions')}</h2>
      </div>
      <p className="muted small" style={{ padding: '12px 20px 0' }}>
        {t('perm.help')}
      </p>
      <div className="table-wrap">
        <table className="table perm-table">
          <thead>
            <tr>
              <th />
              <th>{t('role.manager')}</th>
              <th>{t('role.cashier')}</th>
            </tr>
          </thead>
          <tbody>
            {ACTIONS.map((a) => (
              <tr key={a}>
                <td>{t(`perm.${a}`)}</td>
                {(['manager', 'cashier'] as const).map((r) => (
                  <td key={r}>
                    <Switch checked={matrix[r][a]} onChange={(v) => toggle(r, a, v)} label={`${t(`role.${r}`)}: ${t(`perm.${a}`)}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- data ----------

function DataPanel() {
  const t = useT();
  const signOut = useApp((s) => s.signOut);
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState('');
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t('settings.data')}</h2>
      </div>
      <div className="setting">
        <div className="s-text">
          <div>{t('data.backup')}</div>
          <div className="help">{t('data.backupHelp')}</div>
        </div>
        <button className="btn" onClick={async () => download(`smart-pos-backup-${dayKey()}.json`, await exportAll(), 'application/json')}>
          <Download size={16} />
          {t('data.backup')}
        </button>
      </div>
      <div className="setting">
        <div className="s-text">
          <div>{t('data.restore')}</div>
          <div className="help">{t('data.restoreHelp')}</div>
        </div>
        <label className="btn">
          <Upload size={16} />
          {t('data.restore')}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                await importAll(await file.text());
                toast(t('data.restored'));
                signOut();
              } catch (err) {
                toast(errorMessage(t, err), 'error');
              }
            }}
          />
        </label>
      </div>
      <div className="setting">
        <div className="s-text">
          <div className="danger-text">{t('data.reset')}</div>
          <div className="help">{t('data.resetHelp')}</div>
        </div>
        <button className="btn danger" onClick={() => setConfirming(true)}>
          {t('data.reset')}
        </button>
      </div>
      <p className="muted small" style={{ padding: '12px 20px 16px' }}>
        {t('data.storage')}
      </p>
      {confirming && (
        <Dialog
          title={t('data.reset')}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn danger solid"
                disabled={word !== 'ERASE'}
                onClick={async () => {
                  await resetAll();
                  signOut();
                }}
              >
                {t('data.reset')}
              </button>
            </>
          }
        >
          <div className="stack">
            <p className="soft">{t('data.resetHelp')}</p>
            <Field label={t('data.resetConfirm')} htmlFor="erase">
              <input id="erase" className="input" value={word} onChange={(e) => setWord(e.target.value)} autoFocus autoComplete="off" />
            </Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function About() {
  const t = useT();
  return (
    <div className="panel panel-pad stack">
      <h2>Smart POS</h2>
      <p className="soft">{t('about.version', { v: VERSION })}</p>
      <p className="soft">{t('about.offline')}</p>
      <p className="muted small">{t('data.storage')}</p>
    </div>
  );
}

