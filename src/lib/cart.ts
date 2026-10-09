// Pure pricing maths for a voucher. All money values are integer minor units.

export interface CartLineInput {
  price: number;
  qty: number;
  discount: number;
}

export interface PricingRules {
  taxMode: 'off' | 'exclusive' | 'inclusive';
  taxRate: number; // percent
  /** Rounding step in minor units; 0 = no rounding. */
  roundingStep: number;
  roundingMode: 'nearest' | 'up' | 'down';
}

export interface CartTotals {
  subtotal: number;
  lineDiscount: number;
  orderDiscount: number;
  net: number;
  tax: number;
  rounding: number;
  total: number;
}

export function lineGross(l: CartLineInput): number {
  return Math.round(l.price * l.qty);
}

export function lineNet(l: CartLineInput): number {
  return Math.max(0, lineGross(l) - l.discount);
}

export function roundTo(amount: number, step: number, mode: PricingRules['roundingMode']): number {
  if (step <= 0) return amount;
  const q = amount / step;
  const r = mode === 'up' ? Math.ceil(q) : mode === 'down' ? Math.floor(q) : Math.round(q);
  return r * step;
}

export function computeTotals(lines: CartLineInput[], orderDiscount: number, rules: PricingRules): CartTotals {
  const subtotal = lines.reduce((s, l) => s + lineGross(l), 0);
  const lineDiscount = lines.reduce((s, l) => s + Math.min(l.discount, lineGross(l)), 0);
  const afterLines = subtotal - lineDiscount;
  const od = Math.max(0, Math.min(orderDiscount, afterLines));
  const net = afterLines - od;

  let tax = 0;
  let beforeRounding = net;
  if (rules.taxMode === 'exclusive' && rules.taxRate > 0) {
    tax = Math.round((net * rules.taxRate) / 100);
    beforeRounding = net + tax;
  } else if (rules.taxMode === 'inclusive' && rules.taxRate > 0) {
    tax = Math.round(net - net / (1 + rules.taxRate / 100));
    beforeRounding = net;
  }

  const total = Math.max(0, roundTo(beforeRounding, rules.roundingStep, rules.roundingMode));
  return {
    subtotal,
    lineDiscount,
    orderDiscount: od,
    net,
    tax,
    rounding: total - beforeRounding,
    total,
  };
}

export interface TenderInput {
  amount: number;
  isCash: boolean;
}

export interface Settlement {
  tendered: number;
  /** Amount applied to the voucher. */
  paid: number;
  change: number;
  /** Amount left unpaid (on credit). */
  due: number;
  /** Non-cash tenders can't exceed what's owed, because there's no change to give. */
  overpaidNonCash: boolean;
}

export function settle(total: number, tenders: TenderInput[]): Settlement {
  const tendered = tenders.reduce((s, t) => s + t.amount, 0);
  const nonCash = tenders.filter((t) => !t.isCash).reduce((s, t) => s + t.amount, 0);
  const paid = Math.min(tendered, total);
  const change = Math.max(0, tendered - total);
  return {
    tendered,
    paid,
    change,
    due: Math.max(0, total - tendered),
    overpaidNonCash: nonCash > total,
  };
}

/** Whether the total discount is within the allowed percentage of the subtotal. */
export function discountWithinLimit(t: CartTotals, maxPct: number): boolean {
  if (t.subtotal === 0) return true;
  return t.lineDiscount + t.orderDiscount <= Math.floor((t.subtotal * maxPct) / 100);
}

/** Weighted-average cost after receiving `inQty` at `inCost` on top of `onHand` at `oldCost`. */
export function weightedAverageCost(onHand: number, oldCost: number, inQty: number, inCost: number): number {
  const base = Math.max(0, onHand);
  if (base + inQty <= 0) return inCost;
  return Math.round((base * oldCost + inQty * inCost) / (base + inQty));
}

/** Quick-cash suggestions: the exact amount plus the next round notes above it. */
export function quickCashOptions(total: number, decimals: number): number[] {
  const unit = 10 ** decimals;
  const notes = [1000, 5000, 10000, 20000, 50000, 100000].map((n) => n * unit);
  const out = new Set<number>([total]);
  for (const n of notes) {
    const v = Math.ceil(total / n) * n;
    if (v > total) out.add(v);
    if (out.size >= 4) break;
  }
  return [...out].sort((a, b) => a - b);
}
