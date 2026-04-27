import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, plaidItemsTable } from "@workspace/db";
import { z } from "zod";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  TransferType,
  TransferNetwork,
  ACHClass,
} from "plaid";

const router = Router();

// ─── Plaid client factory ─────────────────────────────────────────────────────
function getClient(): PlaidApi | null {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret   = process.env.PLAID_SECRET;
  const env      = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  if (!clientId || !secret) return null;
  const config = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } },
  });
  return new PlaidApi(config);
}

const isConfigured = () => !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);

// ─── Status ──────────────────────────────────────────────────────────────────
router.get("/plaid/status", async (_req, res): Promise<void> => {
  if (!isConfigured()) {
    res.json({ configured: false, itemCount: 0 });
    return;
  }
  const items = await db.select().from(plaidItemsTable);
  res.json({ configured: true, itemCount: items.length });
});

// ─── Create Link Token ────────────────────────────────────────────────────────
router.post("/plaid/create-link-token", async (_req, res): Promise<void> => {
  const client = getClient();
  if (!client) { res.status(503).json({ error: "Plaid not configured" }); return; }
  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: "quickboo-user-1" },
      client_name: "QuickBoo",
      products: [Products.Transactions, Products.Auth],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    res.json({ linkToken: response.data.link_token });
  } catch (err: any) {
    const msg = err?.response?.data?.error_message ?? err?.message ?? "Plaid error";
    res.status(500).json({ error: msg });
  }
});

// ─── Exchange Public Token ────────────────────────────────────────────────────
const ExchangeBody = z.object({
  publicToken: z.string(),
  institutionId: z.string().optional(),
  institutionName: z.string().optional(),
  institutionLogo: z.string().optional().nullable(),
  institutionColor: z.string().optional().nullable(),
});

router.post("/plaid/exchange-token", async (req, res): Promise<void> => {
  const client = getClient();
  if (!client) { res.status(503).json({ error: "Plaid not configured" }); return; }
  const parsed = ExchangeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const { publicToken, institutionId, institutionName, institutionLogo, institutionColor } = parsed.data;
  try {
    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken });
    const { access_token, item_id } = exchange.data;
    const existing = await db.select().from(plaidItemsTable).where(eq(plaidItemsTable.itemId, item_id));
    if (existing.length > 0) {
      await db.update(plaidItemsTable).set({ accessToken: access_token, institutionId, institutionName, institutionLogo, institutionColor }).where(eq(plaidItemsTable.itemId, item_id));
    } else {
      await db.insert(plaidItemsTable).values({ itemId: item_id, accessToken: access_token, institutionId, institutionName, institutionLogo, institutionColor });
    }
    res.json({ success: true, itemId: item_id });
  } catch (err: any) {
    const msg = err?.response?.data?.error_message ?? err?.message ?? "Exchange failed";
    res.status(500).json({ error: msg });
  }
});

// ─── List Items (connected institutions) ─────────────────────────────────────
router.get("/plaid/items", async (_req, res): Promise<void> => {
  const items = await db.select().from(plaidItemsTable).orderBy(plaidItemsTable.createdAt);
  res.json(items.map(i => ({
    id: i.id,
    itemId: i.itemId,
    institutionId: i.institutionId,
    institutionName: i.institutionName,
    institutionLogo: i.institutionLogo,
    institutionColor: i.institutionColor,
    createdAt: i.createdAt,
  })));
});

// ─── Get Accounts with Live Balances ────────────────────────────────────────
router.get("/plaid/accounts", async (_req, res): Promise<void> => {
  const client = getClient();
  if (!client) { res.status(503).json({ error: "Plaid not configured" }); return; }
  const items = await db.select().from(plaidItemsTable);
  try {
    const allAccounts = await Promise.all(
      items.map(async item => {
        const r = await client.accountsBalanceGet({ access_token: item.accessToken });
        return r.data.accounts.map(acct => ({
          itemId: item.itemId,
          institutionName: item.institutionName,
          institutionLogo: item.institutionLogo,
          institutionColor: item.institutionColor,
          accountId: acct.account_id,
          name: acct.name,
          officialName: acct.official_name,
          type: acct.type,
          subtype: acct.subtype,
          mask: acct.mask,
          balanceCurrent: acct.balances.current,
          balanceAvailable: acct.balances.available,
          balanceLimit: acct.balances.limit,
          isoCurrencyCode: acct.balances.iso_currency_code,
        }));
      })
    );
    res.json(allAccounts.flat());
  } catch (err: any) {
    const msg = err?.response?.data?.error_message ?? err?.message ?? "Balance fetch failed";
    res.status(500).json({ error: msg });
  }
});

