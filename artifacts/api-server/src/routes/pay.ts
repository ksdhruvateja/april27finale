import { Router } from "express";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, invoicesTable, customersTable } from "@workspace/db";
import { getStripeSecretKey } from "../lib/stripe-config";

const router = Router();

/** Ensure the invoice has a payment token, generating one if needed. Returns the token. */
async function ensurePaymentToken(invoiceId: number): Promise<string> {
  const [inv] = await db.select({ id: invoicesTable.id, paymentToken: invoicesTable.paymentToken }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!inv) throw new Error("Invoice not found");
  if (inv.paymentToken) return inv.paymentToken;

  const token = randomBytes(32).toString("hex");
  await db.update(invoicesTable).set({ paymentToken: token }).where(eq(invoicesTable.id, invoiceId));
  return token;
}

/**
 * GET /api/pay/:token
 * Public endpoint — no authentication required.
 * Returns invoice details for the customer-facing payment page.
 */
router.get("/pay/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token || token.length < 32) {
    res.status(400).json({ error: "Invalid payment token" });
    return;
  }

  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.paymentToken, token));
  if (!inv) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const [customer] = await db.select({ name: customersTable.name, email: customersTable.email, phone: customersTable.phone }).from(customersTable).where(eq(customersTable.id, inv.customerId));

  // Return public-safe fields only (no internalNote)
  res.json({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber ?? `INV-${inv.id}`,
    status: inv.status,
    customerName: customer?.name ?? "Valued Customer",
    customerEmail: customer?.email ?? null,
    lineItems: inv.lineItems,
    subtotal: Number(inv.subtotal),
    taxTotal: Number(inv.taxTotal),
    discountTotal: Number(inv.discountTotal),
    total: Number(inv.total),
    dueDate: inv.dueDate ?? null,
    notes: inv.notes ?? null,
    createdAt: inv.createdAt,
    paidAt: inv.paidAt ?? null,
  });
});

/**
 * POST /api/pay/:token/checkout
 * Public endpoint — creates a Stripe Checkout Session for the invoice.
 * Returns { url } for redirect.
 */
router.post("/pay/:token/checkout", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token || token.length < 32) {
    res.status(400).json({ error: "Invalid payment token" });
    return;
  }

  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.paymentToken, token));
  if (!inv) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  if (inv.status === "paid") {
    res.status(400).json({ error: "Invoice is already paid" });
    return;
  }

  const secretKey = await getStripeSecretKey();
  if (!secretKey) {
    res.status(503).json({ error: "Online payment is not configured. Please contact us to arrange payment." });
    return;
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secretKey);

  const amountCents = Math.round(Number(inv.total) * 100);
  const invoiceNum = inv.invoiceNumber ?? `INV-${inv.id}`;

  // Build origin — the pay page itself
  const origin = req.headers.origin ?? `${req.protocol}://${req.get("host")}`;
  const baseUrl = origin.endsWith("/") ? origin.slice(0, -1) : origin;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `Invoice ${invoiceNum} — Forez Corp`,
            description: `Payment for invoice ${invoiceNum}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      invoiceId: String(inv.id),
      customerId: String(inv.customerId),
      invoiceNumber: invoiceNum,
      paymentToken: token,
    },
    success_url: `${baseUrl}/pay/${token}?payment=success`,
    cancel_url: `${baseUrl}/pay/${token}?payment=cancelled`,
  });

  res.json({ url: session.url });
});

/**
 * POST /api/invoices/:id/share-link
 * Internal (dashboard) endpoint — generates/returns the shareable payment token and URL.
 */
router.post("/invoices/:id/share-link", async (req, res): Promise<void> => {
  const invoiceId = Number(req.params.id);
  if (!invoiceId) {
    res.status(400).json({ error: "Invalid invoice ID" });
    return;
  }

  const [inv] = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!inv) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const token = await ensurePaymentToken(invoiceId);
  const origin = req.headers.origin ?? `${req.protocol}://${req.get("host")}`;
  const baseUrl = origin.endsWith("/") ? origin.slice(0, -1) : origin;

  res.json({ token, url: `${baseUrl}/pay/${token}` });
});

export default router;
