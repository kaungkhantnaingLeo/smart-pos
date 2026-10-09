import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import type { Purchase, PurchaseLine } from '../../db/types';
import { savePurchase } from '../../db/services';
import { useFormat, useSettings, useT, useUser, errorMessage } from '../../state/app';
import { Empty, Field, MoneyInput, PageHead, QtyInput, RangePicker, SearchBox, Sheet, toast, useRange } from '../../ui/kit';
import { matches } from '../../lib/util';

export function Purchases() {
  const t = useT();
  const f = useFormat();
  const range = useRange('thisMonth');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Purchase | null>(null);

  const data = useLiveQuery(async () => {
    const rows = await db.purchases.where('createdAt').between(range.range.from, range.range.to, true, true).reverse().sortBy('createdAt');
    const suppliers = new Map((await db.suppliers.toArray()).map((x) => [x.id, x.name]));
    return { rows, suppliers };
  }, [range.range.from, range.range.to]);

  const total = data?.rows.reduce((a, r) => a + r.total, 0) ?? 0;

  return (
    <div className="page">
      <PageHead title={t('purchases.title')}>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={18} />
          {t('purchases.new')}
        </button>
      </PageHead>
      <div className="filters">
        <RangePicker {...range} />
      </div>
      <div className="panel">
        {data && data.rows.length === 0 ? (
          <Empty>{t('purchases.none')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('purchases.number')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('purchases.supplier')}</th>
                  <th className="num">{t('common.count')}</th>
                  <th className="num">{t('purchases.due')}</th>
                  <th className="num">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r) => (
                  <tr key={r.id} className="click" onClick={() => setOpen(r)}>
                    <td className="tnum">{r.number}</td>
                    <td className="tnum soft">{f.date(r.createdAt)}</td>
                    <td>{r.supplierId ? data.suppliers.get(r.supplierId) : <span className="muted">—</span>}</td>
                    <td className="num soft">{f.qty(r.lines.length)}</td>
                    <td className="num">{r.due > 0 ? <span className="badge warn">{f.num(r.due)}</span> : <span className="muted">—</span>}</td>
                    <td className="num">{f.money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              {data && data.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={5}>{t('reports.totalRow')}</td>
                    <td className="num">{f.money(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
      {creating && <PurchaseForm onClose={() => setCreating(false)} />}
      {open && (
        <Sheet title={open.number} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="soft">
              {f.date(open.createdAt)} {f.time(open.createdAt)}
              {open.supplierId ? ` · ${data?.suppliers.get(open.supplierId) ?? ''}` : ''}
            </div>
            <div className="panel">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.product')}</th>
                    <th className="num">{t('common.qty')}</th>
                    <th className="num">{t('purchases.unitCost')}</th>
                    <th className="num">{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {open.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.name}</td>
                      <td className="num">{f.qty(l.qty)}</td>
                      <td className="num">{f.num(l.cost)}</td>
                      <td className="num">{f.num(Math.round(l.qty * l.cost))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>{t('common.total')}</td>
                    <td className="num">{f.money(open.total)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3}>{t('purchases.paid')}</td>
                    <td className="num">{f.money(open.paid)}</td>
                  </tr>
                  {open.due > 0 && (
                    <tr>
                      <td colSpan={3}>{t('purchases.due')}</td>
                      <td className="num">{f.money(open.due)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            {open.note && <p className="soft">{open.note}</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function PurchaseForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const user = useUser();
  const suppliers = useLiveQuery(() => db.suppliers.orderBy('name').toArray(), []);
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);
  const methods = useLiveQuery(() => db.paymentMethods.orderBy('sort').toArray().then((m) => m.filter((x) => x.active)), []);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [lines, setLines] = useState<(Omit<PurchaseLine, 'qty' | 'cost'> & { qty: number | null; cost: number | null })[]>([]);
  const [q, setQ] = useState('');
  const [paid, setPaid] = useState<number | null>(null);
  const [methodId, setMethodId] = useState<string>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((a, l) => a + Math.round((l.qty ?? 0) * (l.cost ?? 0)), 0);
  const effectivePaid = paid ?? total;
  const suggestions = useMemo(
    () => (q.trim() ? (products ?? []).filter((p) => matches(q, p.name, p.sku, p.barcode)).slice(0, 8) : []),
    [q, products],
  );

  function addProduct(id: string) {
    const p = products?.find((x) => x.id === id);
    if (!p) return;
    setLines((ls) => (ls.some((l) => l.productId === id) ? ls : [...ls, { productId: p.id, name: p.name, qty: 1, cost: p.cost }]));
    setQ('');
  }

  async function save() {
    setBusy(true);
    try {
      await savePurchase(
        {
          supplierId,
          lines: lines.filter((l) => l.qty && l.qty > 0).map((l) => ({ productId: l.productId, name: l.name, qty: l.qty!, cost: l.cost ?? 0 })),
          paid: effectivePaid,
          methodId: methodId || methods?.[0]?.id || null,
          note: note.trim(),
        },
        user,
        s,
      );
      toast(t('purchases.saved'));
      onClose();
    } catch (e) {
      toast(errorMessage(t, e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      wide
      title={t('purchases.new')}
      onClose={onClose}
      footer={
        <>
          <span className="grow soft">
            {t('common.total')} <strong className="num" style={{ color: 'var(--ink)', fontSize: 18, marginLeft: 6 }}>{f.money(total)}</strong>
          </span>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={busy || !lines.length} onClick={save}>
            {t('purchases.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('purchases.supplier')} htmlFor="pu-sup">
          <select id="pu-sup" className="select" value={supplierId ?? ''} onChange={(e) => setSupplierId(e.target.value || null)}>
            <option value="">{t('purchases.noSupplier')}</option>
            {suppliers?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <SearchBox value={q} onChange={setQ} placeholder={t('purchases.addItem')} onEnter={() => suggestions[0] && addProduct(suggestions[0].id)} />
          {suggestions.length > 0 && (
            <div className="panel" style={{ marginTop: 6 }}>
              {suggestions.map((p) => (
                <button key={p.id} className="list-row" onClick={() => addProduct(p.id)}>
                  <span className="grow">{p.name}</span>
                  <span className="muted num">{f.num(p.cost)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.product')}</th>
                  <th className="num" style={{ width: 110 }}>{t('common.qty')}</th>
                  <th className="num" style={{ width: 150 }}>{t('purchases.unitCost')}</th>
                  <th className="num">{t('common.total')}</th>
                  <th style={{ width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.productId}>
                    <td>{l.name}</td>
                    <td>
                      <QtyInput value={l.qty} ariaLabel={t('common.qty')} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: v } : x)))} />
                    </td>
                    <td>
                      <MoneyInput value={l.cost} ariaLabel={t('purchases.unitCost')} onChange={(v) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, cost: v } : x)))} />
                    </td>
                    <td className="num">{f.num(Math.round((l.qty ?? 0) * (l.cost ?? 0)))}</td>
                    <td>
                      <button className="btn ghost sm icon" aria-label={t('common.remove')} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid2">
          <Field label={t('purchases.paid')} htmlFor="pu-paid" help={s['module.supplierCredit'] && effectivePaid < total ? `${t('purchases.due')}: ${f.money(total - effectivePaid)}` : undefined}>
            <MoneyInput id="pu-paid" value={paid ?? total} onChange={setPaid} />
          </Field>
          <Field label={t('common.method')} htmlFor="pu-method">
            <select id="pu-method" className="select" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              {methods?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('common.note')} htmlFor="pu-note">
          <input id="pu-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </div>
    </Sheet>
  );
}
