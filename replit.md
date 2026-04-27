# QuickBoo / Forez Backend

## Overview

QuickBooks-style business management platform backend ported from the Forez/QuickBoo project. Full-featured accounting API with invoices, customers, vendors, products, estimates, quotes, bills, purchase orders, inventory, shipments, expenses, bank accounts, tax rates, user auth with roles, and integrations with Dwolla (ACH) and Checkeeper (check printing).

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: Neon PostgreSQL (primary) via `NEON_DATABASE_URL` secret, falls back to Replit PostgreSQL (`DATABASE_URL`)
- **Validation**: Zod (v3 for api-server routes), `drizzle-zod` + `zod/v4` for DB schemas
- **API schemas**: `@workspace/api-zod` (generated Zod schemas from OpenAPI)
- **Build**: esbuild (ESM bundle)

## Key Commands

- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run build` — build the API server

## Default Login

- Email: `developer@gmail.com`
- Password: `developer143`
- Role: `developer` (full access)

## Project Structure

```
artifacts/
  api-server/          — Express 5 REST API (port 8080)
    src/
      routes/          — One file per resource
        auth.ts        — POST /api/auth/login
        users.ts       — /api/users CRUD
        customers.ts   — /api/customers CRUD
        vendors.ts     — /api/vendors CRUD
        products.ts    — /api/products CRUD
        tax-rates.ts   — /api/tax-rates (auto-populates US states)
        quotes.ts      — /api/quotes CRUD + /convert → invoice
        estimates.ts   — /api/estimates CRUD + /convert → invoice
        invoices.ts    — /api/invoices CRUD + /pay
        purchase-orders.ts — /api/purchase-orders CRUD + /convert → bill
        bills.ts       — /api/bills CRUD + /pay (Dwolla ACH + Checkeeper)
        inventory.ts   — /api/inventory (read + update qty)
        shipments.ts   — /api/shipments CRUD (fields: shippingCost, easyshipShipmentId, labelUrl, packageData)
        easyship.ts    — /api/easyship/rates, /api/easyship/book, /api/easyship/label/:id, /api/easyship/status
        app-settings.ts — /api/app-settings CRUD (key-value store for integration config)
        expenses.ts    — /api/expenses CRUD
        bank-accounts.ts — /api/bank-accounts CRUD
        sales-leads.ts — /api/sales-leads CRUD
        dashboard.ts   — /api/dashboard/stats
        accounting.ts  — /api/accounting/general-ledger, ar-aging, ap-aging, pnl, customer-revenue, product-profit
      services/
        dwolla.ts      — ACH transfers (optional, needs DWOLLA_KEY + DWOLLA_SECRET)
        checkeeper.ts  — Check printing (optional, needs CHECKEEPER_TOKEN)

lib/
  db/                  — Drizzle ORM + PostgreSQL
    src/schema/        — 16 table definitions (includes tickets)
  api-zod/             — Zod schemas (generated from OpenAPI spec)
```

## Optional Integrations

- **Dwolla (ACH payments)**: Set `DWOLLA_KEY`, `DWOLLA_SECRET`, optionally `DWOLLA_ENV=production`
- **Checkeeper (check printing)**: Set `CHECKEEPER_TOKEN`
- **EasyShip (shipping)**: Set `EASYSHIP_API_KEY` env var OR save via Settings → Integrations in the dashboard UI. Falls back to demo mode (6 simulated carrier rates) when not configured.

## EasyShip Integration Notes

- Rates API: `POST /api/easyship/rates` — get carrier rates (live when key set, demo otherwise)
- Book API: `POST /api/easyship/book` — create EasyShip shipment, returns tracking # + label URL
- Status API: `GET /api/easyship/status` — reports `{ configured: bool, source: "live"|"demo" }`
- Settings stored in `app_settings` table (key-value). UI at Settings → Integrations.
- ShippingRateModal is fully light-themed (white/slate), 4-step flow: packages → rates → confirm → success
- Label download button shown on success if EasyShip returns a `label_url`

## User Roles

`developer`, `admin`, `sales`, `shipper`, `accountant`, `viewer`, `custom`

## Recent Dashboard Features

- **Global Search** — top-right omnibar searches all entities (customers, vendors, products, invoices, POs, bills, shipments, quotes, auctions). Journey mode traces full document chain (Auction → Quote → Invoice → Receipt) with color-coded icons.
- **Print Cheque Modal** — Bills page: "Write Cheque" opens a printable cheque UI with multi-bill selection, company name/address from settings, amount in words, memo, MICR line, and saves as paid with check number.
- **PO Status Change** — PurchaseOrders row dropdown has "Change Status" option with a 7-option status picker modal (violet accent).
- **Products Insights Panel** — 3-view toggle: Customer Orders (blue), Vendor Supply (violet), Sales per Product (emerald). Period filter: All / 1mo / 3mo / 6mo / 12mo. Product filter dropdown (hidden in Sales per Product view).
- **Product Detail Drawer** — Color-coded tabs: Overview (blue), Analytics (violet), Movements (emerald), Locations (amber). Selected product row highlights in indigo in the list. Analytics tab includes Preferred Vendor selector (persisted to DB via `preferredVendorId` field).
- **Auctions** — Auction list with CRUD. Auction links to invoice via `invoiceId`; auctions appear in GlobalSearch journey chains (Tag icon, amber).
- **EasyShip** — Shipping rate comparison with 4-step flow, label download.
- **Freight Cost** — LineItemsEditor, InvoiceModal, QuoteModal: freightCost field adds a "Freight" line item to the totals and submits it as a line item.
- **Quote Auto-Expiry** — QuoteModal auto-sets expiresAt to 30 days from today when creating a new quote.
- **Auctions Invoice Guard** — Removed `if (!invoiceId)` guard from Auction submit; linkedInvoiceId is now conditional.
- **Order Ledger Frozen Columns** — First 6 columns (Date, Buyer Name, Supplier Name, Mfg #, Product Name, Qty) are sticky with proper left offsets and a shadow separator. TH/TD helpers accept `stickyLeft` and `minW` props.
- **AR/AP Enhanced Visualizations** — Receivables and Payables tabs each show a clickable bar chart of aging buckets (Current/1-30/31-60/61-90/90+). Clicking a bar filters the table below to that bucket only.
- **Overdues & Pending Tab** — New tab in Accounting between Overview and Order Ledger. Shows all overdue AR invoices and pending AP bills in a unified table with a summary bar chart.
- **Reports Customer Search** — Search input above the Customer Revenue table in the Reports tab; filters by customer name with clear button.
- **Multi-select: Invoices, Quotes, POs** — Checkbox column added to each table. Select-all in header. Bulk action bar appears above table when items are selected (shows count + delete button).
- **Invoice Pay Dialog Enhancements** — Payment Date field (defaults to today) and Early Discount % field (shows calculated savings). Both are included in the paymentNote sent to the API.
- **Tickets (Support)** — Full CRUD for support tickets backed by Neon PostgreSQL (`tickets` table). Fields: orderRef, customer (name/email/phone), subject, description, status (open/pending/closed), priority (low/medium/high/urgent), contactMethod, notes (JSONB array). Tickets page uses React Query hooks for all data ops. One-time localStorage migration helper migrates old `forez_tickets_v1` data to DB automatically on first load.
