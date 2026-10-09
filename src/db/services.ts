// Business operations. Each one runs in a single IndexedDB transaction so the
// voucher, the stock ledger and the cached balances can never disagree.

import { db, DEFAULT_LOCATION_ID } from './db';
import type {
  Contact,
  ID,
  MoveType,
  PartyType,
  Product,
  Purchase,
  PurchaseLine,
  Role,
  Sale,
  SaleLine,
  StockMove,
  Tender,
  User,
} from './types';
import type { SettingsValues } from '../config/registry';
import { computeTotals, settle, weightedAverageCost, type PricingRules } from '../lib/cart';
import { formatDocNumber, periodKey } from '../lib/dates';
import { hashPin, randomSalt, uid } from '../lib/util';

export class PosError extends Error {
  constructor(
    public code: string,
    public params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

// ---------- helpers ----------

export function pricingRules(s: SettingsValues): PricingRules {
  const decimals = Number(s['currency.decimals']);
  const step = s['sales.rounding'] === 'none' ? 0 : Number(s['sales.rounding']) * 10 ** decimals;
  return {
    taxMode: s['tax.mode'] as PricingRules['taxMode'],
    taxRate: s['tax.rate'],
    roundingStep: step,
    roundingMode: s['sales.roundingMode'] as PricingRules['roundingMode'],
  };
}

async function nextNumber(kind: 'sale' | 'purchase', s: SettingsValues, at: number): Promise<string> {
  const period = periodKey(s['numbering.reset'], at);
  const key = kind;
  const row = await db.counters.get(key);
  const value = row && row.period === period ? row.value + 1 : 1;
  await db.counters.put({ key, period, value });
  const prefix = kind === 'sale' ? s['numbering.salePrefix'] : s['numbering.purchasePrefix'];
  return formatDocNumber(prefix, s['numbering.deviceCode'], period, value, s['numbering.padding']);
}

function stockId(productId: ID, locationId: ID) {
  return `${productId}|${locationId}`;
}

async function onHandAt(productId: ID, locationId: ID): Promise<number> {
  return (await db.stock.get(stockId(productId, locationId)))?.qty ?? 0;
}

export async function onHandTotal(productId: ID): Promise<number> {
  const rows = await db.stock.where('productId').equals(productId).toArray();
  return rows.reduce((s, r) => s + r.qty, 0);
}

async function move(m: Omit<StockMove, 'id'>): Promise<void> {
  await db.stockMoves.add({ ...m, id: uid() });
  const id = stockId(m.productId, m.locationId);
  const cur = await db.stock.get(id);
  const qty = Math.round(((cur?.qty ?? 0) + m.qty) * 1000) / 1000;
  await db.stock.put({ id, productId: m.productId, locationId: m.locationId, qty });
}

async function audit(userId: ID, action: string, detail: string, at = Date.now()) {
  await db.audit.add({ id: uid(), at, userId, action, detail });
}

// ---------- users ----------

export async function createUser(name: string, role: Role, pin: string): Promise<User> {
  if (!/^\d{4,6}$/.test(pin)) throw new PosError('err.pinFormat');
  const salt = randomSalt();
  const user: User = {
    id: uid(),
    name: name.trim(),
    role,
    salt,
    pinHash: await hashPin(pin, salt),
    pinLength: pin.length,
    active: true,
    createdAt: Date.now(),
  };
  await db.users.add(user);
  return user;
}

export async function verifyPin(user: User, pin: string): Promise<boolean> {
  return (await hashPin(pin, user.salt)) === user.pinHash;
}

export async function changePin(userId: ID, pin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) throw new PosError('err.pinFormat');
  const salt = randomSalt();
  await db.users.update(userId, { salt, pinHash: await hashPin(pin, salt), pinLength: pin.length });
}

export async function setUserActive(userId: ID, active: boolean): Promise<void> {
  const u = await db.users.get(userId);
  if (!u) return;
  if (!active && u.role === 'owner') {
    const owners = (await db.users.where('role').equals('owner').toArray()).filter((x) => x.active);
    if (owners.length <= 1) throw new PosError('err.lastOwner');
  }
  await db.users.update(userId, { active });
}

// ---------- selling ----------

export interface DraftLine {
  productId: ID;
  name: string;
  qty: number;
  price: number;
  discount: number;
}

export interface SaleDraft {
  lines: DraftLine[];
  orderDiscount: number;
  customerId: ID | null;
  tableId: ID | null;
  tenders: Tender[];
  note: string;
  /** When completing a held voucher, its id (so it is replaced, not duplicated). */
  heldId?: ID;
}

export interface CompleteOptions {
  user: User;
  settings: SettingsValues;
  at?: number;
  locationId?: ID;
}

export async function completeSale(draft: SaleDraft, opts: CompleteOptions): Promise<Sale> {
  const { user, settings: s } = opts;
  const at = opts.at ?? Date.now();
  const locationId = opts.locationId ?? DEFAULT_LOCATION_ID;
  if (draft.lines.length === 0) throw new PosError('err.emptyCart');

  return db.transaction(
    'rw',
    [db.sales, db.products, db.stock, db.stockMoves, db.counters, db.audit, db.paymentMethods, db.customers, db.settlements],
    async () => {
      const totals = computeTotals(draft.lines, draft.orderDiscount, pricingRules(s));
      const methods = await db.paymentMethods.toArray();
      const cashIds = new Set(methods.filter((m) => m.kind === 'cash').map((m) => m.id));
      const tenders = draft.tenders.filter((t) => t.amount > 0);
      const st = settle(
        totals.total,
        tenders.map((t) => ({ amount: t.amount, isCash: cashIds.has(t.methodId) })),
      );
      if (st.overpaidNonCash) throw new PosError('err.nonCashOverpay');

      if (st.due > 0) {
        if (!s['module.customerCredit']) throw new PosError('err.notPaidInFull');
        if (s['sales.requireCustomerForCredit'] && !draft.customerId) throw new PosError('err.creditNeedsCustomer');
        if (draft.customerId) {
          const c = await db.customers.get(draft.customerId);
          if (c && c.creditLimit > 0) {
            const bal = await customerBalance(c.id);
            if (bal + st.due > c.creditLimit) throw new PosError('err.creditLimit', { name: c.name });
          }
        }
      }

      const inventoryOn = s['module.inventory'];
      const lines: SaleLine[] = [];
      let cogs = 0;
      for (const l of draft.lines) {
        const p = await db.products.get(l.productId);
        const cost = p?.cost ?? 0;
        lines.push({ ...l, cost });
        cogs += Math.round(cost * l.qty);
        if (inventoryOn && p?.trackStock && !s['sales.allowNegativeStock']) {
          const have = await onHandAt(p.id, locationId);
          const wanted = draft.lines.filter((x) => x.productId === p.id).reduce((a, x) => a + x.qty, 0);
          if (wanted > have) throw new PosError('err.insufficientStock', { name: p.name, qty: have });
        }
      }

      const id = draft.heldId ?? uid();
      const sale: Sale = {
        id,
        number: await nextNumber('sale', s, at),
        createdAt: at,
        userId: user.id,
        customerId: draft.customerId,
        tableId: draft.tableId,
        locationId,
        status: 'completed',
        lines,
        subtotal: totals.subtotal,
        lineDiscount: totals.lineDiscount,
        orderDiscount: totals.orderDiscount,
        tax: totals.tax,
        rounding: totals.rounding,
        total: totals.total,
        paid: st.paid,
        change: st.change,
        due: st.due,
        tenders,
        cogs,
        note: draft.note,
      };
      await db.sales.put(sale);

      if (inventoryOn) {
        for (const l of lines) {
          const p = await db.products.get(l.productId);
          if (!p?.trackStock) continue;
          await move({
            createdAt: at,
            productId: l.productId,
            locationId,
            qty: -l.qty,
            type: 'sale',
            unitCost: l.cost,
            refId: id,
            note: sale.number,
            userId: user.id,
          });
        }
      }
      return sale;
    },
  );
}

export async function holdSale(draft: SaleDraft, user: User): Promise<Sale> {
  if (draft.lines.length === 0) throw new PosError('err.emptyCart');
  const now = Date.now();
  const sale: Sale = {
    id: draft.heldId ?? uid(),
    number: '',
    createdAt: now,
    userId: user.id,
    customerId: draft.customerId,
    tableId: draft.tableId,
    locationId: DEFAULT_LOCATION_ID,
    status: 'held',
    lines: draft.lines.map((l) => ({ ...l, cost: 0 })),
    subtotal: 0,
    lineDiscount: 0,
    orderDiscount: draft.orderDiscount,
    tax: 0,
    rounding: 0,
    total: 0,
    paid: 0,
    change: 0,
    due: 0,
    tenders: [],
    cogs: 0,
    note: draft.note,
  };
  await db.sales.put(sale);
  return sale;
}

export async function deleteHeld(id: ID): Promise<void> {
  const s = await db.sales.get(id);
  if (s?.status === 'held') await db.sales.delete(id);
}

export async function voidSale(id: ID, user: User, reason: string): Promise<void> {
  await db.transaction('rw', [db.sales, db.stock, db.stockMoves, db.audit], async () => {
    const sale = await db.sales.get(id);
    if (!sale || sale.status !== 'completed') throw new PosError('err.cannotVoid');
    const moves = await db.stockMoves.where('refId').equals(id).toArray();
    const at = Date.now();
    for (const m of moves.filter((x) => x.type === 'sale')) {
      await move({
        createdAt: at,
        productId: m.productId,
        locationId: m.locationId,
        qty: -m.qty,
        type: 'void',
        unitCost: m.unitCost,
        refId: id,
        note: sale.number,
        userId: user.id,
      });
    }
    await db.sales.update(id, { status: 'void', voidedAt: at, voidedBy: user.id, voidReason: reason });
    await audit(user.id, 'sale.void', `${sale.number}: ${reason}`, at);
  });
}

// ---------- purchasing ----------

export interface PurchaseDraft {
  supplierId: ID | null;
  lines: PurchaseLine[];
  paid: number;
  methodId: ID | null;
  note: string;
  locationId?: ID;
}

export async function savePurchase(draft: PurchaseDraft, user: User, s: SettingsValues, at = Date.now()): Promise<Purchase> {
  const lines = draft.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) throw new PosError('err.emptyPurchase');
  const total = lines.reduce((a, l) => a + Math.round(l.qty * l.cost), 0);
  const paid = Math.min(Math.max(0, draft.paid), total);
  if (paid < total && !s['module.supplierCredit']) throw new PosError('err.notPaidInFull');
  const locationId = draft.locationId ?? DEFAULT_LOCATION_ID;

