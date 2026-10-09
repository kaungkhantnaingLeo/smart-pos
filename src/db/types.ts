// Domain types. Money is always an integer in minor units of the shop currency
// (MMK has 0 decimals, so 1 unit = 1 Kyat). Quantities may be fractional.

export type ID = string;
export type Role = 'owner' | 'manager' | 'cashier';

export interface User {
  id: ID;
  name: string;
  role: Role;
  pinHash: string;
  salt: string;
  /** Number of digits, so the lock screen knows when the PIN is complete. */
  pinLength: number;
  active: boolean;
  createdAt: number;
}

export interface Category {
  id: ID;
  name: string;
  sort: number;
}

export interface Unit {
  id: ID;
  name: string;
}

export interface Product {
  id: ID;
  name: string;
  sku: string;
  barcode: string;
  categoryId: ID | null;
  unitId: ID | null;
  price: number;
  /** Current unit cost used for COGS (weighted average or last cost, per setting). */
  cost: number;
  trackStock: boolean;
  reorderLevel: number;
  active: boolean;
  createdAt: number;
}

export interface Contact {
  id: ID;
  name: string;
  phone: string;
  address: string;
  note: string;
  /** Customers only: 0 = no limit. */
  creditLimit: number;
  createdAt: number;
}

export type PaymentKind = 'cash' | 'card' | 'wallet' | 'bank' | 'other';

export interface PaymentMethod {
  id: ID;
  name: string;
  kind: PaymentKind;
  active: boolean;
  sort: number;
}

export interface Location {
  id: ID;
  name: string;
}

export interface DiningTable {
  id: ID;
  name: string;
  seats: number;
  sort: number;
}

export interface SaleLine {
  productId: ID;
  name: string;
  qty: number;
  price: number;
  /** Line discount amount (total for the line, not per unit). */
  discount: number;
  /** Unit cost snapshot at time of sale, for profit reporting. */
  cost: number;
}

export interface Tender {
  methodId: ID;
  amount: number;
}

export type SaleStatus = 'completed' | 'held' | 'void';

export interface Sale {
  id: ID;
  number: string;
  createdAt: number;
  userId: ID;
  customerId: ID | null;
  tableId: ID | null;
  locationId: ID;
  status: SaleStatus;
  lines: SaleLine[];
  subtotal: number;
  lineDiscount: number;
  orderDiscount: number;
  tax: number;
  rounding: number;
  total: number;
  /** Money actually applied to the sale (excludes change). */
  paid: number;
  change: number;
  /** Amount left on credit at time of sale. */
  due: number;
  tenders: Tender[];
  cogs: number;
  note: string;
  voidedAt?: number;
  voidedBy?: ID;
  voidReason?: string;
}

export interface PurchaseLine {
  productId: ID;
  name: string;
  qty: number;
  cost: number;
}

export interface Purchase {
  id: ID;
  number: string;
  createdAt: number;
  userId: ID;
  supplierId: ID | null;
  locationId: ID;
  lines: PurchaseLine[];
  total: number;
  paid: number;
  due: number;
  methodId: ID | null;
  note: string;
}

export type MoveType =
  | 'opening'
  | 'sale'
  | 'void'
  | 'purchase'
  | 'adjust'
  | 'transfer_out'
  | 'transfer_in';

export interface StockMove {
  id: ID;
  createdAt: number;
  productId: ID;
  locationId: ID;
  /** Signed quantity: positive adds stock, negative removes it. */
  qty: number;
  type: MoveType;
  unitCost: number;
  refId: ID | null;
  note: string;
  userId: ID;
}

export interface StockBalance {
  /** `${productId}|${locationId}` */
  id: string;
  productId: ID;
  locationId: ID;
  qty: number;
}

export type PartyType = 'customer' | 'supplier';

export interface Settlement {
  id: ID;
  createdAt: number;
  partyType: PartyType;
  partyId: ID;
  amount: number;
  methodId: ID | null;
  note: string;
  userId: ID;
}

export interface ExpenseCategory {
  id: ID;
  name: string;
}

export interface Expense {
  id: ID;
  createdAt: number;
  date: string; // YYYY-MM-DD
  categoryId: ID | null;
  amount: number;
  methodId: ID | null;
  note: string;
  userId: ID;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface Counter {
  key: string;
  period: string;
  value: number;
}

export interface AuditEntry {
  id: ID;
  at: number;
  userId: ID;
  action: string;
  detail: string;
}
