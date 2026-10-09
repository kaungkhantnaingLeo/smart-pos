import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, DEFAULT_LOCATION_ID } from './db';
import {
  PosError,
  adjustStock,
  completeSale,
  createUser,
  customerBalance,
  onHandTotal,
  recordSettlement,
  savePurchase,
  setOpeningStock,
  transferStock,
  verifyPin,
  voidSale,
} from './services';
import { ensureBaseData, exportAll, importAll, resetAll } from './seed';
import { defaults, resolve, type SettingsValues } from '../config/registry';
import { can, DEFAULT_PERMISSIONS } from '../config/permissions';
import type { Product, User } from './types';

let owner: User;
let product: Product;
const settings = (over: Partial<SettingsValues> = {}): SettingsValues => ({ ...defaults(), ...over });

beforeEach(async () => {
  await resetAll();
  await ensureBaseData('en');
  owner = await createUser('Owner', 'owner', '1234');
  product = {
    id: 'p1',
    name: 'Cola',
    sku: 'C1',
    barcode: '111',
    categoryId: null,
    unitId: null,
    price: 1200,
    cost: 800,
    trackStock: true,
    reorderLevel: 5,
    active: true,
    createdAt: Date.now(),
  };
  await db.products.add(product);
  await setOpeningStock(product, 10, owner);
});

const line = (qty: number) => ({ productId: 'p1', name: 'Cola', qty, price: 1200, discount: 0 });

describe('users', () => {
  it('stores a salted PIN hash and verifies it', async () => {
    expect(owner.pinHash).not.toContain('1234');
    expect(await verifyPin(owner, '1234')).toBe(true);
    expect(await verifyPin(owner, '0000')).toBe(false);
  });
  it('rejects malformed PINs', async () => {
    await expect(createUser('X', 'cashier', '12')).rejects.toBeInstanceOf(PosError);
  });
});

describe('selling', () => {
  it('records the sale, deducts stock and snapshots cost', async () => {
    const sale = await completeSale(
      { lines: [line(3)], orderDiscount: 0, customerId: null, tableId: null, tenders: [{ methodId: 'pm-cash', amount: 5000 }], note: '' },
      { user: owner, settings: settings() },
    );
    expect(sale.total).toBe(3600);
    expect(sale.change).toBe(1400);
    expect(sale.cogs).toBe(2400);
    expect(sale.number).toMatch(/^S01-\d{6}-0001$/);
    expect(await onHandTotal('p1')).toBe(7);
  });

  it('numbers vouchers sequentially', async () => {
    const draft = { lines: [line(1)], orderDiscount: 0, customerId: null, tableId: null, tenders: [{ methodId: 'pm-cash', amount: 1200 }], note: '' };
    await completeSale(draft, { user: owner, settings: settings() });
    const b = await completeSale(draft, { user: owner, settings: settings() });
    expect(b.number.endsWith('0002')).toBe(true);
  });

  it('blocks overselling when negative stock is not allowed', async () => {
    await expect(
      completeSale(
        { lines: [line(11)], orderDiscount: 0, customerId: null, tableId: null, tenders: [{ methodId: 'pm-cash', amount: 99999 }], note: '' },
        { user: owner, settings: settings({ 'sales.allowNegativeStock': false }) },
      ),
    ).rejects.toMatchObject({ code: 'err.insufficientStock' });
    expect(await onHandTotal('p1')).toBe(10);
  });

  it('requires a customer for credit and enforces the credit limit', async () => {
    const draft = { lines: [line(2)], orderDiscount: 0, customerId: null, tableId: null, tenders: [], note: '' };
    await expect(completeSale(draft, { user: owner, settings: settings() })).rejects.toMatchObject({ code: 'err.creditNeedsCustomer' });
    await db.customers.add({ id: 'c1', name: 'Ma Ma', phone: '', address: '', note: '', creditLimit: 3000, createdAt: 0 });
    const ok = await completeSale({ ...draft, customerId: 'c1' }, { user: owner, settings: settings() });
    expect(ok.due).toBe(2400);
    await expect(completeSale({ ...draft, customerId: 'c1' }, { user: owner, settings: settings() })).rejects.toMatchObject({
      code: 'err.creditLimit',
    });
    await recordSettlement('customer', 'c1', 1000, 'pm-cash', '', owner);
    expect(await customerBalance('c1')).toBe(1400);
    await expect(recordSettlement('customer', 'c1', 5000, 'pm-cash', '', owner)).rejects.toMatchObject({ code: 'err.overSettle' });
  });

  it('refuses unpaid vouchers when customer credit is switched off', async () => {
    const s = resolve({ 'module.customerCredit': false }, {});
    await expect(
      completeSale({ lines: [line(1)], orderDiscount: 0, customerId: null, tableId: null, tenders: [], note: '' }, { user: owner, settings: s }),
    ).rejects.toMatchObject({ code: 'err.notPaidInFull' });
  });

  it('voiding returns stock', async () => {
    const sale = await completeSale(
      { lines: [line(4)], orderDiscount: 0, customerId: null, tableId: null, tenders: [{ methodId: 'pm-cash', amount: 4800 }], note: '' },
      { user: owner, settings: settings() },
    );
    await voidSale(sale.id, owner, 'mistake');
    expect(await onHandTotal('p1')).toBe(10);
    expect((await db.sales.get(sale.id))?.status).toBe('void');
    await expect(voidSale(sale.id, owner, 'again')).rejects.toMatchObject({ code: 'err.cannotVoid' });
  });
});

