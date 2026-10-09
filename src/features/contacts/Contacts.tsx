import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { db } from '../../db/db';
import type { Contact, PartyType } from '../../db/types';
import { allBalances } from '../../db/services';
import { useCan, useFormat, useSettings, useT, errorMessage } from '../../state/app';
import { Empty, Field, MoneyInput, PageHead, SearchBox, Sheet, Tabs, toast } from '../../ui/kit';
import { matches, uid } from '../../lib/util';

export function Contacts() {
  const t = useT();
  const s = useSettings();
  const tabs = [
    ...(s['module.customers'] ? [{ value: 'customer' as const, label: t('contacts.customers') }] : []),
    ...(s['module.purchases'] ? [{ value: 'supplier' as const, label: t('contacts.suppliers') }] : []),
  ];
  const [tab, setTab] = useState<PartyType>(tabs[0]?.value ?? 'customer');
  return (
    <div className="page">
      <PageHead title={t('nav.contacts')} />
      {tabs.length > 1 && <Tabs value={tab} onChange={setTab} tabs={tabs} />}
      <ContactList kind={tabs.length > 1 ? tab : tabs[0]?.value ?? 'customer'} />
    </div>
  );
}

function ContactList({ kind }: { kind: PartyType }) {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const can = useCan();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const table = kind === 'customer' ? db.customers : db.suppliers;
  const credit = kind === 'customer' ? s['module.customerCredit'] : s['module.supplierCredit'];
  const data = useLiveQuery(async () => {
    const list = await table.orderBy('name').toArray();
    const balances = credit ? new Map((await allBalances(kind)).map((b) => [b.contact.id, b.balance])) : new Map<string, number>();
    return { list, balances };
  }, [kind, credit]);
  const rows = (data?.list ?? []).filter((c) => matches(q, c.name, c.phone));
  const canEdit = can('contacts.manage');

  return (
    <>
      <div className="filters">
        <div className="grow" style={{ minWidth: 220 }}>
          <SearchBox value={q} onChange={setQ} placeholder={t('common.search')} />
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Plus size={18} />
            {kind === 'customer' ? t('contacts.newCustomer') : t('contacts.newSupplier')}
          </button>
        )}
      </div>
      <div className="panel">
        {data && rows.length === 0 ? (
          <Empty>{t('contacts.none')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.phone')}</th>
                  {credit && kind === 'customer' && <th className="num">{t('contacts.creditLimit')}</th>}
                  {credit && <th className="num">{t('contacts.balance')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const bal = data?.balances.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} className={canEdit ? 'click' : undefined} onClick={() => canEdit && setEditing(c)}>
                      <td>{c.name}</td>
                      <td className="soft tnum">{c.phone || '—'}</td>
                      {credit && kind === 'customer' && <td className="num soft">{c.creditLimit ? f.num(c.creditLimit) : '—'}</td>}
                      {credit && <td className="num">{bal > 0 ? <span className="badge warn">{f.num(bal)}</span> : <span className="muted">—</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <ContactForm
          kind={kind}
          contact={editing === 'new' ? null : editing}
          showLimit={kind === 'customer' && s['module.customerCredit']}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ContactForm(props: { kind: PartyType; contact: Contact | null; showLimit: boolean; onClose: () => void }) {
  const t = useT();
  const c = props.contact;
  const [name, setName] = useState(c?.name ?? '');
  const [phone, setPhone] = useState(c?.phone ?? '');
  const [address, setAddress] = useState(c?.address ?? '');
  const [note, setNote] = useState(c?.note ?? '');
  const [limit, setLimit] = useState<number | null>(c?.creditLimit ?? 0);
  const table = props.kind === 'customer' ? db.customers : db.suppliers;

  async function save() {
    if (!name.trim()) return;
    try {
      const data = { name: name.trim(), phone: phone.trim(), address: address.trim(), note: note.trim(), creditLimit: limit ?? 0 };
      if (c) await table.update(c.id, data);
      else await table.add({ ...data, id: uid(), createdAt: Date.now() });
      toast(t('common.saved'));
      props.onClose();
    } catch (e) {
      toast(errorMessage(t, e), 'error');
    }
  }

  return (
    <Sheet
      title={c ? c.name : props.kind === 'customer' ? t('contacts.newCustomer') : t('contacts.newSupplier')}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!name.trim()} onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('common.name')} htmlFor="c-name">
          <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </Field>
        <Field label={t('common.phone')} htmlFor="c-phone">
          <input id="c-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={40} />
        </Field>
        <Field label={t('common.address')} htmlFor="c-addr">
          <textarea id="c-addr" className="textarea" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
        </Field>
        {props.showLimit && (
          <Field label={t('contacts.creditLimit')} help={t('contacts.creditLimitHelp')} htmlFor="c-limit">
            <MoneyInput id="c-limit" value={limit} onChange={setLimit} />
          </Field>
        )}
        <Field label={t('common.note')} htmlFor="c-note">
          <input id="c-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </div>
    </Sheet>
  );
}