  return db.transaction('rw', [db.purchases, db.products, db.stock, db.stockMoves, db.counters], async () => {
    const id = uid();
    const p: Purchase = {
      id,
      number: await nextNumber('purchase', s, at),
      createdAt: at,
      userId: user.id,
      supplierId: draft.supplierId,
      locationId,
      lines,
      total,
      paid,
      due: total - paid,
      methodId: draft.methodId,
      note: draft.note,
    };
    await db.purchases.add(p);
    for (const l of lines) {
      const prod = await db.products.get(l.productId);
      if (!prod) continue;
      const onHand = await onHandTotal(prod.id);
      const cost =
        s['inventory.costing'] === 'last' ? l.cost : weightedAverageCost(onHand, prod.cost, l.qty, l.cost);
      await db.products.update(prod.id, { cost });
      if (prod.trackStock && s['module.inventory']) {
        await move({
          createdAt: at,
          productId: prod.id,
          locationId,
          qty: l.qty,
          type: 'purchase',
          unitCost: l.cost,
          refId: id,
          note: p.number,
          userId: user.id,
        });
      }
    }
    return p;
  });
}

// ---------- inventory ----------

/** Set a product's counted quantity at a location; records the difference. */
export async function adjustStock(
  productId: ID,
  locationId: ID,
  counted: number,
  note: string,
  user: User,
): Promise<number> {
  return db.transaction('rw', [db.stock, db.stockMoves, db.products], async () => {
    const have = await onHandAt(productId, locationId);
    const diff = Math.round((counted - have) * 1000) / 1000;
    if (diff === 0) return 0;
    const p = await db.products.get(productId);
    await move({
      createdAt: Date.now(),
      productId,
      locationId,
      qty: diff,
      type: 'adjust',
      unitCost: p?.cost ?? 0,
      refId: null,
      note,
      userId: user.id,
    });
    return diff;
  });
}

