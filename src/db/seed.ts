import { db, DEFAULT_LOCATION_ID, TABLES } from './db';
import type { Product, User } from './types';
import { completeSale, customerBalance, onHandTotal, savePurchase, setOpeningStock, recordSettlement } from './services';
import { loadSettings } from './settings';
import { uid } from '../lib/util';
import { addDays, dayKey, startOfDay } from '../lib/dates';

/** Records every shop needs before the first sale. Safe to call repeatedly. */
export async function ensureBaseData(lang: 'my' | 'en'): Promise<void> {
  const my = lang === 'my';
  await db.transaction('rw', [db.locations, db.paymentMethods, db.units, db.expenseCategories], async () => {
    if ((await db.locations.count()) === 0) {
      await db.locations.add({ id: DEFAULT_LOCATION_ID, name: my ? 'ဆိုင်' : 'Main shop' });
    }
    if ((await db.paymentMethods.count()) === 0) {
      await db.paymentMethods.bulkAdd([
        { id: 'pm-cash', name: my ? 'ငွေသား' : 'Cash', kind: 'cash', active: true, sort: 0 },
        { id: 'pm-kbzpay', name: 'KBZPay', kind: 'wallet', active: true, sort: 1 },
        { id: 'pm-wavepay', name: 'WavePay', kind: 'wallet', active: true, sort: 2 },
        { id: 'pm-ayapay', name: 'AYA Pay', kind: 'wallet', active: true, sort: 3 },
        { id: 'pm-bank', name: my ? 'ဘဏ်လွှဲ' : 'Bank transfer', kind: 'bank', active: true, sort: 4 },
      ]);
    }
    if ((await db.units.count()) === 0) {
      const names = my ? ['ခု', 'ဘူး', 'ပုလင်း', 'ထုပ်', 'ကီလို', 'ဗူး'] : ['pcs', 'box', 'bottle', 'pack', 'kg', 'can'];
      await db.units.bulkAdd(names.map((name, i) => ({ id: `unit-${i}`, name })));
    }
    if ((await db.expenseCategories.count()) === 0) {
      const names = my
        ? ['ဆိုင်ခန်းငှားခ', 'လျှပ်စစ်မီး', 'ဝန်ထမ်းလစာ', 'သယ်ယူစရိတ်', 'အထွေထွေ']
        : ['Rent', 'Electricity', 'Salaries', 'Transport', 'General'];
      await db.expenseCategories.bulkAdd(names.map((name, i) => ({ id: `exc-${i}`, name })));
    }
  });
}

type DemoItem = [my: string, en: string, cat: number, unit: number, price: number, cost: number, stock: number];

const DEMO_CATEGORIES: [string, string][] = [
  ['အချိုရည်', 'Drinks'],
  ['မုန့်', 'Snacks'],
  ['ကုန်ခြောက်', 'Groceries'],
  ['သုံးဆောင်ပစ္စည်း', 'Household'],
];

const DEMO_ITEMS: DemoItem[] = [
  ['ရေသန့် ၁ လီတာ', 'Drinking water 1L', 0, 2, 500, 300, 120],
  ['ကိုကာကိုလာ', 'Cola can', 0, 5, 1200, 850, 60],
  ['လိမ္မော်ရည်', 'Orange juice', 0, 2, 1800, 1300, 30],
  ['ကော်ဖီမစ် ၃ မျိုး', '3-in-1 coffee mix', 0, 3, 3500, 2700, 40],
  ['လက်ဖက်ရည်ခြောက်', 'Tea leaves', 0, 3, 2500, 1800, 25],
  ['အာလူးကြော်', 'Potato chips', 1, 3, 1000, 650, 80],
  ['ဘီစကွတ်', 'Biscuits', 1, 3, 1500, 1050, 50],
  ['ချော့ကလက်', 'Chocolate bar', 1, 0, 2000, 1400, 35],
  ['ပဲကြော်', 'Fried beans', 1, 3, 800, 500, 4],
  ['ဆန် ၁ ပြည်', 'Rice 1 pyi', 2, 3, 6500, 5600, 40],
  ['စားသုံးဆီ ၁ ပိဿာ', 'Cooking oil 1 viss', 2, 2, 9500, 8400, 18],
  ['ငါးပိ', 'Fish paste', 2, 1, 3000, 2200, 12],
  ['ကြက်ဥ ၁၀ လုံး', 'Eggs (10)', 2, 3, 4200, 3500, 3],
  ['ခေါက်ဆွဲခြောက်', 'Instant noodles', 2, 3, 700, 480, 150],
  ['ဆပ်ပြာ', 'Bar soap', 3, 0, 1200, 800, 45],
  ['သွားတိုက်ဆေး', 'Toothpaste', 3, 1, 2800, 2000, 20],
  ['လျှော်ဖွပ်မှုန့်', 'Laundry powder', 3, 3, 4500, 3600, 15],
  ['တစ်ရှူး', 'Tissue box', 3, 1, 1800, 1200, 2],
];

