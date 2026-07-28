import { db, invoicesTable, quotesTable, appSettingsTable } from "@workspace/db";

/**
 * Returns the next document number shared across invoices and quotes.
 */
export async function getNextDocNumber(): Promise<number> {
  const [invRows, qRows] = await Promise.all([
    db.select({ id: invoicesTable.id, num: invoicesTable.invoiceNumber }).from(invoicesTable),
    db.select({ id: quotesTable.id, num: quotesTable.quoteNumber }).from(quotesTable),
  ]);

  const nums: number[] = [];

  for (const r of invRows) {
    if (r.num) {
      const n = parseInt(r.num.replace(/\D+/g, ""), 10);
      if (!isNaN(n) && n > 0) nums.push(n);
    }
    nums.push(5099 + r.id);
  }

  for (const r of qRows) {
    if (r.num) {
      const n = parseInt(r.num.replace(/\D+/g, ""), 10);
      if (!isNaN(n) && n > 0) nums.push(n);
    }
    nums.push(5099 + r.id);
  }

  const maxUsed = nums.length > 0 ? Math.max(...nums) : 5099;
  return Math.max(maxUsed + 1, 5100);
}

/**
 * Returns a fully-formatted document number string for an invoice or quote,
 * using the custom prefix and starting number from app-settings.
 *
 * Example: "FRZI-5200" or "FRZQ-5200"
 */
export async function getNextDocNumberWithPrefix(type: "invoice" | "quote"): Promise<string> {
  const prefixKey = type === "invoice" ? "invoice_prefix" : "quote_prefix";
  const startKey  = type === "invoice" ? "invoice_start"  : "quote_start";

  const [numericPart, settings] = await Promise.all([
    getNextDocNumber(),
    db.select().from(appSettingsTable),
  ]);

  const prefixRow = settings.find(s => s.key === prefixKey);
  const startRow  = settings.find(s => s.key === startKey);

  const prefix   = prefixRow?.value?.trim() || (type === "invoice" ? "FRZI-" : "FRZQ-");
  const startNum = startRow?.value ? parseInt(startRow.value, 10) : 5100;

  const finalNum = isNaN(startNum) ? numericPart : Math.max(numericPart, startNum);
  return `${prefix}${finalNum}`;
}
