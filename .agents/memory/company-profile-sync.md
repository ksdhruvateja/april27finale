---
name: Company Profile sync pattern
description: How company name/logo/contact info is stored, loaded, and used across the app
---

## Storage
All company fields saved to `app_settings` table (key-value) via `PUT /api/app-settings/:key`.
Keys: `company_name`, `company_tagline`, `company_address`, `company_city`, `company_state`,
`company_zip`, `company_phone`, `company_email`, `company_website`, `company_logo` (base64 data-URL).

`ALLOWED_KEYS` in `artifacts/api-server/src/routes/app-settings.ts` must include any new key.

## Shared hook
`artifacts/dashboard/src/lib/companyProfile.ts` exports:
- `useCompanyProfile()` — React hook returning `CompanyProfile` (loads from `/api/app-settings` bulk GET)
- `fetchCompanyProfile()` — async function for non-hook use
- `invalidateCompanyProfileCache()` — call after saving to force fresh fetch
- `COMPANY_DEFAULTS` — fallback values (Forez Corp defaults)

Module-level cache (1 minute TTL) shared across all components.

## Settings UI
`CompanyProfileSection` in `Settings.tsx` — view/edit panel with logo upload (base64), name, tagline,
address, phone, email, website. Calls `invalidateCompanyProfileCache()` after save.

## Components updated to use profile
- InvoiceView.tsx — print HTML + React UI (logo, name, tagline, address)
- QuoteView.tsx — print HTML + React UI + email/sms text
- ShippingRateModal.tsx — API from/to payload + JSX address cards
- PrintChequeModal.tsx — `buildPrintHtml` is module-level; passes `companyName/Addr1/Addr2` as opts params
- PayBillModal.tsx — payerName + payerAddress for check printing
- WalkIn.tsx — receipt HTML header + footer
- PurchaseOrders.tsx — PrintPODialog print HTML
- Returns.tsx — ReturnModal credit memo footer
- Dashboard.tsx — welcome strip

**Why:** PrintChequeModal's `buildPrintHtml` is a module-level function (not inside a component),
so it cannot call hooks. Company info is passed as explicit parameters instead.
