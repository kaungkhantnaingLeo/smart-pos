import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Minus, PauseCircle, Percent, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import type { Product, Sale } from '../../db/types';
import { holdSale, deleteHeld, pricingRules, type DraftLine, type SaleDraft } from '../../db/services';
import { computeTotals, discountWithinLimit, lineNet } from '../../lib/cart';
import { useCan, useFormat, useSettings, useT, useUser, errorMessage } from '../../state/app';
import { Dialog, Empty, Field, MoneyInput, QtyInput, SearchBox, Sheet, toast } from '../../ui/kit';
import { cx, matches } from '../../lib/util';
import { PaySheet } from './PaySheet';

interface CartState {
  lines: DraftLine[];
  orderDiscount: number;
  customerId: string | null;
  tableId: string | null;
  note: string;
  heldId?: string;
}

const EMPTY: CartState = { lines: [], orderDiscount: 0, customerId: null, tableId: null, note: '' };

export function Sell() {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const can = useCan();
  const user = useUser();
  const searchRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<CartState>(EMPTY);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [editing, setEditing] = useState<number | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const products = useLiveQuery(() => db.products.toArray().then((p) => p.filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name))), []);
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), []);
  const stock = useLiveQuery(async () => {
    const m = new Map<string, number>();
    for (const r of await db.stock.toArray()) m.set(r.productId, (m.get(r.productId) ?? 0) + r.qty);
    return m;
  }, []);
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []);
  const tables = useLiveQuery(() => db.diningTables.orderBy('sort').toArray(), []);
  const held = useLiveQuery(() => db.sales.where('status').equals('held').toArray(), []);

  const totals = useMemo(() => computeTotals(cart.lines, cart.orderDiscount, pricingRules(s)), [cart, s]);
  const qtyInCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart.lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
    return m;
  }, [cart.lines]);

  const visible = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => (cat === 'all' || p.categoryId === cat) && matches(q, p.name, p.sku, p.barcode));
  }, [products, cat, q]);

  const inventoryOn = s['module.inventory'];
  const canDiscount = can('sell.discount');
  const overLimit = !discountWithinLimit(totals, s['sales.maxDiscountPct']) && !can('sell.overrideDiscountLimit');

  function add(p: Product) {
    setCart((c) => {
      const i = c.lines.findIndex((l) => l.productId === p.id && l.discount === 0 && l.price === p.price);
      if (i >= 0) {
        const lines = [...c.lines];
        lines[i] = { ...lines[i], qty: lines[i].qty + 1 };
        return { ...c, lines };
      }
      return { ...c, lines: [...c.lines, { productId: p.id, name: p.name, qty: 1, price: p.price, discount: 0 }] };
    });
  }

  function onScan() {
    const code = q.trim();
    if (!code || !products) return;
    const exact = products.find((p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
    const pick = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (pick) {
      add(pick);
      setQ('');
      toast(t('sell.added', { name: pick.name }));
    } else {
      toast(t('sell.notFound', { q: code }), 'error');
    }
  }

  function setLine(i: number, patch: Partial<DraftLine> | null) {
    setCart((c) => {
      const lines = [...c.lines];
      if (patch === null) lines.splice(i, 1);
      else lines[i] = { ...lines[i], ...patch };
      return { ...c, lines };
    });
  }

  function draft(): SaleDraft {
    return { ...cart, tenders: [] };
  }

  async function hold() {
    try {
      await holdSale(draft(), user);
      setCart(EMPTY);
      toast(t('sell.heldSaved'));
    } catch (e) {
      toast(errorMessage(t, e), 'error');
    }
  }

  async function resume(h: Sale) {
    // If something is already in the cart, park it first so nothing is lost.
    if (cart.lines.length) await holdSale(draft(), user);
    setCart({
      lines: h.lines.map(({ productId, name, qty, price, discount }) => ({ productId, name, qty, price, discount })),
      orderDiscount: h.orderDiscount,
      customerId: h.customerId,
      tableId: h.tableId,
      note: h.note,
      heldId: h.id,
    });
    setHeldOpen(false);
  }

  const cols = s['ui.gridColumns'];
  const gridStyle = cols === 'auto' ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  const itemCount = cart.lines.reduce((a, l) => a + l.qty, 0);

  return (
    <div className="sell">
      <section className="sell-products" aria-label={t('nav.catalog')}>
        <SearchBox inputRef={searchRef} value={q} onChange={setQ} onEnter={onScan} placeholder={t('sell.search')} />
        {categories && categories.length > 0 && (
          <div className="chips" role="tablist">
            <button className={cx('chip', cat === 'all' && 'on')} onClick={() => setCat('all')}>
              {t('sell.allCategories')}
            </button>
            {categories.map((c) => (
              <button key={c.id} className={cx('chip', cat === c.id && 'on')} onClick={() => setCat(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="sell-grid" style={gridStyle}>
          {products && visible.length === 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Empty>{products.length === 0 ? t('catalog.noProducts') : t('sell.notFound', { q })}</Empty>
            </div>
          )}
          {visible.map((p) => {
            const have = (stock?.get(p.id) ?? 0) - (qtyInCart.get(p.id) ?? 0);
            const inCart = qtyInCart.get(p.id);
            return (
              <button key={p.id} className="tile" onClick={() => add(p)}>
                <span className="t-name">{p.name}</span>
                <span className="t-meta">
                  <span>
                    <span className="t-price">{f.num(p.price)}</span>
                    {inventoryOn && p.trackStock && (
                      <span className={cx('t-stock', have <= 0 ? 'out' : have <= p.reorderLevel && 'low')} style={{ display: 'block' }}>
                        {t('sell.stock', { qty: f.qty(have) })}
                      </span>
                    )}
                  </span>
                  {inCart ? <span className="t-qty">{f.qty(inCart)}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <button className="btn primary lg cart-toggle" onClick={() => setCartOpen(true)}>
        <ShoppingCart size={20} />
        {t('common.items', { n: f.qty(itemCount) })} · {f.money(totals.total)}
      </button>

      <aside className={cx('cart', cartOpen && 'open')} aria-label={t('sell.cart')}>
        <div className="cart-head">
          <div className="row">
            <h2 className="grow">{t('sell.cart')}</h2>
            {s['sales.holdVouchers'] && (
              <button className="btn sm" onClick={() => setHeldOpen(true)}>
                <PauseCircle size={16} />
                {held?.length ? t('dash.held', { n: held.length }) : t('sell.held')}
              </button>
            )}
            <button className="btn sm ghost cart-close" onClick={() => setCartOpen(false)} style={{ display: cartOpen ? undefined : 'none' }}>
              {t('common.close')}
            </button>
          </div>
          {(s['module.customers'] || s['module.tables']) && (
            <div className="row">
              {s['module.customers'] && (
                <select
                  className="select grow"
                  aria-label={t('sell.customer')}
                  value={cart.customerId ?? ''}
                  onChange={(e) => setCart({ ...cart, customerId: e.target.value || null })}
                >
                  <option value="">{t('sell.walkIn')}</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {s['module.tables'] && (
                <select
                  className="select grow"
                  aria-label={t('sell.table')}
                  value={cart.tableId ?? ''}
                  onChange={(e) => setCart({ ...cart, tableId: e.target.value || null })}
                >
                  <option value="">{t('sell.noTable')}</option>
                  {tables?.map((tb) => (
                    <option key={tb.id} value={tb.id}>
                      {tb.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="cart-lines">
          {cart.lines.length === 0 ? (
            <Empty icon={<ShoppingCart size={28} />}>{t('sell.emptyCart')}</Empty>
          ) : (
            cart.lines.map((l, i) => (
              <div key={i} className="cart-line" onClick={() => setEditing(i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(i)}>
                <span className="cl-name">{l.name}</span>
                <span className="cl-amount">{f.num(lineNet(l))}</span>
                <span className="cl-meta">
                  {f.num(l.price)}
                  {l.discount > 0 && ` · −${f.num(l.discount)}`}
                </span>
                <span className="stepper" onClick={(e) => e.stopPropagation()}>
                  <button aria-label="−1" onClick={() => (l.qty <= 1 ? setLine(i, null) : setLine(i, { qty: l.qty - 1 }))}>
                    {l.qty <= 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                  </button>
                  <span>{f.qty(l.qty)}</span>
                  <button aria-label="+1" onClick={() => setLine(i, { qty: l.qty + 1 })}>
                    <Plus size={15} />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        <div className="cart-foot">
          <div className="sum-row">
            <span>{t('sell.subtotal')}</span>
            <span>{f.num(totals.subtotal)}</span>
          </div>
          {totals.lineDiscount > 0 && (
            <div className="sum-row">
              <span>{t('sell.lineDiscount')}</span>
              <span>−{f.num(totals.lineDiscount)}</span>
            </div>
          )}
          {s['sales.orderDiscount'] && canDiscount && (
            <div className="sum-row">
              <button className="btn ghost sm" style={{ marginLeft: -10 }} onClick={() => setDiscountOpen(true)} disabled={!cart.lines.length}>
                <Percent size={15} />
                {t('sell.orderDiscount')}
              </button>
              <span>{totals.orderDiscount > 0 ? `−${f.num(totals.orderDiscount)}` : ''}</span>
            </div>
          )}
          {totals.tax > 0 && (
            <div className="sum-row">
              <span>
                {s['tax.label']} {s['tax.rate']}%{s['tax.mode'] === 'inclusive' ? ' ✓' : ''}
              </span>
              <span>{f.num(totals.tax)}</span>
            </div>
          )}
          {totals.rounding !== 0 && (
            <div className="sum-row">
              <span>{t('sell.rounding')}</span>
              <span>{f.num(totals.rounding)}</span>
            </div>
          )}
          <div className="sum-total">
            <span className="soft">{t('sell.total')}</span>
            <span className="amount">{f.money(totals.total)}</span>
          </div>
          {overLimit && <p className="danger-text small">{t('sell.discountTooHigh', { pct: s['sales.maxDiscountPct'] })}</p>}
          <div className="row">
            {s['sales.holdVouchers'] && (
              <button className="btn lg" onClick={hold} disabled={!cart.lines.length}>
                {t('sell.hold')}
              </button>
            )}
            <button className="btn lg ghost" onClick={() => setCart(EMPTY)} disabled={!cart.lines.length && !cart.heldId}>
              {t('sell.clear')}
            </button>
          </div>
          <button className="btn primary block charge" disabled={!cart.lines.length || overLimit} onClick={() => setPaying(true)}>
            {t('sell.charge', { amount: f.money(totals.total) })}
          </button>
        </div>
      </aside>

      {editing !== null && cart.lines[editing] && (
        <LineEditor
          line={cart.lines[editing]}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            setLine(editing, patch);
            setEditing(null);
          }}
          allowDiscount={s['sales.lineDiscount'] && canDiscount}
          allowPrice={s['sales.priceEdit']}
        />
      )}

      {discountOpen && (
        <OrderDiscount
          base={totals.subtotal - totals.lineDiscount}
          value={cart.orderDiscount}
          onClose={() => setDiscountOpen(false)}
          onSave={(v) => {
            setCart({ ...cart, orderDiscount: v });
            setDiscountOpen(false);
          }}
        />
      )}

      {heldOpen && (
        <Sheet title={t('sell.held')} onClose={() => setHeldOpen(false)}>
          {!held?.length ? (
            <Empty>{t('sell.noHeld')}</Empty>
          ) : (
            <div className="panel">
              {held
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((h) => {
                  const tot = computeTotals(h.lines, h.orderDiscount, pricingRules(s)).total;
                  const who = customers?.find((c) => c.id === h.customerId)?.name ?? tables?.find((x) => x.id === h.tableId)?.name;
                  return (
                    <div key={h.id} className="list-row">
                      <div className="grow">
                        <div>
                          {f.time(h.createdAt)} · {t('common.items', { n: h.lines.length })}
                          {who ? ` · ${who}` : ''}
                        </div>
                        <div className="muted small ellipsis">{h.lines.map((l) => l.name).join(', ')}</div>
                      </div>
                      <strong className="num">{f.money(tot)}</strong>
                      <button className="btn sm primary" onClick={() => resume(h)}>
                        {t('sell.resume')}
                      </button>
                      <button className="btn sm ghost icon" aria-label={t('common.delete')} onClick={() => deleteHeld(h.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </Sheet>
      )}

      {paying && (
        <PaySheet
          draft={draft()}
          total={totals.total}
          customerName={customers?.find((c) => c.id === cart.customerId)?.name}
          onClose={() => setPaying(false)}
          onDone={() => {
            setCart(EMPTY);
            setCartOpen(false);
          }}
          onNewSale={() => {
            setPaying(false);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function LineEditor(props: {
  line: DraftLine;
  onClose: () => void;
  onSave: (patch: Partial<DraftLine> | null) => void;
  allowDiscount: boolean;
  allowPrice: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const [qty, setQty] = useState<number | null>(props.line.qty);
  const [price, setPrice] = useState<number | null>(props.line.price);
  const [discount, setDiscount] = useState<number | null>(props.line.discount);
  const valid = qty !== null && qty > 0 && price !== null && price >= 0 && (discount ?? 0) >= 0;
  const gross = Math.round((qty ?? 0) * (price ?? 0));
  return (
    <Dialog
      title={props.line.name}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn danger" onClick={() => props.onSave(null)}>
            <Trash2 size={16} />
            {t('common.remove')}
          </button>
          <span className="grow" />
          <button className="btn" onClick={props.onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={() => props.onSave({ qty: qty!, price: price!, discount: Math.min(discount ?? 0, gross) })}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('common.qty')} htmlFor="le-qty">
          <QtyInput id="le-qty" value={qty} onChange={setQty} autoFocus />
        </Field>
        {props.allowPrice ? (
          <Field label={t('sell.unitPrice')} htmlFor="le-price">
            <MoneyInput id="le-price" value={price} onChange={setPrice} />
          </Field>
        ) : (
          <div className="row soft">
            <span className="grow">{t('sell.unitPrice')}</span>
            <span className="num">{f.money(props.line.price)}</span>
          </div>
        )}
        {props.allowDiscount && (
          <Field label={t('sell.lineDiscount')} htmlFor="le-disc">
            <MoneyInput id="le-disc" value={discount} onChange={setDiscount} />
          </Field>
        )}
        <div className="row">
          <span className="grow soft">{t('common.total')}</span>
          <strong className="num">{f.money(Math.max(0, gross - Math.min(discount ?? 0, gross)))}</strong>
        </div>
      </div>
    </Dialog>
  );
}

function OrderDiscount(props: { base: number; value: number; onClose: () => void; onSave: (v: number) => void }) {
  const t = useT();
  const f = useFormat();
  const [amount, setAmount] = useState<number | null>(props.value || null);
  const pcts = [5, 10, 15, 20];
  return (
    <Dialog
      title={t('sell.orderDiscount')}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => props.onSave(0)}>
            {t('sell.clear')}
          </button>
          <span className="grow" />
          <button className="btn" onClick={props.onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => props.onSave(Math.min(Math.max(0, amount ?? 0), props.base))}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="stack">
        <MoneyInput value={amount} onChange={setAmount} autoFocus ariaLabel={t('common.amount')} />
        <div className="quick">
          {pcts.map((p) => (
            <button key={p} onClick={() => setAmount(Math.round((props.base * p) / 100))}>
              {p}%
            </button>
          ))}
        </div>
        <p className="muted small">
          {t('sell.subtotal')}: {f.money(props.base)}
        </p>
      </div>
    </Dialog>
  );
}

