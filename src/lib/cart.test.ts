import { describe, expect, it } from 'vitest';
import { computeTotals, discountWithinLimit, quickCashOptions, roundTo, settle, weightedAverageCost } from './cart';
import { formatMoney, parseMoney, formatNumber, latinizeDigits } from './money';
import { formatDocNumber, periodKey } from './dates';

const noTax = { taxMode: 'off' as const, taxRate: 0, roundingStep: 0, roundingMode: 'nearest' as const };

describe('computeTotals', () => {
  it('sums lines and applies line + order discounts', () => {
    const t = computeTotals(
      [
        { price: 1200, qty: 2, discount: 100 },
        { price: 500, qty: 3, discount: 0 },
      ],
      300,
      noTax,
    );
    expect(t.subtotal).toBe(3900);
    expect(t.lineDiscount).toBe(100);
    expect(t.orderDiscount).toBe(300);
    expect(t.total).toBe(3500);
  });

  it('never lets the order discount push the total below zero', () => {
    const t = computeTotals([{ price: 1000, qty: 1, discount: 0 }], 5000, noTax);
    expect(t.orderDiscount).toBe(1000);
    expect(t.total).toBe(0);
  });

  it('adds exclusive tax on top', () => {
    const t = computeTotals([{ price: 10000, qty: 1, discount: 0 }], 0, { ...noTax, taxMode: 'exclusive', taxRate: 5 });
    expect(t.tax).toBe(500);
    expect(t.total).toBe(10500);
  });

  it('extracts inclusive tax without changing the total', () => {
    const t = computeTotals([{ price: 10500, qty: 1, discount: 0 }], 0, { ...noTax, taxMode: 'inclusive', taxRate: 5 });
    expect(t.tax).toBe(500);
    expect(t.total).toBe(10500);
  });

  it('rounds the total to the configured step and reports the difference', () => {
    const t = computeTotals([{ price: 1234, qty: 1, discount: 0 }], 0, { ...noTax, roundingStep: 50 });
    expect(t.total).toBe(1250);
    expect(t.rounding).toBe(16);
    expect(roundTo(1234, 50, 'down')).toBe(1200);
    expect(roundTo(1201, 50, 'up')).toBe(1250);
  });

  it('handles fractional quantities', () => {
    const t = computeTotals([{ price: 8000, qty: 1.25, discount: 0 }], 0, noTax);
    expect(t.total).toBe(10000);
  });
});

describe('settle', () => {
  it('gives change only from overpayment', () => {
    expect(settle(3500, [{ amount: 5000, isCash: true }])).toMatchObject({ paid: 3500, change: 1500, due: 0 });
  });
  it('leaves the remainder on credit', () => {
    expect(settle(3500, [{ amount: 1000, isCash: true }])).toMatchObject({ paid: 1000, change: 0, due: 2500 });
  });
  it('flags non-cash overpayment', () => {
    expect(settle(3500, [{ amount: 4000, isCash: false }]).overpaidNonCash).toBe(true);
  });
  it('accepts split tender', () => {
    expect(
      settle(10000, [
        { amount: 6000, isCash: false },
        { amount: 5000, isCash: true },
      ]),
    ).toMatchObject({ paid: 10000, change: 1000, due: 0, overpaidNonCash: false });
  });
});

describe('discount limit', () => {
  it('compares total discount against the subtotal percentage', () => {
    const t = computeTotals([{ price: 10000, qty: 1, discount: 1000 }], 1000, noTax);
    expect(discountWithinLimit(t, 20)).toBe(true);
    expect(discountWithinLimit(t, 10)).toBe(false);
  });
});

describe('costing', () => {
  it('blends cost by quantity', () => {
    expect(weightedAverageCost(10, 1000, 10, 2000)).toBe(1500);
  });
  it('ignores negative stock when blending', () => {
    expect(weightedAverageCost(-5, 1000, 10, 2000)).toBe(2000);
  });
});

describe('money', () => {
  const mmk = { symbol: 'Ks', position: 'after' as const, decimals: 0, digits: 'latin' as const };
  it('formats Kyat with grouping', () => {
    expect(formatMoney(1250000, mmk)).toBe('1,250,000 Ks');
  });
  it('formats Myanmar digits', () => {
    expect(formatMoney(1500, { ...mmk, digits: 'myanmar' })).toBe('၁,၅၀၀ Ks');
  });
  it('formats two-decimal currencies', () => {
    expect(formatMoney(123456, { symbol: '$', position: 'before', decimals: 2, digits: 'latin' })).toBe('$1,234.56');
    expect(formatNumber(-5, 2)).toBe('-0.05');
  });
  it('parses user input, including Myanmar digits', () => {
    expect(parseMoney('12,500', 0)).toBe(12500);
    expect(parseMoney('၁၂၀၀', 0)).toBe(1200);
    expect(parseMoney('12.5', 2)).toBe(1250);
    expect(parseMoney('abc', 0)).toBeNull();
    expect(latinizeDigits('၀၉')).toBe('09');
  });
  it('suggests quick cash amounts above the total', () => {
    expect(quickCashOptions(3500, 0)).toEqual([3500, 4000, 5000, 10000]);
  });
});

describe('document numbers', () => {
  it('includes prefix, device, period and padded sequence', () => {
    const at = new Date(2026, 9, 9).getTime();
    expect(formatDocNumber('S', '01', periodKey('daily', at), 7, 4)).toBe('S01-261009-0007');
    expect(formatDocNumber('P', '', periodKey('never', at), 12, 3)).toBe('P-012');
  });
});
