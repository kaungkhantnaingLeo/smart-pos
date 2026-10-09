# Smart POS

A configurable, offline-first point of sale for small shops, in Myanmar and English.
It runs in the browser, installs like an app on Android tablets and phones, and keeps
working without an internet connection.

**Live app:** https://kaungkhantnaingleo.github.io/smart-pos/

On first open you set up the shop and an owner PIN. Turn on "Add sample products" to get
18 products, a few customers and suppliers, and 30 days of sales to explore the reports.

## What it does

| Area | Features |
|---|---|
| Selling | Product grid with category filters, search and barcode scanning, line and voucher discounts with a configurable limit, hold and resume vouchers, split payments (cash, KBZPay, WavePay, AYA Pay, bank, card), quick-cash buttons, change and credit, receipt printing (58 mm, 80 mm, A4) |
| Vouchers | Daily list with filters, receipt preview, reprint, void with reason (returns stock, logged) |
| Products | Products, categories, units, SKU/barcode, cost and margin, reorder level, opening stock |
| Stock | On-hand per location, value at cost and at price, low stock, stock counts, transfers, full in/out ledger |
| Purchases | Purchases from suppliers, partial payment, weighted-average or last-cost costing |
| Credit | Customer receivables and supplier payables, credit limits, record payments, history |
| Expenses | Expenses with categories, feeding the profit report |
| Reports | Sales summary, sales calendar, by product (amount/quantity), by category, customer, payment method and cashier, stock on hand, low stock, movements, profit, purchases, expenses — all exportable to CSV |
| Staff | Owner, manager and cashier accounts with PINs, and a permission matrix per role |
| Data | Backup to a file, restore, erase |

## Everything is configurable

Every behaviour is declared once in [`src/config/registry.ts`](src/config/registry.ts): its type,
default, scope and dependencies. The Settings screen is generated from that list, so a new setting
needs one line there plus a label.

- **Features** can be switched off: purchases, stock, customers, customer credit, supplier credit,
  expenses, table mode, multiple locations. Switching a feature off hides it everywhere but never
  deletes its data.
- **Selling rules**: negative stock, discounts and their limit, hold vouchers, price edits, rounding
  (to 5/10/50/100, nearest/up/down), credit rules.
- **Tax** (off, added on top, or included in prices), **currency**, **voucher numbering**
  (prefix, per-device code, reset daily/monthly/yearly), **costing method**, **receipt layout**,
  **language and digits** (Myanmar ၀၁၂၃ or Latin), **theme**, **accent colour** and **density**.
- **Shop** settings are shared with everyone using the data; **device** settings (printer paper,
  theme, language) belong to one tablet.
- **Permissions**: 18 actions per role. The owner can always do everything, so a shop can't lock
  itself out.

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript, Vite |
| Local database | IndexedDB through Dexie (live queries keep every screen current) |
| State | Zustand for session and settings |
| Offline / install | PWA (vite-plugin-pwa / Workbox) |
| Fonts | IBM Plex Sans (Latin, tabular figures) and Noto Sans Myanmar, bundled so text renders the same on every device |
| Tests | Vitest with fake-indexeddb |
| Hosting | GitHub Pages via GitHub Actions |

The original plan was Flutter. The build environment used for this first version couldn't download
the Flutter SDK, so the app was built as an installable web app instead, which also hosts directly
on GitHub Pages. The domain logic (pricing, stock ledger, costing, numbering) lives in plain
TypeScript modules with tests, independent of the UI.

## How it's built

```
src/
  config/      settings registry and role permissions
  db/          Dexie schema, domain types, business operations, demo data, backup
  lib/         pure money, pricing, date and CSV helpers (unit-tested)
  i18n/        English and Myanmar strings (Myanmar is type-checked against English)
  state/       app store, formatters, translation hooks
  ui/          shared controls: sheets, dialogs, money inputs, date ranges, lists
  features/    one folder per screen: sell, vouchers, catalog, inventory, purchases,
               contacts, credit, expenses, reports, settings, auth, print
```

Design decisions worth knowing:

- **Money is stored as integers** in the currency's smallest unit (Kyat has no decimals).
- **Stock is a ledger.** Every sale, void, purchase, count and transfer writes a movement; a cached
  balance per product and location is updated in the same transaction, so reports and the ledger
  always agree.
- **Cost is snapshotted on each sale line**, so profit reports don't change when prices change later.
- **Voucher numbers include a device code** (`S01-261009-0007`) so two tablets never clash.
- **Voiding** reverses the stock movements and keeps the voucher, marked void, for the audit trail.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173/smart-pos/
npm test           # unit and data tests
npm run build      # production build in dist/
```

Set `BASE_PATH=/` when hosting somewhere other than `/smart-pos/`.

## Deploying

Every push to `main` runs the tests, builds, and publishes to GitHub Pages
(`.github/workflows/deploy.yml`). In the repository's **Settings › Pages**, the source must be
**GitHub Actions**.

## Limits of this version

- Data lives in the browser on one device. Clearing the browser's site data deletes it, so use
  **Settings › Data & backup** regularly. Multi-device sync is the next phase.
- PINs stop casual access at the counter; they are not protection against someone with full access
  to the device.
- Printing uses the browser's print dialog. Direct Bluetooth printing to thermal printers needs the
  native Android wrapper (see below).

## Roadmap

1. Cloud sync between devices (Postgres backend, per-shop data isolation).
2. Native Android build (Capacitor) with direct ESC/POS Bluetooth printing and camera barcode scanning.
3. Partial returns, unit conversions (box ↔ pieces), FIFO costing, per-voucher multi-currency.
4. Kitchen tickets and modifiers for table mode.
