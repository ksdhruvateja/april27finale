/**
 * Bulk-import customers, vendors, and products from QuickBooks export files.
 *
 * Usage:
 *   NEON_DATABASE_URL=... node scripts/import-quickbooks.mjs
 *
 * Optional env:
 *   CUSTOMERS_FILE, VENDORS_FILE, PRODUCTS_FILE
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const DEFAULTS = {
  customers:
    process.env.CUSTOMERS_FILE ??
    "C:/Users/bossd/Downloads/Customers.xls",
  vendors:
    process.env.VENDORS_FILE ?? "C:/Users/bossd/Downloads/Vendors.xls",
  products:
    process.env.PRODUCTS_FILE ??
    path.join(
      repoRoot,
      "ProductsServicesList_FOREZ_CORP_6_2_2026 (2).csv",
    ),
};

const url =
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.database_url;

if (!url) {
  console.error("Set NEON_DATABASE_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: process.env.NEON_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function num(v) {
  const n = Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function joinNotes(parts) {
  return parts.filter(Boolean).join("\n") || null;
}

function readXls(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn("Missing file:", filePath);
    return [];
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function readProducts(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn("Missing file:", filePath);
    return [];
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

async function ensureExtrasColumns() {
  const alters = [
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS quickbooks_extras jsonb DEFAULT '{}'::jsonb`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS quickbooks_extras jsonb DEFAULT '{}'::jsonb`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS quickbooks_extras jsonb DEFAULT '{}'::jsonb`,
  ];
  for (const sql of alters) await pool.query(sql);
}

async function existingNames(table, column) {
  const { rows } = await pool.query(
    `SELECT lower(trim(${column})) AS k FROM ${table}`,
  );
  return new Set(rows.map((r) => r.k).filter(Boolean));
}

async function existingSkus() {
  const { rows } = await pool.query(
    `SELECT lower(trim(sku)) AS k FROM products WHERE sku IS NOT NULL AND trim(sku) <> ''`,
  );
  return new Set(rows.map((r) => r.k));
}

async function importCustomers(rows, seen) {
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = str(row.Name) || str(row["Company name"]);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    const company = str(row["Company name"]) || null;
    const openBalance = num(row["Open balance"]);
    const extras = {
      referenceNumber: str(row["Reference #"]) || null,
      openBalance: openBalance ?? null,
      customerType: str(row["Customer type"]) || null,
      attachments: str(row.Attachments) || null,
    };

    const notes = joinNotes([
      str(row["Reference #"]) ? `Reference #: ${row["Reference #"]}` : "",
      openBalance != null ? `QuickBooks Open Balance: $${openBalance.toLocaleString()}` : "",
      str(row.Attachments) ? `Attachments: ${row.Attachments}` : "",
      str(row["Customer type"]) ? `Customer Type: ${row["Customer type"]}` : "",
    ]);

    await pool.query(
      `INSERT INTO customers (
        name, company, email, phone, address, city, state, zip_code, country,
        sales_rep, shipping_account_number, notes, tax_exempt, quickbooks_extras,
        billing_address, emails, phones
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14,$15,$16
      )`,
      [
        name,
        company,
        str(row.Email) || null,
        str(row.Phone) || null,
        str(row["Street Address"]) || null,
        str(row.City) || null,
        str(row.State) || null,
        str(row.Zip) || null,
        str(row.Country) || "US",
        str(row["Sales Rep"]) || null,
        str(row["Shipping Account #"]) || null,
        notes,
        JSON.stringify(extras),
        JSON.stringify({
          address: str(row["Street Address"]) || undefined,
          city: str(row.City) || undefined,
          state: str(row.State) || undefined,
          zipCode: str(row.Zip) || undefined,
          country: str(row.Country) || "US",
        }),
        str(row.Email) ? JSON.stringify([str(row.Email)]) : null,
        str(row.Phone) ? JSON.stringify([str(row.Phone)]) : null,
      ],
    );
    inserted++;
  }
  return { inserted, skipped };
}

async function importVendors(rows, seen) {
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = str(row.Vendor) || str(row["Company name"]);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    const openBalance = num(row["Open Balance"]);
    const extras = {
      vendorQuoteNumber: str(row["Vendor Quote #"]) || null,
      tracking1099: str(row["1099 Tracking"]) || null,
      openBalance: openBalance ?? null,
      attachments: str(row.Attachments) || null,
    };

    const notes = joinNotes([
      str(row["Vendor Quote #"]) ? `Vendor Quote #: ${row["Vendor Quote #"]}` : "",
      str(row["1099 Tracking"]) ? `1099 Tracking: ${row["1099 Tracking"]}` : "",
      openBalance != null ? `QuickBooks Open Balance: $${openBalance.toLocaleString()}` : "",
      str(row.Attachments) ? `Attachments: ${row.Attachments}` : "",
    ]);

    await pool.query(
      `INSERT INTO vendors (
        name, company, email, phone, address, city, state, zip_code, country,
        notes, tax_exempt, quickbooks_extras, billing_address, emails, phones
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,$12,$13,$14
      )`,
      [
        name,
        str(row["Company name"]) || null,
        str(row.Email) || null,
        str(row.Phone) || null,
        str(row["Street Address"]) || null,
        str(row.City) || null,
        str(row.State) || null,
        str(row.Zip) || null,
        str(row.Country) || "US",
        notes,
        JSON.stringify(extras),
        JSON.stringify({
          address: str(row["Street Address"]) || undefined,
          city: str(row.City) || undefined,
          state: str(row.State) || undefined,
          zipCode: str(row.Zip) || undefined,
          country: str(row.Country) || "US",
        }),
        str(row.Email) ? JSON.stringify([str(row.Email)]) : null,
        str(row.Phone) ? JSON.stringify([str(row.Phone)]) : null,
      ],
    );
    inserted++;
  }
  return { inserted, skipped };
}

async function importProducts(rows, seenNames, seenSkus) {
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = str(row["Product/Service Name"]);
    if (!name) continue;

    const sku = str(row.SKU) || null;
    const nameKey = name.toLowerCase();
    const skuKey = sku ? sku.toLowerCase() : null;
    if (seenNames.has(nameKey) || (skuKey && seenSkus.has(skuKey))) {
      skipped++;
      continue;
    }
    seenNames.add(nameKey);
    if (skuKey) seenSkus.add(skuKey);

    const itemType = str(row["Item type"]);
    const isInventory =
      itemType.toLowerCase() !== "non-inventory" &&
      itemType.toLowerCase() !== "service";
    const qty = num(row["Quantity on hand"]) ?? 0;
    const reorder = num(row["Reorder Point"]);
    const salePrice = num(row.Price) ?? 0;
    const costPrice = num(row.Cost) ?? 0;
    const taxable = str(row.Taxable).toLowerCase() === "yes";

    const extras = {
      variantName: str(row["Variant Name"]) || null,
      itemType: itemType || null,
      variantKind: str(row["Single,parent or variant?"]) || null,
      quantityOnHand: qty,
      taxable,
      incomeAccount: str(row["Income Account"]) || null,
      expenseAccount: str(row["Expense Account"]) || null,
      inventoryAssetAccount: str(row["Inventory asset account"]) || null,
      purchaseDescription: str(row["Purchase Description"]) || null,
    };

    const description =
      str(row["Sales Description"]) ||
      str(row["Purchase Description"]) ||
      null;

    const notes = joinNotes([
      itemType ? `Item Type: ${itemType}` : "",
      str(row["Variant Name"]) ? `Variant: ${row["Variant Name"]}` : "",
      str(row["Income Account"]) ? `Income Account: ${row["Income Account"]}` : "",
      str(row["Expense Account"]) ? `Expense Account: ${row["Expense Account"]}` : "",
      str(row["Inventory asset account"])
        ? `Inventory Asset: ${row["Inventory asset account"]}`
        : "",
      taxable ? "Taxable: Yes" : "Taxable: No",
    ]);

    const { rows: insertedRows } = await pool.query(
      `INSERT INTO products (
        name, sku, category, description, sale_price, cost_price, tax_percent,
        discount_percent, discount_amount, min_order_qty, is_inventory_item,
        optimal_stock_min, unit, notes, quickbooks_extras
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,0,0,1,$8,$9,$10,$11,$12
      ) RETURNING id`,
      [
        name,
        sku,
        str(row.Category) || null,
        description,
        String(salePrice),
        String(costPrice),
        taxable ? "8.875" : "0",
        isInventory,
        reorder != null ? Math.round(reorder) : null,
        "ea",
        notes,
        JSON.stringify(extras),
      ],
    );

    const productId = insertedRows[0].id;
    await pool.query(
      `INSERT INTO inventory (product_id, quantity, reorder_point) VALUES ($1, $2, $3)`,
      [productId, String(qty), String(reorder ?? 10)],
    );
    inserted++;
  }
  return { inserted, skipped };
}

async function main() {
  console.log("Ensuring quickbooks_extras columns…");
  await ensureExtrasColumns();

  const customerRows = readXls(DEFAULTS.customers);
  const vendorRows = readXls(DEFAULTS.vendors);
  const productRows = readProducts(DEFAULTS.products);

  console.log(
    `Files: ${customerRows.length} customers, ${vendorRows.length} vendors, ${productRows.length} products`,
  );

  const customerSeen = await existingNames("customers", "name");
  const vendorSeen = await existingNames("vendors", "name");
  const productNameSeen = await existingNames("products", "name");
  const productSkuSeen = await existingSkus();

  const c = await importCustomers(customerRows, customerSeen);
  const v = await importVendors(vendorRows, vendorSeen);
  const p = await importProducts(productRows, productNameSeen, productSkuSeen);

  console.log("Customers:", c);
  console.log("Vendors:", v);
  console.log("Products:", p);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
