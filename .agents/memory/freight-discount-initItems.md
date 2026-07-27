---
name: Freight and Discount virtual line items
description: Freight and Discount are auto-generated items stored in the DB but controlled via separate state in QuoteModal
---

In `QuoteModal.tsx`, `freightCost` and `orderDiscount` are controlled by their own state fields. When saving a quote, these are appended as "Freight" and "Discount" line items by `handleSubmit`. They are also stored in the DB alongside regular line items.

**Why this matters:** `initItems()` must filter out any existing "Freight" or "Discount" line items from the raw DB data, otherwise:
1. They show up as editable rows in the line items editor (confusing the user)
2. On save, `handleSubmit` appends them again — creating duplicates on every edit

**Fix:** In `initItems`, filter `i.description !== "Freight" && i.description !== "Discount"` before mapping. The `freightCost` state is separately initialized from the Freight item's `unitPrice`.

**How to apply:** Any time you add new auto-generated/virtual line item types (like a future "Handling Fee" controlled state), add them to the same filter in `initItems` and initialize their own state from the raw items before filtering.
