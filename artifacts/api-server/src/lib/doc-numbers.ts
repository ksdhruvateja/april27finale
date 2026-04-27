import { db, invoicesTable, quotesTable } from "@workspace/db";

/**
 * Returns the next document number that is guaranteed to be
 * unique across both invoices AND quotes.
 *
 * Strategy:
 *  1. Collect every stored invoiceNumber and quoteNumber.
 *  2. Extract the trailing integer from each (strips any prefix like FC- / QT-).
 *  3. Also account for the legacy front-end display formula:
 *       invoice display = FC-{5099 + invoice.id}
 *       quote display   = QT-{quote.id}
 *     so we include 5099 + max(invoice id) and max(quote id).
 *  4. Return max of all values + 1  (floor at 1001 to avoid low numbers).
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