export async function transferStock(
  productId: ID,
  from: ID,
  to: ID,
  qty: number,
  note: string,
  user: User,
  allowNegative: boolean,
): Promise<void> {
  if (from === to) throw new PosError('err.sameLocation');
  if (!(qty > 0)) throw new PosError('err.qtyPositive');
  await db.transaction('rw', [db.stock, db.stockMoves, db.products], async () => {
    const have = await onHandAt(productId, from);
    const p = await db.products.get(productId);
    if (!allowNegative && qty > have) throw new PosError('err.insufficientStock', { name: p?.name ?? '', qty: have });
    const ref = uid();
    const at = Date.now();
    const base = { createdAt: at, productId, unitCost: p?.cost ?? 0, refId: ref, note, userId: user.id };
    await move({ ...base, locationId: from, qty: -qty, type: 'transfer_out' as MoveType });
    await move({ ...base, locationId: to, qty, type: 'transfer_in' as MoveType });
  });
}

export async function setOpeningStock(product: Product, qty: number, user: User, at = Date.now()): Promise<void> {
  if (!qty) return;
  await db.transaction('rw', [db.stock, db.stockMoves], async () => {
    await move({
      createdAt: at,
      productId: product.id,
      locationId: DEFAULT_LOCATION_ID,
      qty,
      type: 'opening',
      unitCost: product.cost,
      refId: null,
      note: '',
      userId: user.id,
    });
  });
}

