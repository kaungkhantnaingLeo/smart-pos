import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { db } from '../../db/db';
import type { Sale } from '../../db/types';
import { useCan, useFormat, useSettings, useT, type Formatters } from '../../state/app';
import type { MessageKey } from '../../i18n/en';
import { Empty, PageHead, RangePicker, Seg, useRange } from '../../ui/kit';
import { dayKey, monthKey, monthTitle, parseDayKey, weekdayName } from '../../lib/dates';
import { download, groupBy, toCsv } from '../../lib/util';
import { Movements } from '../inventory/Inventory';
import type { SettingKey } from '../../config/registry';

interface ReportDef {
  id: string;
  group: 'sales' | 'inventory' | 'finance';
  module?: SettingKey;
  profit?: boolean;
}

const REPORTS: ReportDef[] = [
  { id: 'salesSummary', group: 'sales' },
  { id: 'calendar', group: 'sales' },
  { id: 'byProduct', group: 'sales' },
  { id: 'byCategory', group: 'sales' },
  { id: 'byCustomer', group: 'sales', module: 'module.customers' },
  { id: 'byMethod', group: 'sales' },
  { id: 'byCashier', group: 'sales' },
  { id: 'stockOnHand', group: 'inventory', module: 'module.inventory' },
  { id: 'lowStock', group: 'inventory', module: 'module.inventory' },
  { id: 'movements', group: 'inventory', module: 'module.inventory' },
  { id: 'profit', group: 'finance', profit: true },
  { id: 'purchases', group: 'finance', module: 'module.purchases' },
  { id: 'expenses', group: 'finance', module: 'module.expenses' },
];

function useAvailable(): ReportDef[] {
  const s = useSettings();
  const can = useCan();
  return REPORTS.filter((r) => (!r.module || s[r.module]) && (!r.profit || can('reports.profit')));
}

