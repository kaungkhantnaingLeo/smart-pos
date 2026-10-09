import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, ClipboardCheck } from 'lucide-react';
import { db, DEFAULT_LOCATION_ID } from '../../db/db';
import type { MoveType, Product } from '../../db/types';
import { adjustStock, transferStock } from '../../db/services';
import { useCan, useFormat, useSettings, useT, useUser, errorMessage } from '../../state/app';
import { Dialog, Empty, Field, PageHead, QtyInput, RangePicker, SearchBox, Seg, Tabs, toast, useRange } from '../../ui/kit';
import { matches } from '../../lib/util';

type Tab = 'stock' | 'moves';
const MOVE_TYPES: MoveType[] = ['opening', 'sale', 'void', 'purchase', 'adjust', 'transfer_out', 'transfer_in'];

export function Inventory() {
  const t = useT();
  const s = useSettings();
  const [tab, setTab] = useState<Tab>('stock');
  if (!s['module.inventory']) {
    return (
      <div className="page">
        <PageHead title={t('inventory.title')} />
        <Empty>{t('inventory.disabled')}</Empty>
      </div>
    );
  }
  return (
    <div className="page">
      <PageHead title={t('inventory.title')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'stock', label: t('inventory.onHand') },
          { value: 'moves', label: t('inventory.movements') },
        ]}
      />
      {tab === 'stock' ? <StockList /> : <Movements />}
    </div>
  );
}