// ---------- credit ----------

export async function customerBalance(customerId: ID): Promise<number> {
  const sales = await db.sales.where('customerId').equals(customerId).toArray();
  const owed = sales.filter((x) => x.status === 'completed').reduce((a, x) => a + x.due, 0);
  const paid = (await db.settlements.where('partyId').equals(customerId).toArray())
    .filter((x) => x.partyType === 'customer')
    .reduce((a, x) => a + x.amount, 0);
  return owed - paid;
}

export async function supplierBalance(supplierId: ID): Promise<number> {
  const ps = await db.purchases.where('supplierId').equals(supplierId).toArray();
  const owed = ps.reduce((a, x) => a + x.due, 0);
  const paid = (await db.settlements.where('partyId').equals(supplierId).toArray())
    .filter((x) => x.partyType === 'supplier')
    .reduce((a, x) => a + x.amount, 0);
  return owed - paid;
}

export async function recordSettlement(
  partyType: PartyType,
  partyId: ID,
  amount: number,
  methodId: ID | null,
  note: string,
  user: User,
): Promise<void> {
  if (!(amount > 0)) throw new PosError('err.amountPositive');
  const bal = partyType === 'customer' ? await customerBalance(partyId) : await supplierBalance(partyId);
  if (amount > bal) throw new PosError('err.overSettle');
  await db.settlements.add({ id: uid(), createdAt: Date.now(), partyType, partyId, amount, methodId, note, userId: user.id });
}

export interface Balance {
  contact: Contact;
  owed: number;
  settled: number;
  balance: number;
  lastActivity: number;
}

export async function allBalances(partyType: PartyType): Promise<Balance[]> {
  const contacts = partyType === 'customer' ? await db.customers.toArray() : await db.suppliers.toArray();
  const settlements = (await db.settlements.where('partyType').equals(partyType).toArray());
  const owedBy = new Map<ID, { owed: number; last: number }>();
  if (partyType === 'customer') {
    for (const s of await db.sales.where('status').equals('completed').toArray()) {
      if (!s.customerId || s.due <= 0) continue;
      const cur = owedBy.get(s.customerId) ?? { owed: 0, last: 0 };
      owedBy.set(s.customerId, { owed: cur.owed + s.due, last: Math.max(cur.last, s.createdAt) });
    }
  } else {
    for (const p of await db.purchases.toArray()) {
      if (!p.supplierId || p.due <= 0) continue;
      const cur = owedBy.get(p.supplierId) ?? { owed: 0, last: 0 };
      owedBy.set(p.supplierId, { owed: cur.owed + p.due, last: Math.max(cur.last, p.createdAt) });
    }
  }
  return contacts
    .map((c) => {
      const o = owedBy.get(c.id) ?? { owed: 0, last: 0 };
      const ss = settlements.filter((x) => x.partyId === c.id);
      const settled = ss.reduce((a, x) => a + x.amount, 0);
      const last = Math.max(o.last, ...ss.map((x) => x.createdAt), 0);
      return { contact: c, owed: o.owed, settled, balance: o.owed - settled, lastActivity: last };
    })
    .filter((b) => b.owed > 0 || b.settled > 0)
    .sort((a, b) => b.balance - a.balance);
}
