---
name: App settings JSON blobs
description: How net_terms and company_addresses are stored and served via app_settings
---

## The Rule
Dynamic lists (net terms, company addresses) are stored as JSON strings in the `app_settings` table under keys `net_terms` and `company_addresses`. Both keys are in `ALLOWED_KEYS` in `artifacts/api-server/src/routes/app-settings.ts`.

Fetch pattern: `GET /api/app-settings/<key>` → `{ value: "<json string>" }`. Parse with `JSON.parse(d.value)`.
Save pattern: `PUT /api/app-settings/<key>` with body `{ value: JSON.stringify(array) }`.

**Net terms shape:** `[{ id: "net30", label: "Net 30" }, ...]`  
- `id` is the key stored in customer `accountType`; `label` is the display name  
- Renaming a label auto-syncs everywhere since it's looked up at render time

**Company addresses shape:** `[{ id: string, name: string, line1, line2?, city, state, zip, phone? }, ...]`  
- Used in InvoiceView and QuoteView: if 2+ addresses saved, a picker modal shows before printing; if 1, auto-selected; if 0, falls back to hardcoded BUSINESS constant

**Why:** Avoids schema migrations for admin-configurable lists; easy to CRUD from the Settings page.
