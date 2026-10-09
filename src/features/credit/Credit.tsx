import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { PartyType } from '../../db/types';
import { allBalances, recordSettlement, type Balance } from '../../db/services';
import { useFormat, useSettings, useT, useUser, errorMessage } from '../../state/app';
import { Dialog, Empty, Field, MoneyInput, PageHead, Sheet, Tabs, toast } from '../../ui/kit';

export function Credit() {
  const t = useT();
  const s = useSettings();
  const tabs = [
    ...(s['module.customerCredit'] ? [{ value: 'customer' as const, label: t('credit.receivables') }] : []),
    ...(s['module.supplierCredit'] ? [{ value: 'supplier' as const, label: t('credit.payables') }] : []),
  ];
  const [tab, setTab] = useState<PartyType>(tabs[0]?.value ?? 'customer');
  const kind = tabs.length > 1 ? tab : tabs[0]?.value ?? 'customer';
  return (
    <div className="page">
      <PageHead title={t('nav.credit')} />
      {tabs.length > 1 && <Tabs value={tab} onChange={setTab} tabs={tabs} />}
      <BalanceList kind={kind} />
    </div>
  );
}

function BalanceList({ kind }: { kind: PartyType }) {
  const t = useT();
  const f = useFormat();
  const [paying, setPaying] = useState<Balance | null>(null);
  const [viewing, setViewing] = useState<Balance | null>(null);
  const list = useLiveQuery(() => allBalances(kind), [kind]);
  const open = (list ?? []).filter((b) => b.balance > 0);
  const total = open.reduce((a, b) => a + b.balance, 0);

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'minmax(0, 360px)', marginBottom: 16 }}>
        <div className="panel kpi">
          <div className="label">{kind === 'customer' ? t('credit.receivables') : t('credit.payables')}</div>
          <div className="value">{f.money(total)}</div>
        </div>
      </div>
      <div className="panel">
        {list && open.length === 0 ? (
          <Empty>{t('credit.nothing')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('credit.lastActivity')}</th>
                  <th className="num">{t('credit.owed')}</th>
                  <th className="num">{t('credit.settled')}</th>
                  <th className="num">{t('credit.outstanding')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {open.map((b) => (
                  <tr key={b.contact.id} className="click" onClick={() => setViewing(b)}>
                    <td>
                      <div>{b.contact.name}</div>
                      {b.contact.phone && <div className="muted small num">{b.contact.phone}</div>}
                    </td>
                    <td className="soft tnum">{b.lastActivity ? f.date(b.lastActivity) : '—'}</td>
                    <td className="num soft">{f.num(b.owed)}</td>
                    <td className="num soft">{f.num(b.settled)}</td>
                    <td className="num">
                      <strong>{f.num(b.balance)}</strong>
                    </td>
                    <td className="right">
                      <button
                        className="btn sm primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaying(b);
                        }}
                      >
                        {t('credit.recordPayment')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {paying && <PaymentDialog kind={kind} balance={paying} onClose={() => setPaying(null)} />}
      {viewing && <History kind={kind} balance={viewing} onClose={() => setViewing(null)} onPay={() => setPaying(viewing)} />}
    </>
  );
}

function PaymentDialog({ kind, balance, onClose }: { kind: PartyType; balance: Balance; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const user = useUser();
  const methods = useLiveQuery(() => db.paymentMethods.orderBy('sort').toArray().then((m) => m.filter((x) => x.active)), []);
  const [amount, setAmount] = useState<number | null>(balance.balance);
  const [methodId, setMethodId] = useState('');
  const [note, setNote] = useState('');
  return (
    <Dialog
      title={kind === 'customer' ? t('credit.received', { name: balance.contact.name }) : t('credit.paidTo', { name: balance.contact.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!amount}
            onClick={async () => {
              try {
                await recordSettlement(kind, balance.contact.id, amount!, methodId || methods?.[0]?.id || null, note.trim(), user);
                toast(t('credit.paymentRecorded'));
                onClose();
              } catch (e) {
                toast(errorMessage(t, e), 'error');
              }
            }}
          >
            {t('credit.recordPayment')}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row soft">
          <span className="grow">{t('credit.outstanding')}</span>
          <span className="num">{f.money(balance.balance)}</span>
        </div>
        <Field label={t('common.amount')} htmlFor="pay-amt">
          <MoneyInput id="pay-amt" value={amount} onChange={setAmount} autoFocus />
        </Field>
        <Field label={t('common.method')} htmlFor="pay-m">
          <select id="pay-m" className="select" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {methods?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common.note')} htmlFor="pay-note">
          <input id="pay-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>
      </div>
    </Dialog>
  );
}

function History({ kind, balance, onClose, onPay }: { kind: PartyType; balance: Balance; onClose: () => void; onPay: () => void }) {
  const t = useT();
  const f = useFormat();
  const rows = useLiveQuery(async () => {
    const id = balance.contact.id;
    const docs =
      kind === 'customer'
        ? (await db.sales.where('customerId').equals(id).toArray())
            .filter((x) => x.status === 'completed' && x.due > 0)
            .map((x) => ({ at: x.createdAt, label: x.number, amount: x.due }))
        : (await db.purchases.where('supplierId').equals(id).toArray())
            .filter((x) => x.due > 0)
            .map((x) => ({ at: x.createdAt, label: x.number, amount: x.due }));
    const pays = (await db.settlements.where('partyId').equals(id).toArray())
      .filter((x) => x.partyType === kind)
      .map((x) => ({ at: x.createdAt, label: x.note || t('credit.settled'), amount: -x.amount }));
    return [...docs, ...pays].sort((a, b) => b.at - a.at);
  }, [balance.contact.id, kind]);
  return (
    <Sheet
      title={balance.contact.name}
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onPay}>
          {t('credit.recordPayment')}
        </button>
      }
    >
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="grow soft">{t('credit.outstanding')}</span>
        <strong className="num" style={{ fontSize: 22 }}>
          {f.money(balance.balance)}
        </strong>
      </div>
      <div className="panel">
        {rows?.map((r, i) => (
          <div key={i} className="list-row">
            <div className="grow">
              <div className="num">{r.label}</div>
              <div className="muted small">{f.date(r.at)}</div>
            </div>
            <span className={`num ${r.amount < 0 ? 'ok-text' : ''}`}>
              {r.amount < 0 ? '−' : '+'}
              {f.num(Math.abs(r.amount))}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
