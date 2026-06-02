/**
 * Normalize Forez document numbers for display and print (FRZQ-5100, FRZI-5234, …).
 */

export type ForezDocKind = "quote" | "invoice" | "estimate" | "po";

const PREFIX: Record<ForezDocKind, string> = {
  quote: "FRZQ",
  invoice: "FRZI",
  estimate: "FRZE",
  po: "FRZPO",
};

export function forezDocFallbackNumber(kind: ForezDocKind, id: number): string {
  const n = Math.max(5100, 5099 + Number(id ?? 0));
  return `${PREFIX[kind]}-${n}`;
}

/** Collapse "FRZQ - 5100" → "FRZQ-5100"; bare "5100" → "FRZQ-5100". */
export function normalizeForezDocNumber(
  raw: string | null | undefined,
  kind: ForezDocKind,
  fallbackId?: number,
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return fallbackId != null ? forezDocFallbackNumber(kind, fallbackId) : "";
  }

  if (/^\d+$/.test(trimmed)) {
    return `${PREFIX[kind]}-${trimmed}`;
  }

  const known = trimmed.match(/^(FRZQ|FRZI|FRZE|FRZPO|FC)\s*[-–]\s*(.+)$/i);
  if (known) {
    const p = known[1].toUpperCase();
    const rest = known[2].trim().replace(/\s+/g, "");
    return p === "FC" ? `FC-${rest}` : `${p}-${rest}`;
  }

  if (/^invoice\s+/i.test(trimmed)) {
    return trimmed.replace(/\s*[-–]\s*/g, "-").replace(/\s{2,}/g, " ");
  }

  return trimmed.replace(/\s*[-–]\s*/g, "-");
}

export function formatQuoteNumber(id: number, stored?: string | null): string {
  return normalizeForezDocNumber(stored, "quote", id);
}

export function formatInvoiceNumber(id: number, stored?: string | null): string {
  return normalizeForezDocNumber(stored, "invoice", id);
}

export function formatEstimateNumber(id: number, stored?: string | null): string {
  return normalizeForezDocNumber(stored, "estimate", id);
}

/** Quote print header — full number, e.g. Order Confirmation FRZQ-5236 */
export function orderConfirmationTitleFromQuoteNumber(quoteNumber: string): string {
  const full = normalizeForezDocNumber(quoteNumber, "quote");
  return `Order Confirmation ${full}`;
}

/** Invoice print title — e.g. Invoice FRZI-5234 or Invoice FC-5234 */
export function invoiceTitleFromNumber(invoiceNumber: string): string {
  const full = normalizeForezDocNumber(invoiceNumber, "invoice");
  if (/^invoice\s+/i.test(full)) return full;
  return `Invoice ${full}`;
}
