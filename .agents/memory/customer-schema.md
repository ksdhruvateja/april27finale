---
name: Customer Zod schema fixes
description: Why emails/phones/accountType in customer Zod schemas must use permissive types, not strict enum/string arrays
---

## The Rule
In `lib/api-zod/src/generated/api.ts`, `CreateCustomerBody` and `UpdateCustomerBody` must use:
- `emails: zod.array(zod.any()).nullish()` — modal sends `[{label, email}]` objects, not strings
- `phones: zod.array(zod.any()).nullish()` — modal sends `[{label, number}]` objects
- `accountType: zod.string().nullish()` — dropdown values like "cash" were absent from the old enum

**Why:** The modal sent structured email/phone objects but the schema expected `string[]`, causing a silent 400. The mutation had no onError handler so the modal never closed and no feedback was shown.

**How to apply:** Any time you add a new field that's stored as a JSONB array in the DB, use `zod.array(zod.any())` in the request body schema, not `zod.array(zod.string())`.