export function Reports() {
  const t = useT();
  const list = useAvailable();
  return (
    <div className="page">
      <PageHead title={t('reports.title')} />
      <div className="report-index">
        {(['sales', 'inventory', 'finance'] as const).map((g) => {
          const items = list.filter((r) => r.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="panel">
              <div className="panel-head">
                <h2>{t(`reports.group.${g}`)}</h2>
              </div>
              {items.map((r) => (
                <Link key={r.id} to={`/reports/${r.id}`} className="report-link">
                  {t(`reports.${r.id}` as MessageKey)}
                  <span>{t(`reports.${r.id}.desc` as MessageKey)}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReportView() {
  const t = useT();
  const { id } = useParams();
  const def = useAvailable().find((r) => r.id === id);
  if (!def) {
    return (
      <div className="page">
        <Back />
        <Empty>{t('reports.locked')}</Empty>
      </div>
    );
  }
  const body: Record<string, ReactNode> = {
    salesSummary: <SalesSummary />,
    calendar: <Calendar />,
    byProduct: <ByProduct />,
    byCategory: <Grouped by="category" />,
    byCustomer: <Grouped by="customer" />,
    byMethod: <Grouped by="method" />,
    byCashier: <Grouped by="cashier" />,
    stockOnHand: <StockOnHand lowOnly={false} />,
    lowStock: <StockOnHand lowOnly />,
    movements: <Movements />,
    profit: <Profit />,
    purchases: <PurchasesReport />,
    expenses: <ExpensesReport />,
  };
  return (
    <div className="page">
      <Back />
      <PageHead title={t(`reports.${def.id}` as MessageKey)} />
      {body[def.id]}
    </div>
  );
}

function Back() {
  const t = useT();
  return (
    <Link to="/reports" className="btn ghost sm" style={{ textDecoration: 'none', marginLeft: -10, marginBottom: 8 }}>
      <ChevronLeft size={16} />
      {t('reports.title')}
    </Link>
  );
}

// ---------- table plumbing ----------

type Kind = 'text' | 'money' | 'qty' | 'pct' | 'int';
interface Col {
  label: string;
  kind: Kind;
}
type Row = (string | number)[];

function fmt(v: string | number, kind: Kind, f: Formatters): string {
  if (typeof v === 'string') return v;
  switch (kind) {
    case 'money':
      return f.num(v);
    case 'qty':
    case 'int':
      return f.qty(v);
    case 'pct':
      return `${Math.round(v * 10) / 10}%`;
    default:
      return String(v);
  }
}

function csvValue(v: string | number, kind: Kind, decimals: number): string | number {
  if (typeof v === 'number' && kind === 'money') return v / 10 ** decimals;
  return v;
}

function ReportTable(props: { name: string; cols: Col[]; rows: Row[]; foot?: Row; meter?: number; filters?: ReactNode }) {
  const t = useT();
  const f = useFormat();
  const max = props.meter !== undefined ? Math.max(1, ...props.rows.map((r) => Number(r[props.meter!]) || 0)) : 1;
  function exportCsv() {
    const all = [props.cols.map((c) => c.label), ...props.rows.map((r) => r.map((v, i) => csvValue(v, props.cols[i].kind, f.decimals)))];
    if (props.foot) all.push(props.foot.map((v, i) => csvValue(v, props.cols[i].kind, f.decimals)));
    download(`${props.name}-${dayKey()}.csv`, toCsv(all), 'text/csv;charset=utf-8');
  }
  return (
    <>
      <div className="filters">
        {props.filters}
        <span className="grow" />
        <button className="btn" onClick={exportCsv} disabled={!props.rows.length}>
          <Download size={16} />
          {t('common.exportCsv')}
        </button>
      </div>
      <div className="panel">
        {props.rows.length === 0 ? (
          <Empty>{t('reports.noData')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {props.cols.map((c, i) => (
                    <th key={i} className={c.kind !== 'text' ? 'num' : undefined}>
                      {c.label}
                    </th>
                  ))}
                  {props.meter !== undefined && <th style={{ width: '18%' }} />}
                </tr>
              </thead>
              <tbody>
                {props.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((v, i) => (
                      <td key={i} className={props.cols[i].kind !== 'text' ? 'num' : undefined}>
                        {fmt(v, props.cols[i].kind, f)}
                      </td>
                    ))}
                    {props.meter !== undefined && (
                      <td>
                        <div className="meter">
                          <i style={{ width: `${((Number(r[props.meter]) || 0) / max) * 100}%` }} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {props.foot && (
                <tfoot>
                  <tr>
                    {props.foot.map((v, i) => (
                      <td key={i} className={props.cols[i].kind !== 'text' ? 'num' : undefined}>
                        {fmt(v, props.cols[i].kind, f)}
                      </td>
                    ))}
                    {props.meter !== undefined && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function useSales(from: number, to: number): Sale[] | undefined {
  return useLiveQuery(
    () =>
      db.sales
        .where('createdAt')
        .between(from, to, true, true)
        .toArray()
        .then((r) => r.filter((x) => x.status === 'completed')),
    [from, to],
  );
}

const netOf = (s: Sale) => s.total - s.tax;

// ---------- sales reports ----------

function SalesSummary() {
  const t = useT();
  const f = useFormat();
  const range = useRange('thisMonth');
  const [by, setBy] = useState<'day' | 'month'>('day');
  const sales = useSales(range.range.from, range.range.to);
  const groups = groupBy(sales ?? [], (s) => (by === 'day' ? dayKey(s.createdAt) : monthKey(s.createdAt)));
  const keys = [...groups.keys()].sort().reverse();
  const rows: Row[] = keys.map((k) => {
    const g = groups.get(k)!;
    const label = by === 'day' ? f.date(parseDayKey(k)) : k;
    const total = g.reduce((a, s) => a + s.total, 0);
    const disc = g.reduce((a, s) => a + s.lineDiscount + s.orderDiscount, 0);
    return [label, g.length, disc, total];
  });
  const sum = (i: number) => rows.reduce((a, r) => a + (r[i] as number), 0);
  return (
    <ReportTable
      name="sales-summary"
      cols={[
        { label: by === 'day' ? t('reports.day') : t('reports.month'), kind: 'text' },
        { label: t('reports.vouchers'), kind: 'int' },
        { label: t('reports.discounts'), kind: 'money' },
        { label: t('reports.revenue'), kind: 'money' },
      ]}
      rows={rows}
      foot={rows.length ? [t('reports.totalRow'), sum(1), sum(2), sum(3)] : undefined}
      meter={3}
      filters={
        <>
          <RangePicker {...range} />
          <Seg
            value={by}
            onChange={setBy}
            label={t('reports.groupBy')}
            options={[
              { value: 'day', label: t('reports.day') },
              { value: 'month', label: t('reports.month') },
            ]}
          />
        </>
      }
    />
  );
}

function Calendar() {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const start = new Date(month);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime() - 1;
  const sales = useSales(month, end);
  const byDay = groupBy(sales ?? [], (x) => dayKey(x.createdAt));
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const lead = (start.getDay() + 6) % 7; // Monday first
  const max = Math.max(1, ...[...byDay.values()].map((g) => g.reduce((a, x) => a + x.total, 0)));
  const total = (sales ?? []).reduce((a, x) => a + x.total, 0);
  const lang = s['locale.language'];
  const dows = Array.from({ length: 7 }, (_, i) => weekdayName(new Date(2024, 0, 1 + i).getTime(), lang));
  const shift = (n: number) => setMonth(new Date(start.getFullYear(), start.getMonth() + n, 1).getTime());

  return (
    <>
      <div className="filters">
        <button className="btn icon" onClick={() => shift(-1)} aria-label={t('reports.month.prev')}>
          <ChevronLeft size={18} />
        </button>
        <strong style={{ minWidth: 150, textAlign: 'center' }}>{monthTitle(month, lang, f.digits)}</strong>
        <button className="btn icon" onClick={() => shift(1)} aria-label={t('reports.month.next')}>
          <ChevronRight size={18} />
        </button>
        <span className="grow" />
        <span className="soft">
          {t('common.total')} <strong className="num">{f.money(total)}</strong>
        </span>
      </div>
      <div className="panel panel-pad">
        <div className="cal">
          {dows.map((d) => (
            <div key={d} className="dow">
              {d}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`b${i}`} className="day blank" />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const ts = new Date(start.getFullYear(), start.getMonth(), i + 1).getTime();
            const v = (byDay.get(dayKey(ts)) ?? []).reduce((a, x) => a + x.total, 0);
            const strength = v / max;
            return (
              <div
                key={i}
                className="day"
                title={f.money(v)}
                style={v ? { background: `color-mix(in srgb, var(--accent) ${Math.round(8 + strength * 40)}%, var(--surface))` } : undefined}
              >
                <span className="d">{f.qty(i + 1)}</span>
                <span className="v">{v ? f.num(v) : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ByProduct() {
  const t = useT();
  const can = useCan();
  const range = useRange('thisMonth');
  const [by, setBy] = useState<'amount' | 'qty'>('amount');
  const sales = useSales(range.range.from, range.range.to);
  const map = new Map<string, { name: string; qty: number; amount: number; cost: number }>();
  for (const s of sales ?? []) {
    for (const l of s.lines) {
      const cur = map.get(l.productId) ?? { name: l.name, qty: 0, amount: 0, cost: 0 };
      cur.qty += l.qty;
      cur.amount += Math.round(l.qty * l.price) - l.discount;
      cur.cost += Math.round(l.qty * l.cost);
      map.set(l.productId, cur);
    }
  }
  const showProfit = can('reports.profit');
  const items = [...map.values()].sort((a, b) => (by === 'qty' ? b.qty - a.qty : b.amount - a.amount));
  const rows: Row[] = items.map((x) => (showProfit ? [x.name, x.qty, x.amount, x.amount - x.cost] : [x.name, x.qty, x.amount]));
  const cols: Col[] = [
    { label: t('common.product'), kind: 'text' },
    { label: t('common.qty'), kind: 'qty' },
    { label: t('reports.revenue'), kind: 'money' },
    ...(showProfit ? [{ label: t('reports.grossProfit'), kind: 'money' as const }] : []),
  ];
  const sum = (i: number) => rows.reduce((a, r) => a + (r[i] as number), 0);
  return (
    <ReportTable
      name="sales-by-product"
      cols={cols}
      rows={rows}
      foot={rows.length ? [t('reports.totalRow'), ...cols.slice(1).map((_, i) => sum(i + 1))] : undefined}
      meter={by === 'qty' ? 1 : 2}
      filters={
        <>
          <RangePicker {...range} />
          <Seg
            value={by}
            onChange={setBy}
            options={[
              { value: 'amount', label: t('reports.byAmount') },
              { value: 'qty', label: t('reports.byQty') },
            ]}
          />
        </>
      }
    />
  );
}

function Grouped({ by }: { by: 'category' | 'customer' | 'method' | 'cashier' }) {
  const t = useT();
  const range = useRange('thisMonth');
  const sales = useSales(range.range.from, range.range.to);
  const lookups = useLiveQuery(async () => {
    const [cats, products, customers, methods, users] = await Promise.all([
      db.categories.toArray(),
      db.products.toArray(),
      db.customers.toArray(),
      db.paymentMethods.toArray(),
      db.users.toArray(),
    ]);
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    return {
      productCat: new Map(products.map((p) => [p.id, p.categoryId ? catName.get(p.categoryId) ?? '' : ''])),
      customers: new Map(customers.map((c) => [c.id, c.name])),
      methods: new Map(methods.map((c) => [c.id, c.name])),
      cashIds: new Set(methods.filter((m) => m.kind === 'cash').map((m) => m.id)),
      users: new Map(users.map((c) => [c.id, c.name])),
    };
  }, []);
  if (!lookups) return null;

  const acc = new Map<string, { count: number; amount: number }>();
  const add = (k: string, amount: number, count = 1) => {
    const c = acc.get(k) ?? { count: 0, amount: 0 };
    acc.set(k, { count: c.count + count, amount: c.amount + amount });
  };
  for (const s of sales ?? []) {
    if (by === 'category') {
      const seen = new Set<string>();
      for (const l of s.lines) {
        const k = lookups.productCat.get(l.productId) || t('catalog.uncategorized');
        add(k, Math.round(l.qty * l.price) - l.discount, seen.has(k) ? 0 : 1);
        seen.add(k);
      }
    } else if (by === 'customer') {
      add(s.customerId ? lookups.customers.get(s.customerId) ?? t('common.unknown') : t('sell.walkIn'), s.total);
    } else if (by === 'cashier') {
      add(lookups.users.get(s.userId) ?? t('common.unknown'), s.total);
    } else {
      for (const tn of s.tenders) add(lookups.methods.get(tn.methodId) ?? t('common.unknown'), tn.amount);
      if (s.change > 0) {
        const cash = s.tenders.find((x) => lookups.cashIds.has(x.methodId)) ?? s.tenders[0];
        if (cash) add(lookups.methods.get(cash.methodId) ?? '', -s.change, 0);
      }
      if (s.due > 0) add(t('sell.due'), s.due);
    }
  }
  const grand = [...acc.values()].reduce((a, v) => a + v.amount, 0);
  const rows: Row[] = [...acc.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([k, v]) => [k, v.count, v.amount, grand ? (v.amount / grand) * 100 : 0]);
  const label: Record<typeof by, MessageKey> = {
    category: 'catalog.category',
    customer: 'sell.customer',
    method: 'common.method',
    cashier: 'vouchers.cashier',
  };
  return (
    <ReportTable
      name={`sales-by-${by}`}
      cols={[
        { label: t(label[by]), kind: 'text' },
        { label: t('reports.vouchers'), kind: 'int' },
        { label: t('common.amount'), kind: 'money' },
        { label: t('reports.share'), kind: 'pct' },
      ]}
      rows={rows}
      foot={rows.length ? [t('reports.totalRow'), rows.reduce((a, r) => a + (r[1] as number), 0), grand, 100] : undefined}
      meter={2}
      filters={<RangePicker {...range} />}
    />
  );
}

// ---------- stock ----------

function StockOnHand({ lowOnly }: { lowOnly: boolean }) {
  const t = useT();
  const can = useCan();
  const data = useLiveQuery(async () => {
    const [products, stock, cats] = await Promise.all([db.products.orderBy('name').toArray(), db.stock.toArray(), db.categories.toArray()]);
    const qty = new Map<string, number>();
    for (const r of stock) qty.set(r.productId, (qty.get(r.productId) ?? 0) + r.qty);
    return { products: products.filter((p) => p.trackStock), qty, cats: new Map(cats.map((c) => [c.id, c.name])) };
  }, []);
  if (!data) return null;
  const showCost = can('reports.profit');
  const items = data.products
    .map((p) => ({ p, q: data.qty.get(p.id) ?? 0 }))
    .filter(({ p, q }) => !lowOnly || q <= p.reorderLevel)
    .sort((a, b) => (lowOnly ? a.q - b.q : 0));
  const rows: Row[] = items.map(({ p, q }) =>
    lowOnly
      ? [p.name, p.categoryId ? data.cats.get(p.categoryId) ?? '' : '', q, p.reorderLevel]
      : [
          p.name,
          p.categoryId ? data.cats.get(p.categoryId) ?? '' : '',
          q,
          ...(showCost ? [Math.round(Math.max(0, q) * p.cost)] : []),
          Math.round(Math.max(0, q) * p.price),
        ],
  );
  const cols: Col[] = lowOnly
    ? [
        { label: t('common.product'), kind: 'text' },
        { label: t('catalog.category'), kind: 'text' },
        { label: t('inventory.onHand'), kind: 'qty' },
        { label: t('inventory.reorderAt'), kind: 'qty' },
      ]
    : [
        { label: t('common.product'), kind: 'text' },
        { label: t('catalog.category'), kind: 'text' },
        { label: t('inventory.onHand'), kind: 'qty' },
        ...(showCost ? [{ label: t('inventory.valueCost'), kind: 'money' as const }] : []),
        { label: t('inventory.valueSale'), kind: 'money' },
      ];
  const sum = (i: number) => rows.reduce((a, r) => a + (r[i] as number), 0);
  const foot: Row | undefined =
    !lowOnly && rows.length ? [t('reports.totalRow'), '', sum(2), ...cols.slice(3).map((_, i) => sum(i + 3))] : undefined;
  return <ReportTable name={lowOnly ? 'low-stock' : 'stock-on-hand'} cols={cols} rows={rows} foot={foot} />;
}

// ---------- finance ----------

function Profit() {
  const t = useT();
  const f = useFormat();
  const range = useRange('thisMonth');
  const sales = useSales(range.range.from, range.range.to);
  const expenses = useLiveQuery(
    () => db.expenses.where('date').between(dayKey(range.range.from), dayKey(range.range.to), true, true).toArray(),
    [range.range.from, range.range.to],
  );
  const s = useSettings();
  if (!sales || !expenses) return null;
  const gross = sales.reduce((a, x) => a + x.subtotal, 0);
  const discounts = sales.reduce((a, x) => a + x.lineDiscount + x.orderDiscount, 0);
  const net = sales.reduce((a, x) => a + netOf(x), 0);
  const cogs = sales.reduce((a, x) => a + x.cogs, 0);
  const grossProfit = net - cogs;
  const exp = s['module.expenses'] ? expenses.reduce((a, x) => a + x.amount, 0) : 0;
  const netProfit = grossProfit - exp;
  const pct = (v: number) => (net ? `${Math.round((v / net) * 1000) / 10}%` : '—');
  const line = (label: string, v: number, extra?: string, cls = '') => (
    <div className={`list-row ${cls}`}>
      <span className="grow">{label}</span>
      {extra && <span className="muted small" style={{ marginRight: 12 }}>{extra}</span>}
      <span>{f.money(v)}</span>
    </div>
  );
  function exportCsv() {
    const d = 10 ** f.decimals;
    download(
      `profit-${dayKey()}.csv`,
      toCsv([
        [t('reports.period'), `${dayKey(range.range.from)} – ${dayKey(range.range.to)}`],
        [t('reports.revenue'), gross / d],
        [t('reports.discounts'), -discounts / d],
        [t('reports.netSales'), net / d],
        [t('reports.cogs'), -cogs / d],
        [t('reports.grossProfit'), grossProfit / d],
        [t('reports.expenseTotal'), -exp / d],
        [t('reports.netProfit'), netProfit / d],
      ]),
      'text/csv;charset=utf-8',
    );
  }
  return (
    <>
      <div className="filters">
        <RangePicker {...range} />
        <span className="grow" />
        <button className="btn" onClick={exportCsv}>
          <Download size={16} />
          {t('common.exportCsv')}
        </button>
      </div>
      <div className="panel pl">
        {line(t('reports.revenue'), gross, t('reports.vouchers') + ' ' + f.qty(sales.length))}
        {line(t('reports.discounts'), -discounts)}
        {net - (gross - discounts) !== 0 && line(`${t('sell.tax')} / ${t('sell.rounding')}`, net - (gross - discounts))}
        {line(t('reports.netSales'), net)}
        {line(t('reports.cogs'), -cogs)}
        {line(t('reports.grossProfit'), grossProfit, pct(grossProfit), 'total')}
        {s['module.expenses'] && line(t('reports.expenseTotal'), -exp)}
        {s['module.expenses'] && line(t('reports.netProfit'), netProfit, pct(netProfit), 'total')}
      </div>
    </>
  );
}

function PurchasesReport() {
  const t = useT();
  const range = useRange('thisYear');
  const data = useLiveQuery(async () => {
    const rows = await db.purchases.where('createdAt').between(range.range.from, range.range.to, true, true).toArray();
    const suppliers = new Map((await db.suppliers.toArray()).map((x) => [x.id, x.name]));
    return { rows, suppliers };
  }, [range.range.from, range.range.to]);
  const [by, setBy] = useState<'month' | 'supplier'>('month');
  const g = groupBy(data?.rows ?? [], (p) =>
    by === 'month' ? monthKey(p.createdAt) : p.supplierId ? data?.suppliers.get(p.supplierId) ?? t('common.unknown') : t('purchases.noSupplier'),
  );
  const rows: Row[] = [...g.entries()]
    .sort((a, b) => (by === 'month' ? b[0].localeCompare(a[0]) : 0))
    .map(([k, v]) => [k, v.length, v.reduce((a, p) => a + p.paid, 0), v.reduce((a, p) => a + p.due, 0), v.reduce((a, p) => a + p.total, 0)]);
  if (by === 'supplier') rows.sort((a, b) => (b[4] as number) - (a[4] as number));
  const sum = (i: number) => rows.reduce((a, r) => a + (r[i] as number), 0);
  return (
    <ReportTable
      name="purchases"
      cols={[
        { label: by === 'month' ? t('reports.month') : t('purchases.supplier'), kind: 'text' },
        { label: t('purchases.number'), kind: 'int' },
        { label: t('purchases.paid'), kind: 'money' },
        { label: t('purchases.due'), kind: 'money' },
        { label: t('common.total'), kind: 'money' },
      ]}
      rows={rows}
      foot={rows.length ? [t('reports.totalRow'), sum(1), sum(2), sum(3), sum(4)] : undefined}
      meter={4}
      filters={
        <>
          <RangePicker {...range} />
          <Seg
            value={by}
            onChange={setBy}
            options={[
              { value: 'month', label: t('reports.month') },
              { value: 'supplier', label: t('purchases.supplier') },
            ]}
          />
        </>
      }
    />
  );
}

function ExpensesReport() {
  const t = useT();
  const range = useRange('thisMonth');
  const data = useLiveQuery(async () => {
    const rows = await db.expenses.where('date').between(dayKey(range.range.from), dayKey(range.range.to), true, true).toArray();
    const cats = new Map((await db.expenseCategories.toArray()).map((c) => [c.id, c.name]));
    return { rows, cats };
  }, [range.range.from, range.range.to]);
  const g = groupBy(data?.rows ?? [], (e) => (e.categoryId ? data?.cats.get(e.categoryId) ?? t('common.unknown') : t('common.unknown')));
  const grand = (data?.rows ?? []).reduce((a, e) => a + e.amount, 0);
  const rows: Row[] = [...g.entries()]
    .map(([k, v]) => {
      const amt = v.reduce((a, e) => a + e.amount, 0);
      return [k, v.length, amt, grand ? (amt / grand) * 100 : 0] as Row;
    })
    .sort((a, b) => (b[2] as number) - (a[2] as number));
  return (
    <ReportTable
      name="expenses"
      cols={[
        { label: t('expenses.category'), kind: 'text' },
        { label: t('common.count'), kind: 'int' },
        { label: t('common.amount'), kind: 'money' },
        { label: t('reports.share'), kind: 'pct' },
      ]}
      rows={rows}
      foot={rows.length ? [t('reports.totalRow'), rows.reduce((a, r) => a + (r[1] as number), 0), grand, 100] : undefined}
      meter={2}
      filters={<RangePicker {...range} />}
    />
  );
}