describe('purchasing and stock', () => {
  it('adds stock and updates weighted-average cost', async () => {
    await savePurchase({ supplierId: null, lines: [{ productId: 'p1', name: 'Cola', qty: 10, cost: 1000 }], paid: 10000, methodId: 'pm-cash', note: '' }, owner, settings());
    expect(await onHandTotal('p1')).toBe(20);
    expect((await db.products.get('p1'))?.cost).toBe(900);
  });

  it('uses last cost when configured', async () => {
    await savePurchase(
      { supplierId: null, lines: [{ productId: 'p1', name: 'Cola', qty: 10, cost: 1000 }], paid: 10000, methodId: 'pm-cash', note: '' },
      owner,
      settings({ 'inventory.costing': 'last' }),
    );
    expect((await db.products.get('p1'))?.cost).toBe(1000);
  });

  it('records count differences as adjustments', async () => {
    expect(await adjustStock('p1', DEFAULT_LOCATION_ID, 7, 'count', owner)).toBe(-3);
    expect(await onHandTotal('p1')).toBe(7);
  });

  it('transfers between locations without changing the total', async () => {
    await db.locations.add({ id: 'loc-2', name: 'Store room' });
    await transferStock('p1', DEFAULT_LOCATION_ID, 'loc-2', 4, '', owner, false);
    expect(await onHandTotal('p1')).toBe(10);
    expect((await db.stock.get('p1|loc-2'))?.qty).toBe(4);
    await expect(transferStock('p1', DEFAULT_LOCATION_ID, 'loc-2', 50, '', owner, false)).rejects.toMatchObject({
      code: 'err.insufficientStock',
    });
  });
});

describe('settings and permissions', () => {
  it('turns dependent settings off with their module', () => {
    const s = resolve({ 'module.customers': false }, {});
    expect(s['module.customerCredit']).toBe(false);
  });
  it('lets device values override shop values for device-scoped settings only', () => {
    const s = resolve({ 'print.paper': '58', 'shop.name': 'A' }, { 'print.paper': 'a4', 'shop.name': 'B' });
    expect(s['print.paper']).toBe('a4');
    expect(s['shop.name']).toBe('A');
  });
  it('coerces invalid stored values to defaults', () => {
    const s = resolve({ 'tax.rate': 'abc', 'sales.rounding': '7', 'sales.maxDiscountPct': 500 }, {});
    expect(s['tax.rate']).toBe(5);
    expect(s['sales.rounding']).toBe('none');
    expect(s['sales.maxDiscountPct']).toBe(100);
  });
  it('always lets the owner act', () => {
    expect(can('owner', 'data.manage', DEFAULT_PERMISSIONS)).toBe(true);
    expect(can('cashier', 'sale.void', DEFAULT_PERMISSIONS)).toBe(false);
  });
});

describe('backup', () => {
  it('round-trips all data', async () => {
    const json = await exportAll();
    await resetAll();
    expect(await db.products.count()).toBe(0);
    await importAll(json);
    expect(await onHandTotal('p1')).toBe(10);
    expect(await db.users.count()).toBe(1);
  });
});
