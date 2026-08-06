import { Router } from "express";
import Stripe from "stripe";
import { db, invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
}

/* ── POST /stripe/create-checkout ───────────────────────────────────────── */
router.post("/stripe/create-checkout", async (req, res): Promise<void> => {
  const { invoiceId, amount, description, customerEmail, customerName } = req.body as {
    invoiceId: number;
    amount: number;
    description?: string;
    customerEmail?: string | null;
    customerName?: string | null;
  };

  if (!invoiceId || !amount) {
    res.status(400).json({ error: "invoiceId and amount are required" });
    return;
  }

  try {
    const stripe = getStripe();

    // Build success / cancel URLs from env or request origin
    const origin =
      (req.headers.origin as string) ||
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:3000");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(amount) * 100), // convert to cents
            product_data: {
              name: description || `Invoice #${String(invoiceId).padStart(4, "0")}`,
              ...(customerName ? { description: `Customer: ${customerName}` } : {}),
            },
          },
        },
      ],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      metadata: {
        invoiceId: String(invoiceId),
        customerName: customerName ?? "",
      },
      success_url: `${origin}/invoices`,
      cancel_url:  `${origin}/invoices`,
    });

    res.json({ sessionId: session.id, checkoutUrl: session.url });
  } catch (err: any) {
    const isConfig = err.message?.includes("STRIPE_SECRET_KEY");
    res.status(isConfig ? 503 : 500).json({ error: err.message });
  }
});

/* ── GET /stripe/session-status?sessionId=cs_xxx ───────────────────────── */
router.get("/stripe/session-status", async (req, res): Promise<void> => {
  const sessionId = String(req.query.sessionId ?? "");
  if (!sessionId) {
    res.status(400).json({ error: "sessionId query param required" });
    return;
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    const paid = session.payment_status === "paid";
    const pi = session.payment_intent as Stripe.PaymentIntent | null | string;
    const transactionId = typeof pi === "string" ? pi : (pi?.id ?? session.id);

    res.json({
      status: session.payment_status,
      paid,
      transactionId: paid ? transactionId : null,
      invoiceId: session.metadata?.invoiceId ? Number(session.metadata.invoiceId) : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

/* ── Webhook handler (exported separately — mounted with raw body in app.ts) ── */
export async function stripeWebhookHandler(
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    // Webhook secret not configured — silently acknowledge so Stripe doesn't retry
    res.json({ received: true, note: "webhook secret not configured" });
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, secret);
  } catch (err: any) {
    res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.CheckoutSession;
    if (session.payment_status === "paid") {
      const invoiceId = session.metadata?.invoiceId ? Number(session.metadata.invoiceId) : null;
      if (invoiceId) {
        const pi = session.payment_intent;
        const txId = typeof pi === "string" ? pi : (pi?.id ?? session.id);
        const note = `Transaction ID: ${txId} | Stripe Session: ${session.id}`;

        // Check if not already paid (idempotency guard)
        const [inv] = await db.select({ status: invoicesTable.status }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
        if (inv && inv.status !== "paid") {
          await db
            .update(invoicesTable)
            .set({
              status: "paid",
              paidAt: new Date(),
              paymentMethod: "stripe",
              paymentNote: note,
            } as any)
            .where(eq(invoicesTable.id, invoiceId));
        }
      }
    }
  }

  res.json({ received: true });
}