// ─── Get Transactions ─────────────────────────────────────────────────────────
const TxQuery = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get("/plaid/transactions", async (req, res): Promise<void> => {
  const client = getClient();
  if (!client) { res.status(503).json({ error: "Plaid not configured" }); return; }
  const { startDate, endDate } = TxQuery.parse(req.query);
  const now = new Date();
  const end = endDate ?? now.toISOString().slice(0, 10);
  const start = startDate ?? new Date(now.setMonth(now.getMonth() - 3)).toISOString().slice(0, 10);
  const items = await db.select().from(plaidItemsTable);
  try {
    const allTx = await Promise.all(
      items.map(async item => {
        const r = await client.transactionsGet({
          access_token: item.accessToken,
          start_date: start,
          end_date: end,
          options: { count: 250, offset: 0 },
        });
        return r.data.transactions.map(tx => ({
          transactionId: tx.transaction_id,
          accountId: tx.account_id,
          itemId: item.itemId,
          institutionName: item.institutionName,
          institutionLogo: item.institutionLogo,
          name: tx.name,
          merchantName: tx.merchant_name,
          amount: tx.amount,
          date: tx.date,
          category: tx.category,
          pending: tx.pending,
          paymentChannel: tx.payment_channel,
          logoUrl: tx.logo_url,
          personalFinanceCategory: tx.personal_finance_category?.primary,
        }));
      })
    );
    res.json(allTx.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  } catch (err: any) {
    const msg = err?.response?.data?.error_message ?? err?.message ?? "Transaction fetch failed";
    res.status(500).json({ error: msg });
  }
});

// ─── ACH Transfer ─────────────────────────────────────────────────────────────
const TransferBody = z.object({
  accountId: z.string(),
  itemId: z.string(),
  amount: z.string(),
  description: z.string(),
  type: z.enum(["debit", "credit"]).default("debit"),
});

router.post("/plaid/transfer", async (req, res): Promise<void> => {
  const client = getClient();
  if (!client) { res.status(503).json({ error: "Plaid not configured" }); return; }
  const parsed = TransferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid transfer body" }); return; }
  const { accountId, itemId, amount, description, type } = parsed.data;
  const [item] = await db.select().from(plaidItemsTable).where(eq(plaidItemsTable.itemId, itemId));
  if (!item) { res.status(404).json({ error: "Linked account not found" }); return; }
  try {
    const authRes = await client.transferAuthorizationCreate({
      access_token: item.accessToken,
      account_id: accountId,
      type: type as TransferType,
      network: TransferNetwork.Ach,
      amount,
      ach_class: ACHClass.Ppd,
      user: { legal_name: "QuickBoo User" },
    });
    const authId = authRes.data.authorization.id;
    const txRes = await client.transferCreate({
      authorization_id: authId,
      description,
    });
    res.json({ success: true, transfer: txRes.data.transfer });
  } catch (err: any) {
    const msg = err?.response?.data?.error_message ?? err?.message ?? "Transfer failed";
    res.status(500).json({ error: msg });
  }
});

// ─── Remove Item (disconnect bank) ───────────────────────────────────────────
router.delete("/plaid/items/:id", async (req, res): Promise<void> => {
  const client = getClient();
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [item] = await db.select().from(plaidItemsTable).where(eq(plaidItemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (client) {
    try { await client.itemRemove({ access_token: item.accessToken }); } catch { /* best effort */ }
  }
  await db.delete(plaidItemsTable).where(eq(plaidItemsTable.id, id));
  res.json({ success: true });
});

export default router;
