import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Printer, Ban } from 'lucide-react';
import { db } from '../../db/db';
import type { Sale } from '../../db/types';
import { voidSale } from '../../db/services';
import { useCan, useFormat, useSettings, useT, useUser, errorMessage } from '../../state/app';
import { Dialog, Empty, Field, PageHead, RangePicker, SearchBox, Seg, Sheet, toast, useRange } from '../../ui/kit';
import { matches } from '../../lib/util';
import { Receipt, printSale, useReceiptNames } from '../print/print';

type StatusFilter = 'all' | 'completed' | 'void' | 'credit';

export function Vouchers() {
  const t = useT();
  const f = useFormat();
  const can = useCan();
  const user = useUser();
  const range = useRange('today');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Sale | null>(null);
  const viewAll = can('sale.viewAll');

  const data = useLiveQuery(async () => {
    let rows = await db.sales.where('createdAt').between(range.range.from, range.range.to, true, true).toArray();
    rows = rows.filter((r) => r.status !== 'held');
    if (!viewAll) rows = rows.filter((r) => r.userId === user.id);
    const customers = new Map((await db.customers.toArray()).map((c) => [c.id, c.name]));
    const users = new Map((await db.users.toArray()).map((c) => [c.id, c.name]));
    return { rows: rows.sort((a, b) => b.createdAt - a.createdAt), customers, users };
  }, [range.range.from, range.range.to, viewAll, user.id]);

  const rows = (data?.rows ?? []).filter(
    (r) =>
      (status === 'all' || (status === 'credit' ? r.status === 'completed' && r.due > 0 : r.status === status)) &&
      matches(q, r.number, data?.customers.get(r.customerId ?? '')),
  );
  const completed = rows.filter((r) => r.status === 'completed');
  const total = completed.reduce((a, r) => a + r.total, 0);

  return (
    <div className="page">
      <PageHead title={t('vouchers.title')} />
      <div className="filters">
        <RangePicker {...range} />
        <Seg
          value={status}
          onChange={setStatus}
          label={t('common.status')}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'completed', label: t('vouchers.status.completed') },
            { value: 'credit', label: t('sell.due') },
            { value: 'void', label: t('vouchers.status.void') },
          ]}
        />
        <div className="grow" style={{ minWidth: 200 }}>
          <SearchBox value={q} onChange={setQ} placeholder={t('common.search')} />
        </div>
      </div>
      {!viewAll && <p className="muted small" style={{ marginBottom: 12 }}>{t('vouchers.mineOnly')}</p>}
      <div className="panel">
        {data && rows.length === 0 ? (
          <Empty>{t('vouchers.none')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('vouchers.number')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('sell.customer')}</th>
                  <th>{t('vouchers.cashier')}</th>
                  <th>{t('common.status')}</th>
                  <th className="num">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                    <td className="tnum">{r.number}</td>
                    <td className="tnum soft">
                      {f.date(r.createdAt)} {f.time(r.createdAt)}
                    </td>
                    <td>{r.customerId ? data?.customers.get(r.customerId) : <span className="muted">—</span>}</td>
                    <td className="soft">{data?.users.get(r.userId)}</td>
                    <td>
                      {r.status === 'void' ? (
                        <span className="badge danger">{t('vouchers.status.void')}</span>
                      ) : r.due > 0 ? (
                        <span className="badge warn">
                          {t('sell.due')} {f.num(r.due)}
                        </span>
                      ) : (
                        <span className="badge ok">{t('vouchers.status.completed')}</span>
                      )}
                    </td>
                    <td className="num" style={r.status === 'void' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                      {f.money(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {completed.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={5}>
                      {t('reports.totalRow')} · {completed.length}
                    </td>
                    <td className="num">{f.money(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
      {open && <VoucherSheet sale={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function VoucherSheet({ sale: initial, onClose }: { sale: Sale; onClose: () => void }) {
  const t = useT();
  const s = useSettings();
  const can = useCan();
  const user = useUser();
  const sale = useLiveQuery(() => db.sales.get(initial.id), [initial.id]) ?? initial;
  const names = useReceiptNames(sale);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <Sheet
      title={sale.number}
      onClose={onClose}
      footer={
        <>
          {sale.status === 'completed' && can('sale.void') && (
            <button className="btn danger" onClick={() => setVoiding(true)}>
              <Ban size={16} />
              {t('vouchers.void')}
            </button>
          )}
          <span className="grow" />
          <button className="btn primary" onClick={() => printSale(sale)}>
            <Printer size={16} />
            {t('vouchers.reprint')}
          </button>
        </>
      }
    >
      <div className="receipt-preview">{names && <Receipt sale={sale} s={s} names={names} />}</div>
      {sale.status === 'void' && sale.voidReason && (
        <p className="muted small" style={{ marginTop: 12 }}>
          {t('vouchers.voidReason')}: {sale.voidReason}
        </p>
      )}
      {voiding && (
        <Dialog
          title={t('vouchers.void')}
          onClose={() => setVoiding(false)}
          footer={
            <>
              <button className="btn" onClick={() => setVoiding(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn danger solid"
                disabled={!reason.trim()}
                onClick={async () => {
                  try {
                    await voidSale(sale.id, user, reason.trim());
                    toast(t('vouchers.voided'));
                    setVoiding(false);
                  } catch (e) {
                    toast(errorMessage(t, e), 'error');
                  }
                }}
              >
                {t('vouchers.void')}
              </button>
            </>
          }
        >
          <div className="stack">
            <p className="soft">{t('vouchers.voidHelp')}</p>
            <Field label={t('vouchers.voidReason')} htmlFor="void-reason">
              <input id="void-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={120} />
            </Field>
          </div>
        </Dialog>
      )}
    </Sheet>
  );
}