function StockList() {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const can = useCan();
  const multi = s['module.multiLocation'];
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState<string>('all');
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [counting, setCounting] = useState<Product | null>(null);
  const [moving, setMoving] = useState<Product | null>(null);
  const showCost = can('reports.profit');

  const data = useLiveQuery(async () => {
    const [products, stock, locations] = await Promise.all([db.products.orderBy('name').toArray(), db.stock.toArray(), db.locations.toArray()]);
    return { products: products.filter((p) => p.trackStock), stock, locations };
  }, []);

  if (!data) return null;
  const qtyOf = (pid: string) =>
    data.stock.filter((r) => r.productId === pid && (loc === 'all' || r.locationId === loc)).reduce((a, r) => a + r.qty, 0);
  const rows = data.products
    .map((p) => ({ p, qty: qtyOf(p.id) }))
    .filter(({ p, qty }) => matches(q, p.name, p.sku, p.barcode) && (filter === 'all' || qty <= p.reorderLevel));
  const totalCost = rows.reduce((a, r) => a + Math.round(Math.max(0, r.qty) * r.p.cost), 0);
  const totalSale = rows.reduce((a, r) => a + Math.round(Math.max(0, r.qty) * r.p.price), 0);

  return (
    <>
      <div className="filters">
        <div className="grow" style={{ minWidth: 220 }}>
          <SearchBox value={q} onChange={setQ} placeholder={t('common.search')} />
        </div>
        {multi && (
          <select className="select" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label={t('inventory.location')}>
            <option value="all">{t('inventory.allLocations')}</option>
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'low', label: t('inventory.lowStock') },
          ]}
        />
      </div>
      <div className="panel">
        {rows.length === 0 ? (
          <Empty>{t('reports.noData')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.product')}</th>
                  <th className="num">{t('inventory.onHand')}</th>
                  <th className="num">{t('inventory.reorderAt')}</th>
                  {showCost && <th className="num">{t('inventory.valueCost')}</th>}
                  <th className="num">{t('inventory.valueSale')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, qty }) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num">
                      <span className={qty <= 0 ? 'danger-text' : undefined} style={qty > 0 && qty <= p.reorderLevel ? { color: 'var(--warn)' } : undefined}>
                        {f.qty(qty)}
                      </span>
                    </td>
                    <td className="num soft">{f.qty(p.reorderLevel)}</td>
                    {showCost && <td className="num soft">{f.num(Math.round(Math.max(0, qty) * p.cost))}</td>}
                    <td className="num soft">{f.num(Math.round(Math.max(0, qty) * p.price))}</td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      {can('inventory.adjust') && (
                        <button className="btn ghost sm" onClick={() => setCounting(p)}>
                          <ClipboardCheck size={16} />
                          {t('inventory.adjust')}
                        </button>
                      )}
                      {multi && can('inventory.transfer') && data.locations.length > 1 && (
                        <button className="btn ghost sm" onClick={() => setMoving(p)}>
                          <ArrowLeftRight size={16} />
                          {t('inventory.transfer')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t('reports.totalRow')}</td>
                  {showCost && <td className="num">{f.money(totalCost)}</td>}
                  <td className="num">{f.money(totalSale)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {counting && (
        <CountDialog
          product={counting}
          locations={data.locations}
          defaultLocation={loc === 'all' ? DEFAULT_LOCATION_ID : loc}
          current={(l) => data.stock.find((r) => r.productId === counting.id && r.locationId === l)?.qty ?? 0}
          onClose={() => setCounting(null)}
        />
      )}
      {moving && <TransferDialog product={moving} locations={data.locations} onClose={() => setMoving(null)} />}
    </>
  );
}

function CountDialog(props: {
  product: Product;
  locations: { id: string; name: string }[];
  defaultLocation: string;
  current: (loc: string) => number;
  onClose: () => void;
}) {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const user = useUser();
  const [loc, setLoc] = useState(props.defaultLocation);
  const have = props.current(loc);
  const [counted, setCounted] = useState<number | null>(have);
  const [note, setNote] = useState('');
  const diff = (counted ?? have) - have;
  return (
    <Dialog
      title={`${t('inventory.adjust')} · ${props.product.name}`}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={counted === null || counted < 0}
            onClick={async () => {
              try {
                await adjustStock(props.product.id, loc, counted!, note.trim(), user);
                toast(t('inventory.adjusted'));
                props.onClose();
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
      <div className="stack">
        {s['module.multiLocation'] && (
          <Field label={t('inventory.location')} htmlFor="c-loc">
            <select id="c-loc" className="select" value={loc} onChange={(e) => setLoc(e.target.value)}>
              {props.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="row soft">
          <span className="grow">{t('inventory.onHand')}</span>
          <span className="num">{f.qty(have)}</span>
        </div>
        <Field label={t('inventory.counted')} htmlFor="c-qty">
          <QtyInput id="c-qty" value={counted} onChange={setCounted} autoFocus />
        </Field>
        <div className="row">
          <span className="grow soft">{t('inventory.difference')}</span>
          <strong className={`num ${diff < 0 ? 'danger-text' : diff > 0 ? 'ok-text' : ''}`}>
            {diff > 0 ? '+' : ''}
            {f.qty(diff)}
          </strong>
        </div>
        <Field label={t('common.note')} htmlFor="c-note">
          <input id="c-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>
      </div>
    </Dialog>
  );
}

function TransferDialog(props: { product: Product; locations: { id: string; name: string }[]; onClose: () => void }) {
  const t = useT();
  const s = useSettings();
  const user = useUser();
  const [from, setFrom] = useState(props.locations[0]?.id ?? '');
  const [to, setTo] = useState(props.locations[1]?.id ?? '');
  const [qty, setQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  return (
    <Dialog
      title={`${t('inventory.transfer')} · ${props.product.name}`}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!qty}
            onClick={async () => {
              try {
                await transferStock(props.product.id, from, to, qty!, note.trim(), user, s['sales.allowNegativeStock']);
                toast(t('inventory.transferred'));
                props.onClose();
              } catch (e) {
                toast(errorMessage(t, e), 'error');
              }
            }}
          >
            {t('inventory.transfer')}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid2">
          <Field label={t('inventory.fromLocation')} htmlFor="t-from">
            <select id="t-from" className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
              {props.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('inventory.toLocation')} htmlFor="t-to">
            <select id="t-to" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              {props.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('common.qty')} htmlFor="t-qty">
          <QtyInput id="t-qty" value={qty} onChange={setQty} autoFocus />
        </Field>
        <Field label={t('common.note')} htmlFor="t-note">
          <input id="t-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>
      </div>
    </Dialog>
  );
}

export function Movements() {
  const t = useT();
  const f = useFormat();
  const range = useRange('last7');
  const [type, setType] = useState<MoveType | 'all'>('all');
  const [q, setQ] = useState('');
  const data = useLiveQuery(async () => {
    const moves = await db.stockMoves.where('createdAt').between(range.range.from, range.range.to, true, true).reverse().sortBy('createdAt');
    const products = new Map((await db.products.toArray()).map((p) => [p.id, p.name]));
    const locations = new Map((await db.locations.toArray()).map((p) => [p.id, p.name]));
    return { moves, products, locations };
  }, [range.range.from, range.range.to]);
  const s = useSettings();
  const rows = (data?.moves ?? []).filter((m) => (type === 'all' || m.type === type) && matches(q, data?.products.get(m.productId), m.note));
  return (
    <>
      <div className="filters">
        <RangePicker {...range} />
        <select className="select" value={type} onChange={(e) => setType(e.target.value as MoveType | 'all')} aria-label={t('reports.type')}>
          <option value="all">{t('common.all')}</option>
          {MOVE_TYPES.map((m) => (
            <option key={m} value={m}>
              {t(`move.${m}`)}
            </option>
          ))}
        </select>
        <div className="grow" style={{ minWidth: 200 }}>
          <SearchBox value={q} onChange={setQ} placeholder={t('common.search')} />
        </div>
      </div>
      <div className="panel">
        {data && rows.length === 0 ? (
          <Empty>{t('inventory.noMoves')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('common.product')}</th>
                  <th>{t('reports.type')}</th>
                  {s['module.multiLocation'] && <th>{t('inventory.location')}</th>}
                  <th>{t('reports.reference')}</th>
                  <th className="num">{t('common.qty')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((m) => (
                  <tr key={m.id}>
                    <td className="tnum soft">
                      {f.date(m.createdAt)} {f.time(m.createdAt)}
                    </td>
                    <td>{data?.products.get(m.productId) ?? t('common.unknown')}</td>
                    <td>
                      <span className={`badge ${m.qty > 0 ? 'ok' : ''}`}>{t(`move.${m.type}`)}</span>
                    </td>
                    {s['module.multiLocation'] && <td className="soft">{data?.locations.get(m.locationId)}</td>}
                    <td className="soft">{m.note}</td>
                    <td className={`num ${m.qty < 0 ? '' : 'ok-text'}`}>
                      {m.qty > 0 ? '+' : ''}
                      {f.qty(m.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
