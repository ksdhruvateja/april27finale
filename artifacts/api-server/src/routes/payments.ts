import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, paymentsTable, invoicesTable, customersTable } from "@workspace/db";

const router = Router();

/* GET /api/payments — list payments, filterable by customerId or invoiceId */
router.get("/payments", async (req, res): Promise<void> => {
  const customerId = req.query.customerId ? Number(req.query.customerId) : null;
  const invoiceId  = req.query.invoiceId  ? Number(req.query.invoiceId)  : null;

  let query = db
    .select({
      id: paymentsTable.id,
      invoiceId: paymentsTable.invoiceId,
      customerId: paymentsTable.customerId,
      amountCents: paymentsTable.amountCents,
      currency: paymentsTable.currency,
      method: paymentsTable.method,
      stripePaymentIntentId: paymentsTable.stripePaymentIntentId,
      stripeChargeId: paymentsTable.stripeChargeId,
      stripeCheckoutSessionId: paymentsTable.stripeCheckoutSessionId,
      note: paymentsTable.note,
      paidAt: paymentsTable.paidAt,
      createdAt: paymentsTable.createdAt,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerName: customersTable.name,
    })
    .from(paymentsTable)
    .leftJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .leftJoin(customersTable, eq(paymentsTable.customerId, customersTable.id))
    .orderBy(desc(paymentsTable.paidAt))
    .$dynamic();

  if (customerId) query = query.where(eq(paymentsTable.customerId, customerId)) as typeof query;
  if (invoiceId)  query = query.where(eq(paymentsTable.invoiceId, invoiceId))  as typeof query;

  const rows = await query;
  res.json(rows.map(r => ({
    ...r,
    amount: r.amountCents / 100,
  })));
});

/* POST /api/invoices/:id/payment-link — create Stripe Checkout Session */
router.post("/invoices/:id/payment-link", async (req, res): Promise<void> => {
  const invoiceId = Number(req.params.id);
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(503).json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY to environment secrets." });
    return;
  }

  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const amountCents = Math.round(Number(inv.total) * 100);
  const invoiceNum = inv.invoiceNumber ?? `INV-${invoiceId}`;

  const origin = req.headers.origin ?? `${req.protocol}://${req.get("host")}`;

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
      invoiceId: String(invoiceId),
      customerId: String(inv.customerId),
      invoiceNumber: invoiceNum,
    },
    success_url: `${origin}/dashboard?payment=success&invoice=${invoiceId}`,
    cancel_url: `${origin}/dashboard?payment=cancelled&invoice=${invoiceId}`,
  });

  res.json({ url: session.url, sessionId: session.id });
});

/* POST /api/invoices/:id/payment-intent — create Payment Intent for Stripe Elements */
router.post("/invoices/:id/payment-intent", async (req, res): Promise<void> => {
  const invoiceId = Number(req.params.id);
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(503).json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY to environment secrets." });
    return;
  }

  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const amountCents = Math.round(Number(inv.total) * 100);

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    metadata: {
      invoiceId: String(invoiceId),
      customerId: String(inv.customerId),
      invoiceNumber: inv.invoiceNumber ?? `INV-${invoiceId}`,
    },
    automatic_payment_methods: { enabled: true },
  });

  res.json({
    clientSecret: intent.client_secret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
    amountCents,
  });
});

/* POST /api/stripe/webhook — handle Stripe webhook events */
router.post("/stripe/webhook", async (req, res): Promise<void> => {
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event: import("stripe").Stripe.Event;
  try {
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      // No webhook secret — trust the payload directly (dev mode)
      event = req.body as import("stripe").Stripe.Event;
    }
  } catch (err: any) {
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    return;
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "payment_intent.succeeded"
  ) {
    let invoiceId: number | null = null;
    let customerId: number | null = null;
    let amountCents: number = 0;
    let stripePaymentIntentId: string | null = null;
    let stripeChargeId: string | null = null;
    let stripeCheckoutSessionId: string | null = null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as import("stripe").Stripe.Checkout.Session;
      invoiceId  = session.metadata?.invoiceId  ? Number(session.metadata.invoiceId)  : null;
      customerId = session.metadata?.customerId ? Number(session.metadata.customerId) : null;
      amountCents = session.amount_total ?? 0;
      stripeCheckoutSessionId = session.id;
      stripePaymentIntentId   = typeof session.payment_intent === "string" ? session.payment_intent : null;
    } else {
      const intent = event.data.object as import("stripe").Stripe.PaymentIntent;
      invoiceId  = intent.metadata?.invoiceId  ? Number(intent.metadata.invoiceId)  : null;
      customerId = intent.metadata?.customerId ? Number(intent.metadata.customerId) : null;
      amountCents = intent.amount_received ?? intent.amount ?? 0;
      stripePaymentIntentId = intent.id;
      stripeChargeId = intent.latest_charge ? String(intent.latest_charge) : null;
    }

    if (invoiceId && customerId) {
      // Insert payment record
      await db.insert(paymentsTable).values({
        invoiceId,
        customerId,
        amountCents,
        currency: "usd",
        method: "stripe",
        stripePaymentIntentId,
        stripeChargeId,
        stripeCheckoutSessionId,
        note: "Stripe online payment",
        paidAt: new Date(),
      });

      // Mark invoice as paid
      await db.update(invoicesTable).set({
        status: "paid",
        paymentMethod: "stripe",
        paymentNote: stripePaymentIntentId ?? stripeCheckoutSessionId ?? undefined,
        paidAt: new Date(),
      }).where(eq(invoicesTable.id, invoiceId));
    }
  }

  res.json({ received: true });
});

export default router;
