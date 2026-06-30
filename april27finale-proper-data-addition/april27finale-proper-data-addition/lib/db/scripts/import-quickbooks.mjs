/**
 * Bulk-import or sync customers, vendors, and products from QuickBooks export files.
 *
 * Usage:
 *   NEON_DATABASE_URL=... node scripts/import-quickbooks.mjs
 *
 * Optional env:
 *   CUSTOMERS_FILE, VENDORS_FILE, PRODUCTS_FILE
 *   IMPORT_MODE=upsert (default) | insert-only
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
    path.join(repoRoot, "Customers.xls"),
  vendors:
    process.env.VENDORS_FILE ?? path.join(repoRoot, "Vendors.xls"),
  products:
    process.env.PRODUCTS_FILE ??
    path.join(repoRoot, "ProductsServicesList_FOREZ_CORP_6_2_2026 (2).csv"),
};

const UPSERT = (process.env.IMPORT_MODE ?? "upsert") !== "insert-only";

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

function readSheet(filePath) {
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
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS estimated_lead_days integer`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS optimal_stock_min integer`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS phones jsonb DEFAULT '[]'::jsonb`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_terms text`,
  ];
  for (const sql of alters) await pool.query(sql);
}

async function loadIdMap(table, column) {
  const { rows } = await pool.query(
    `SELECT id, lower(trim(${column})) AS k FROM ${table} WHERE trim(${column}) <> ''`,
  );
  return new Map(rows.map((r) => [r.k, r.id]));
}

async function loadProductIdMap() {
  const { rows } = await pool.query(
    `SELECT id, lower(trim(name)) AS name_key, lower(trim(sku)) AS sku_key FROM products`,
  );
  const byName = new Map();
  const bySku = new Map();
  for (const r of rows) {
    if (r.name_key) byName.set(r.name_key, r.id);
    if (r.sku_key) bySku.set(r.sku_key, r.id);
  }
  return { byName, bySku };
}

function customerPayload(row) {
  const name = str(row.Name) || str(row["Company name"]);
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
  return {
    name,
    values: [
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
  };
}

async function syncCustomers(rows, idByName) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { name, values } = customerPayload(row);
    if (!name) continue;
    const key = name.toLowerCase();
    const existingId = idByName.get(key);

    if (existingId && UPSERT) {
      await pool.query(
        `UPDATE customers SET
          name=$1, company=$2, email=$3, phone=$4, address=$5, city=$6, state=$7,
          zip_code=$8, country=$9, sales_rep=$10, shipping_account_number=$11,
          notes=$12, quickbooks_extras=$13, billing_address=$14, emails=$15, phones=$16,
          updated_at=now()
        WHERE id=$17`,
        [...values, existingId],
      );
      updated++;
      continue;
    }

    if (existingId) {
      skipped++;
      continue;
    }

    const { rows: created } = await pool.query(
      `INSERT INTO customers (
        name, company, email, phone, address, city, state, zip_code, country,
        sales_rep, shipping_account_number, notes, tax_exempt, quickbooks_extras,
        billing_address, emails, phones
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14,$15,$16)
      RETURNING id`,
      values,
    );
    idByName.set(key, created[0].id);
    inserted++;
  }
  return { inserted, updated, skipped };
}

function vendorPayload(row) {
  const name = str(row.Vendor) || str(row["Company name"]);
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
  return {
    name,
    values: [
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
  };
}

async function syncVendors(rows, idByName) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { name, values } = vendorPayload(row);
    if (!name) continue;
    const key = name.toLowerCase();
    const existingId = idByName.get(key);

    if (existingId && UPSERT) {
      await pool.query(
        `UPDATE vendors SET
          name=$1, company=$2, email=$3, phone=$4, address=$5, city=$6, state=$7,
          zip_code=$8, country=$9, notes=$10, quickbooks_extras=$11,
          billing_address=$12, emails=$13, phones=$14, updated_at=now()
        WHERE id=$15`,
        [...values, existingId],
      );
      updated++;
      continue;
    }

    if (existingId) {
      skipped++;
      continue;
    }

    const { rows: created } = await pool.query(
      `INSERT INTO vendors (
        name, company, email, phone, address, city, state, zip_code, country,
        notes, tax_exempt, quickbooks_extras, billing_address, emails, phones
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,$12,$13,$14)
      RETURNING id`,
      values,
    );
    idByName.set(key, created[0].id);
    inserted++;
  }
  return { inserted, updated, skipped };
}

function productPayload(row) {
  const name = str(row["Product/Service Name"]);
  const sku = str(row.SKU) || null;
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
    str(row["Sales Description"]) || str(row["Purchase Description"]) || null;
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

  return {
    name,
    sku,
    nameKey: name.toLowerCase(),
    skuKey: sku ? sku.toLowerCase() : null,
    productValues: [
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
    qty,
    reorder: reorder ?? 10,
  };
}

async function syncProducts(rows, { byName, bySku }) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const p = productPayload(row);
    if (!p.name) continue;

    const existingId =
      (p.skuKey && bySku.get(p.skuKey)) || byName.get(p.nameKey) || null;

    if (existingId && UPSERT) {
      await pool.query(
        `UPDATE products SET
          name=$1, sku=$2, category=$3, description=$4, sale_price=$5, cost_price=$6,
          tax_percent=$7, is_inventory_item=$8, optimal_stock_min=$9, unit=$10,
          notes=$11, quickbooks_extras=$12, updated_at=now()
        WHERE id=$13`,
        [...p.productValues, existingId],
      );
      await pool.query(
        `UPDATE inventory SET quantity=$1, reorder_point=$2, updated_at=now()
         WHERE product_id=$3`,
        [String(p.qty), String(p.reorder), existingId],
      );
      updated++;
      continue;
    }

    if (existingId) {
      skipped++;
      continue;
    }

    const { rows: insertedRows } = await pool.query(
      `INSERT INTO products (
        name, sku, category, description, sale_price, cost_price, tax_percent,
        discount_percent, discount_amount, min_order_qty, is_inventory_item,
        optimal_stock_min, unit, notes, quickbooks_extras
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,1,$8,$9,$10,$11,$12)
      RETURNING id`,
      p.productValues,
    );
    const productId = insertedRows[0].id;
    await pool.query(
      `INSERT INTO inventory (product_id, quantity, reorder_point) VALUES ($1,$2,$3)`,
      [productId, String(p.qty), String(p.reorder)],
    );
    byName.set(p.nameKey, productId);
    if (p.skuKey) bySku.set(p.skuKey, productId);
    inserted++;
  }
  return { inserted, updated, skipped };
}

async function main() {
  console.log(`Mode: ${UPSERT ? "upsert (insert + update)" : "insert-only"}`);
  console.log("Ensuring schema columns…");
  await ensureExtrasColumns();

  const customerRows = readSheet(DEFAULTS.customers);
  const vendorRows = readSheet(DEFAULTS.vendors);
  const productRows = readSheet(DEFAULTS.products);

  console.log("Files:");
  console.log("  customers:", DEFAULTS.customers, `(${customerRows.length} rows)`);
  console.log("  vendors:", DEFAULTS.vendors, `(${vendorRows.length} rows)`);
  console.log("  products:", DEFAULTS.products, `(${productRows.length} rows)`);

  const customerIds = await loadIdMap("customers", "name");
  const vendorIds = await loadIdMap("vendors", "name");
  const productIds = await loadProductIdMap();

  const c = await syncCustomers(customerRows, customerIds);
  const v = await syncVendors(vendorRows, vendorIds);
  const p = await syncProducts(productRows, productIds);

  const { rows: counts } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM customers) AS customers,
      (SELECT count(*)::int FROM vendors) AS vendors,
      (SELECT count(*)::int FROM products) AS products
  `);

  console.log("Customers:", c);
  console.log("Vendors:", v);
  console.log("Products:", p);
  console.log("Database totals:", counts[0]);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
