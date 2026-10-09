import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { db } from '../../db/db';
import { allBalances } from '../../db/services';
import { useCan, useFormat, useSettings, useT, useUser } from '../../state/app';
import { addDays, startOfDay, dayKey, weekdayName } from '../../lib/dates';
import { Empty, PageHead } from '../../ui/kit';
import { cx } from '../../lib/util';

export function Dashboard() {
  const t = useT();
  const f = useFormat();
  const s = useSettings();
  const can = useCan();
  const user = useUser();
  const lang = s['locale.language'];
  const viewAll = can('sale.viewAll');

  const data = useLiveQuery(async () => {
    const today = startOfDay();
    const from = addDays(today, -6);
    let sales = await db.sales.where('createdAt').aboveOrEqual(addDays(today, -7)).toArray();
    if (!viewAll) sales = sales.filter((x) => x.userId === user.id);
    const done = sales.filter((x) => x.status === 'completed');
    const todays = done.filter((x) => x.createdAt >= today);
    const yesterday = done.filter((x) => x.createdAt >= addDays(today, -1) && x.createdAt < today);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      const key = dayKey(d);
      return { ts: d, total: done.filter((x) => dayKey(x.createdAt) === key).reduce((a, x) => a + x.total, 0) };
    });
    const recent = sales
      .filter((x) => x.status !== 'held')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6);
    const held = sales.filter((x) => x.status === 'held').length;

    let low: { name: string; qty: number; reorder: number }[] = [];
    if (s['module.inventory']) {
      const stock = new Map<string, number>();
      for (const r of await db.stock.toArray()) stock.set(r.productId, (stock.get(r.productId) ?? 0) + r.qty);
      low = (await db.products.toArray())
        .filter((p) => p.active && p.trackStock && (stock.get(p.id) ?? 0) <= p.reorderLevel)
        .map((p) => ({ name: p.name, qty: stock.get(p.id) ?? 0, reorder: p.reorderLevel }))
        .sort((a, b) => a.qty - b.qty);
    }
    const receivable = s['module.customerCredit'] ? (await allBalances('customer')).reduce((a, b) => a + Math.max(0, b.balance), 0) : null;
    const customers = new Map((await db.customers.toArray()).map((c) => [c.id, c.name]));

    const sum = (arr: typeof done) => arr.reduce((a, x) => a + x.total, 0);
    const profit = todays.reduce((a, x) => a + (x.total - x.tax - x.cogs), 0);
    return { todayTotal: sum(todays), count: todays.length, yesterdayTotal: sum(yesterday), profit, days, recent, held, low, receivable, customers };
  }, [viewAll, user.id, s['module.inventory'], s['module.customerCredit']]);

  if (!data) return <div className="page" />;
  const max = Math.max(1, ...data.days.map((d) => d.total));
  const weekday = (ts: number) => weekdayName(ts, lang);

  return (
    <div className="page">
      <PageHead title={t('dash.greeting', { shop: s['shop.name'] })}>
        {can('sell') && (
          <Link to="/sell" className="btn primary lg" style={{ textDecoration: 'none' }}>
            <ShoppingCart size={20} />
            {t('dash.startSale')}
          </Link>
        )}
      </PageHead>

      <div className="kpis">
        <div className="panel kpi hero">
          <div className="label">{t('dash.sales')}</div>
          <div className="value">{f.money(data.todayTotal)}</div>
          <div className="sub">{t('dash.vsYesterday', { amount: f.money(data.yesterdayTotal) })}</div>
        </div>
        <div className="panel kpi">
          <div className="label">{t('dash.vouchers')}</div>
          <div className="value">{f.qty(data.count)}</div>
          <div className="sub">{data.held ? t('dash.held', { n: data.held }) : ' '}</div>
        </div>
        <div className="panel kpi">
          <div className="label">{t('dash.avgTicket')}</div>
          <div className="value">{f.money(data.count ? Math.round(data.todayTotal / data.count) : 0)}</div>
          <div className="sub">&nbsp;</div>
        </div>
        {can('reports.profit') ? (
          <div className="panel kpi">
            <div className="label">{t('dash.grossProfit')}</div>
            <div className="value">{f.money(data.profit)}</div>
            <div className="sub">{data.todayTotal ? `${Math.round((data.profit / data.todayTotal) * 100)}%` : ' '}</div>
          </div>
        ) : data.receivable !== null ? (
          <div className="panel kpi">
            <div className="label">{t('dash.receivables')}</div>
            <div className="value">{f.money(data.receivable)}</div>
            <div className="sub">&nbsp;</div>
          </div>
        ) : null}
      </div>

      <div className="dash-grid">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h2>{t('dash.last7')}</h2>
            </div>
            <div className="panel-pad">
              <div className="bars" role="img" aria-label={t('dash.last7')}>
                {data.days.map((d, i) => (
                  <div key={d.ts} className="bar-col">
                    <span className="bar-value">{d.total ? compact(d.total, f.decimals) : ''}</span>
                    <div className={cx('bar', i === 6 && 'today')} style={{ height: `${(d.total / max) * 100}%` }} title={f.money(d.total)} />
                    <span className="bar-label">{i === 6 ? t('common.today') : weekday(d.ts)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{t('dash.recent')}</h2>
              <Link to="/vouchers" className="btn sm ghost" style={{ textDecoration: 'none' }}>
                {t('dash.viewAll')}
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <Empty>{t('dash.noSalesToday')}</Empty>
            ) : (
              data.recent.map((v) => (
                <div key={v.id} className="list-row">
                  <div className="grow">
                    <div className="num">{v.number}</div>
                    <div className="muted small">
                      {f.date(v.createdAt)} {f.time(v.createdAt)}
                      {v.customerId ? ` · ${data.customers.get(v.customerId) ?? ''}` : ''}
                    </div>
                  </div>
                  {v.status === 'void' && <span className="badge danger">{t('vouchers.status.void')}</span>}
                  {v.due > 0 && v.status === 'completed' && <span className="badge warn">{t('sell.due')}</span>}
                  <strong className="num">{f.money(v.total)}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="stack">
          {data.receivable !== null && can('reports.profit') && (
            <Link to="/credit" className="panel kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="label">{t('dash.receivables')}</div>
              <div className="value">{f.money(data.receivable)}</div>
            </Link>
          )}
          {s['module.inventory'] && (
            <div className="panel">
              <div className="panel-head">
                <h2>{t('dash.lowStock')}</h2>
                {data.low.length > 0 && <span className="badge warn">{data.low.length}</span>}
              </div>
              {data.low.length === 0 ? (
                <Empty>{t('dash.allStocked')}</Empty>
              ) : (
                data.low.slice(0, 8).map((p, i) => (
                  <div key={i} className="list-row">
                    <span className="grow">{p.name}</span>
                    <span className={cx('num', p.qty <= 0 ? 'danger-text' : 'soft')}>{f.qty(p.qty)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Short bar labels: 12,500 → 12.5K */
function compact(minor: number, decimals: number): string {
  const v = minor / 10 ** decimals;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(v));
}