/** Fill an empty shop with sample products, contacts and 30 days of history. */
export async function loadDemoData(owner: User, lang: 'my' | 'en'): Promise<void> {
  const my = lang === 'my';
  const s = await loadSettings();
  const cats = DEMO_CATEGORIES.map(([m, e], i) => ({ id: uid(), name: my ? m : e, sort: i }));
  await db.categories.bulkAdd(cats);
  const units = await db.units.toArray();
  const now = Date.now();
  const products: Product[] = DEMO_ITEMS.map(([m, e, c, u, price, cost], i) => ({
    id: uid(),
    name: my ? m : e,
    sku: `SKU${String(i + 1).padStart(3, '0')}`,
    barcode: String(8850000000000 + i * 7919),
    categoryId: cats[c].id,
    unitId: units[u]?.id ?? null,
    price,
    cost,
    trackStock: true,
    reorderLevel: 5,
    active: true,
    createdAt: now,
  }));
  await db.products.bulkAdd(products);

  const start = startOfDay(addDays(now, -30));

  const customers = (my
    ? [['ဒေါ်ခင်မြ', '09 420 111 222'], ['ကိုအောင်ကျော်', '09 250 333 444'], ['မနီလာ', '09 799 555 666']]
    : [['Daw Khin Mya', '09 420 111 222'], ['Ko Aung Kyaw', '09 250 333 444'], ['Ma Nilar', '09 799 555 666']]
  ).map(([name, phone]) => ({ id: uid(), name, phone, address: '', note: '', creditLimit: 200000, createdAt: now }));
  await db.customers.bulkAdd(customers);

  const suppliers = (my ? ['ရွှေမန်းလက်ကား', 'ရန်ကုန်ဖြန့်ချိရေး'] : ['Shwe Mann Wholesale', 'Yangon Distribution']).map(
    (name, i) => ({ id: uid(), name, phone: `09 400 00${i} 000`, address: '', note: '', creditLimit: 0, createdAt: now }),
  );
  await db.suppliers.bulkAdd(suppliers);

  // Deterministic pseudo-random so demo reports look the same on every device.
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const methods = await db.paymentMethods.toArray();

  for (let d = 29; d >= 0; d--) {
    const day = startOfDay(addDays(now, -d));
    const count = 4 + Math.floor(rnd() * 7);
    for (let k = 0; k < count; k++) {
      const at = day + (8 + rnd() * 12) * 3_600_000;
      if (at > now) continue;
      const n = 1 + Math.floor(rnd() * 4);
      const lines = Array.from({ length: n }, () => {
        const p = products[Math.floor(rnd() * products.length)];
        return { productId: p.id, name: p.name, qty: 1 + Math.floor(rnd() * 3), price: p.price, discount: 0 };
      });
      const total = lines.reduce((a, l) => a + l.price * l.qty, 0);
      const onCredit = rnd() < 0.08;
      const method = rnd() < 0.6 ? methods[0] : methods[1 + Math.floor(rnd() * 3)];
      await completeSale(
        {
          lines,
          orderDiscount: 0,
          customerId: onCredit ? customers[Math.floor(rnd() * customers.length)].id : null,
          tableId: null,
          tenders: onCredit ? [] : [{ methodId: method.id, amount: total }],
          note: '',
        },
        { user: owner, settings: { ...s, 'sales.allowNegativeStock': true }, at },
      );
    }
    if (d % 10 === 5) {
      const lines = products.slice(0, 6).map((p) => ({ productId: p.id, name: p.name, qty: 12, cost: p.cost }));
      const total = lines.reduce((a, l) => a + l.qty * l.cost, 0);
      await savePurchase(
        { supplierId: suppliers[d % 2].id, lines, paid: Math.round(total * 0.6), methodId: methods[0].id, note: '' },
        owner,
        s,
        day + 9 * 3_600_000,
      );
    }
    if (d % 7 === 0) {
      const cats2 = await db.expenseCategories.toArray();
      await db.expenses.add({
        id: uid(),
        createdAt: day + 18 * 3_600_000,
        date: dayKey(day),
        categoryId: cats2[d % cats2.length].id,
        amount: 15000 + Math.floor(rnd() * 20) * 1000,
        methodId: methods[0].id,
        note: '',
        userId: owner.id,
      });
    }
  }
  // Back-date opening stock so each product ends at its listed quantity
  // (a few deliberately below their reorder level).
  for (const [i, p] of products.entries()) {
    await setOpeningStock(p, DEMO_ITEMS[i][6] - (await onHandTotal(p.id)), owner, start);
  }

  // One customer has paid back part of what they owe.
  const owed = await customerBalance(customers[0].id);
  if (owed > 0) await recordSettlement('customer', customers[0].id, Math.round(owed / 2), 'pm-cash', '', owner);
}

export async function exportAll(): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return JSON.stringify({ app: 'smart-pos', version: 1, exportedAt: new Date().toISOString(), data });
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { app?: string; data?: Record<string, unknown[]> };
  if (parsed.app !== 'smart-pos' || !parsed.data) throw new Error('err.badBackup');
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = parsed.data![t];
      if (Array.isArray(rows) && rows.length) await db.table(t).bulkAdd(rows);
    }
  });
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
  });
}
