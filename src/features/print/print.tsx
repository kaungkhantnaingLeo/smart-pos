import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Sale } from '../../db/types';
import { moneyFormat, translate, useApp } from '../../state/app';
import type { SettingsValues } from '../../config/registry';
import { formatMoney, formatQty } from '../../lib/money';
import { formatDate, formatTime } from '../../lib/dates';

interface Names {
  cashier?: string;
  customer?: string;
  table?: string;
  methods: Record<string, string>;
}

export function Receipt({ sale, s, names }: { sale: Sale; s: SettingsValues; names: Names }) {
  const lang = s['locale.language'];
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const mf = moneyFormat(s);
  const m = (v: number) => formatMoney(v, { ...mf, symbol: '' });
  const digits = mf.digits;
  const header = s['print.header'].trim();
  const footer = s['print.footer'].trim();
  return (
    <div className="receipt" data-paper={s['print.paper']} lang={lang}>
      <div className="r-center">
        <div className="r-shop">{s['shop.name']}</div>
        {s['shop.address'] && <div>{s['shop.address']}</div>}
        {s['shop.phone'] && <div>{s['shop.phone']}</div>}
        {header && <div style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{header}</div>}
      </div>
      <div className="r-rule" />
      <table>
        <tbody>
          <tr>
            <td>{t('receipt.voucher')}</td>
            <td className="n">{sale.number}</td>
          </tr>
          <tr>
            <td>{t('receipt.date')}</td>
            <td className="n">
              {formatDate(sale.createdAt, s['locale.dateFormat'], digits)} {formatTime(sale.createdAt, digits)}
            </td>
          </tr>
          {s['print.showCashier'] && names.cashier && (
            <tr>
              <td>{t('receipt.cashier')}</td>
              <td className="n">{names.cashier}</td>
            </tr>
          )}
          {s['print.showCustomer'] && names.customer && (
            <tr>
              <td>{t('receipt.customer')}</td>
              <td className="n">{names.customer}</td>
            </tr>
          )}
          {names.table && (
            <tr>
              <td>{t('receipt.table')}</td>
              <td className="n">{names.table}</td>
            </tr>
          )}
        </tbody>
      </table>
      {sale.status === 'void' && <div className="r-void">{t('receipt.void')}</div>}
      <div className="r-rule" />
      <table>
        <tbody>
          {sale.lines.map((l, i) => (
            <tr key={i}>
              <td>
                {l.name}
                <div>
                  {formatQty(l.qty, digits)} × {m(l.price)}
                  {l.discount > 0 && ` (−${m(l.discount)})`}
                </div>
              </td>
              <td className="n">{m(Math.round(l.qty * l.price) - l.discount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="r-rule" />
      <table>
        <tbody>
          <tr>
            <td>{t('sell.subtotal')}</td>
            <td className="n">{m(sale.subtotal - sale.lineDiscount)}</td>
          </tr>
          {sale.orderDiscount > 0 && (
            <tr>
              <td>{t('sell.discount')}</td>
              <td className="n">−{m(sale.orderDiscount)}</td>
            </tr>
          )}
          {sale.tax > 0 && (
            <tr>
              <td>
                {s['tax.label']} {s['tax.mode'] === 'inclusive' ? `(${s['tax.rate']}%)` : `${s['tax.rate']}%`}
              </td>
              <td className="n">{m(sale.tax)}</td>
            </tr>
          )}
          {sale.rounding !== 0 && (
            <tr>
              <td>{t('sell.rounding')}</td>
              <td className="n">{m(sale.rounding)}</td>
            </tr>
          )}
          <tr className="r-total">
            <td>{t('sell.total')}</td>
            <td className="n">{formatMoney(sale.total, mf)}</td>
          </tr>
          {sale.tenders.map((tn, i) => (
            <tr key={i}>
              <td>{names.methods[tn.methodId] ?? '—'}</td>
              <td className="n">{m(tn.amount)}</td>
            </tr>
          ))}
          {sale.change > 0 && (
            <tr>
              <td>{t('sell.change')}</td>
              <td className="n">{m(sale.change)}</td>
            </tr>
          )}
          {sale.due > 0 && (
            <tr>
              <td>{t('sell.due')}</td>
              <td className="n">{m(sale.due)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {sale.note && <div style={{ marginTop: 6 }}>{sale.note}</div>}
      {footer && (
        <>
          <div className="r-rule" />
          <div className="r-center" style={{ whiteSpace: 'pre-line' }}>
            {footer}
          </div>
        </>
      )}
    </div>
  );
}

/** Look up the display names a receipt needs. */
export function useReceiptNames(sale: Sale | null | undefined): Names | undefined {
  return useLiveQuery(async () => {
    if (!sale) return undefined;
    const [cashier, customer, table, methods] = await Promise.all([
      db.users.get(sale.userId),
      sale.customerId ? db.customers.get(sale.customerId) : undefined,
      sale.tableId ? db.diningTables.get(sale.tableId) : undefined,
      db.paymentMethods.toArray(),
    ]);
    return {
      cashier: cashier?.name,
      customer: customer?.name,
      table: table?.name,
      methods: Object.fromEntries(methods.map((p) => [p.id, p.name])),
    };
  }, [sale?.id, sale?.status]);
}

// ---------- print queue ----------

const usePrint = create<{ sale: Sale | null; copies: number }>(() => ({ sale: null, copies: 1 }));

export function printSale(sale: Sale, copies?: number): void {
  usePrint.setState({ sale, copies: copies ?? useApp.getState().settings['print.copies'] });
}

/** Renders the queued receipt into #print-root and opens the browser print dialog. */
export function PrintHost() {
  const { sale, copies } = usePrint();
  const s = useApp((x) => x.settings);
  const names = useReceiptNames(sale);
  useEffect(() => {
    if (!sale || !names) return;
    const id = window.setTimeout(() => {
      window.print();
      usePrint.setState({ sale: null });
    }, 50);
    return () => window.clearTimeout(id);
  }, [sale, names]);
  const root = document.getElementById('print-root');
  if (!sale || !names || !root) return null;
  return createPortal(
    <>
      <style>{`@page { size: ${s['print.paper'] === 'a4' ? 'A4' : `${s['print.paper']}mm auto`}; margin: ${s['print.paper'] === 'a4' ? '12mm' : '2mm'}; }`}</style>
      {Array.from({ length: copies }, (_, i) => (
        <div className="r-page" key={i}>
          <Receipt sale={sale} s={s} names={names} />
        </div>
      ))}
    </>,
    root,
  );
}
