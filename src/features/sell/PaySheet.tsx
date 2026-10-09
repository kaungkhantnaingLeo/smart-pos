import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Printer, X } from 'lucide-react';
import { db } from '../../db/db';
import type { Sale } from '../../db/types';
import { completeSale, type SaleDraft } from '../../db/services';
import { quickCashOptions, settle } from '../../lib/cart';
import { useCan, useFormat, useSettings, useT, useUser, errorMessage } from '../../state/app';
import { MoneyInput, Sheet, toast } from '../../ui/kit';
import { cx } from '../../lib/util';
import { printSale } from '../print/print';

interface TenderRow {
  methodId: string;
  amount: number | null;
}

export function PaySheet(props: {
  draft: SaleDraft;
  total: number;
  customerName?: string;
  onClose: () => void;
  onDone: () => void;
  onNewSale: () => void;
}) {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const can = useCan();
  const user = useUser();
  const methods = useLiveQuery(() => db.paymentMethods.orderBy('sort').toArray().then((m) => m.filter((x) => x.active)), []);
  const [rows, setRows] = useState<TenderRow[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Sale | null>(null);

  // Default to the first method (cash) for the full amount once methods load.
  const tenders: TenderRow[] = rows ?? (methods?.length ? [{ methodId: methods[0].id, amount: props.total }] : []);
  const cashIds = useMemo(() => new Set(methods?.filter((m) => m.kind === 'cash').map((m) => m.id)), [methods]);
  const st = settle(
    props.total,
    tenders.map((r) => ({ amount: r.amount ?? 0, isCash: cashIds.has(r.methodId) })),
  );
  const creditAllowed = s['module.customerCredit'] && can('sell.credit');
  const needsCustomer = st.due > 0 && s['sales.requireCustomerForCredit'] && !props.draft.customerId;
  const blocked = st.overpaidNonCash || (st.due > 0 && (!creditAllowed || needsCustomer));

  function update(i: number, patch: Partial<TenderRow>) {
    const next = tenders.map((r, k) => (k === i ? { ...r, ...patch } : r));
    setRows(next);
  }

  async function complete() {
    setBusy(true);
    try {
      const sale = await completeSale(
        { ...props.draft, tenders: tenders.filter((r) => (r.amount ?? 0) > 0).map((r) => ({ methodId: r.methodId, amount: r.amount! })) },
        { user, settings: s },
      );
      setDone(sale);
      props.onDone();
      if (s['print.auto']) printSale(sale);
    } catch (e) {
      toast(errorMessage(t, e), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Sheet title={t('sell.completed')} onClose={props.onNewSale}>
        <div className="done">
          <div className="tick">
            <Check size={32} />
          </div>
          <div className="muted">{done.number}</div>
          {done.change > 0 ? (
            <>
              <div className="soft">{t('sell.change')}</div>
              <div className="pay-total" style={{ padding: 0 }}>
                <span className="amount">{f.money(done.change)}</span>
              </div>
            </>
          ) : done.due > 0 ? (
            <>
              <div className="soft">{t('sell.due')}</div>
              <div className="pay-total" style={{ padding: 0 }}>
                <span className="amount">{f.money(done.due)}</span>
              </div>
            </>
          ) : (
            <div className="pay-total" style={{ padding: 0 }}>
              <span className="amount">{f.money(done.total)}</span>
            </div>
          )}
          <div className="row" style={{ marginTop: 16, width: '100%' }}>
            <button className="btn lg grow" onClick={() => printSale(done)}>
              <Printer size={18} />
              {t('sell.printReceipt')}
            </button>
            <button className="btn primary lg grow" onClick={props.onNewSale} autoFocus>
              {t('sell.newSale')}
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  const activeRow = tenders[active];
  const activeIsCash = activeRow && cashIds.has(activeRow.methodId);
  const otherPaid = tenders.reduce((a, r, i) => (i === active ? a : a + (r.amount ?? 0)), 0);
  const remainingForActive = Math.max(0, props.total - otherPaid);

  return (
    <Sheet
      title={t('sell.payment')}
      onClose={props.onClose}
      footer={
        <button className="btn primary lg block charge" disabled={busy || blocked || !methods} onClick={complete}>
          {st.due > 0 ? t('sell.completeCredit') : t('sell.complete')}
        </button>
      }
    >
      <div className="pay-total">
        <div className="muted">{props.customerName ?? t('sell.walkIn')}</div>
        <div className="amount">{f.money(props.total)}</div>
      </div>

      <div className="stack">
        {tenders.map((r, i) => (
          <div key={i} className="stack tight" onFocus={() => setActive(i)} onClick={() => setActive(i)}>
            {tenders.length > 1 && (
              <div className="row">
                <span className={cx('small', i === active ? 'ok-text' : 'muted')}>
                  {t('sell.payment')} {i + 1}
                </span>
                <span className="grow" />
                <button
                  className="btn ghost sm icon"
                  aria-label={t('common.remove')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRows(tenders.filter((_, k) => k !== i));
                    setActive(0);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="methods" role="radiogroup" aria-label={t('common.method')}>
              {methods?.map((m) => (
                <button key={m.id} role="radio" aria-checked={r.methodId === m.id} className={cx('method', r.methodId === m.id && 'on')} onClick={() => update(i, { methodId: m.id })}>
                  {m.name}
                </button>
              ))}
            </div>
            <MoneyInput value={r.amount} onChange={(v) => update(i, { amount: v })} ariaLabel={t('sell.tendered')} className={cx(i === active && 'active')} />
          </div>
        ))}

        {s['sales.quickCash'] && activeIsCash && (
          <div className="quick">
            {quickCashOptions(remainingForActive, f.decimals).map((v) => (
              <button key={v} onClick={() => update(active, { amount: v })}>
                {f.num(v)}
              </button>
            ))}
          </div>
        )}

        {methods && methods.length > 1 && st.tendered < props.total && (
          <button
            className="btn"
            onClick={() => {
              const used = new Set(tenders.map((r) => r.methodId));
              const next = methods.find((m) => !used.has(m.id)) ?? methods[0];
              setRows([...tenders, { methodId: next.id, amount: props.total - st.tendered }]);
              setActive(tenders.length);
            }}
          >
            <Plus size={16} />
            {t('sell.addTender')}
          </button>
        )}

        {st.change > 0 && (
          <div className="result change">
            <span>{t('sell.change')}</span>
            <strong>{f.money(st.change)}</strong>
          </div>
        )}
        {st.due > 0 && (
          <div className="result due">
            <span>{creditAllowed ? t('sell.due') : t('sell.remaining')}</span>
            <strong>{f.money(st.due)}</strong>
          </div>
        )}
        {st.overpaidNonCash && <p className="danger-text small">{t('err.nonCashOverpay')}</p>}
        {st.due > 0 && !creditAllowed && <p className="danger-text small">{t('err.notPaidInFull')}</p>}
        {creditAllowed && needsCustomer && <p className="danger-text small">{t('err.creditNeedsCustomer')}</p>}
      </div>
    </Sheet>
  );
}

