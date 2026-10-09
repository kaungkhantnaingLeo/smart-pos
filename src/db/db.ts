import Dexie, { type Table } from 'dexie';
import type {
  AuditEntry,
  Category,
  Contact,
  Counter,
  DiningTable,
  Expense,
  ExpenseCategory,
  Location,
  PaymentMethod,
  Product,
  Purchase,
  Sale,
  Settlement,
  SettingRow,
  StockBalance,
  StockMove,
  Unit,
  User,
} from './types';

export class PosDB extends Dexie {
  users!: Table<User, string>;
  categories!: Table<Category, string>;
  units!: Table<Unit, string>;
  products!: Table<Product, string>;
  customers!: Table<Contact, string>;
  suppliers!: Table<Contact, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  locations!: Table<Location, string>;
  diningTables!: Table<DiningTable, string>;
  sales!: Table<Sale, string>;
  purchases!: Table<Purchase, string>;
  stockMoves!: Table<StockMove, string>;
  stock!: Table<StockBalance, string>;
  settlements!: Table<Settlement, string>;
  expenseCategories!: Table<ExpenseCategory, string>;
  expenses!: Table<Expense, string>;
  settings!: Table<SettingRow, string>;
  counters!: Table<Counter, string>;
  audit!: Table<AuditEntry, string>;

  constructor(name = 'smart-pos') {
    super(name);
    this.version(1).stores({
      users: 'id, role',
      categories: 'id, sort',
      units: 'id',
      products: 'id, name, sku, barcode, categoryId',
      customers: 'id, name, phone',
      suppliers: 'id, name, phone',
      paymentMethods: 'id, sort',
      locations: 'id',
      diningTables: 'id, sort',
      sales: 'id, number, createdAt, status, customerId, userId, tableId, [status+createdAt]',
      purchases: 'id, number, createdAt, supplierId',
      stockMoves: 'id, createdAt, productId, type, locationId, refId',
      stock: 'id, productId, locationId',
      settlements: 'id, createdAt, partyType, partyId',
      expenseCategories: 'id',
      expenses: 'id, date, createdAt, categoryId',
      settings: 'key',
      counters: 'key',
      audit: 'id, at',
    });
  }
}

export const db = new PosDB();

/** All table names, used for backup / restore / reset. */
export const TABLES = [
  'users',
  'categories',
  'units',
  'products',
  'customers',
  'suppliers',
  'paymentMethods',
  'locations',
  'diningTables',
  'sales',
  'purchases',
  'stockMoves',
  'stock',
  'settlements',
  'expenseCategories',
  'expenses',
  'settings',
  'counters',
  'audit',
] as const;

export type TableName = (typeof TABLES)[number];

export const DEFAULT_LOCATION_ID = 'loc-main';
