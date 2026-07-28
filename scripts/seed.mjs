/**
 * Seed script — populates all core tables with realistic sample data.
 * Run: node scripts/seed.mjs
 */
import pg from '../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
import { readFileSync } from 'fs';

// Load .env manually
try {
  const env = readFileSync('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
} catch {}

const client = new pg.Client({ connectionString: process.env.NEON_DATABASE_URL });
await client.connect();
console.log('Connected to database');

// ── Tax Rates ────────────────────────────────────────────────────────────────
await client.query(`
  INSERT INTO tax_rates (name, rate, country, region, is_default) VALUES
    ('No Tax',          0.00,  'US', NULL,        false),
    ('Standard (8.5%)', 8.50,  'US', NULL,        true),
    ('CA Sales Tax',    9.25,  'US', 'California', false),
    ('NY Sales Tax',    8.875, 'US', 'New York',   false),
    ('TX Sales Tax',    8.25,  'US', 'Texas',      false)
  ON CONFLICT DO NOTHING
`);
console.log('✓ tax_rates');

// ── Bank Accounts ─────────────────────────────────────────────────────────────
const baResult = await client.query(`
  INSERT INTO bank_accounts (name, account_type, bank_name, account_number, routing_number, opening_balance, current_balance, currency, is_active) VALUES
    ('Main Checking',    'checking', 'Chase Bank',      '****4821', '021000021', 45000.00, 52340.75, 'USD', true),
    ('Business Savings', 'savings',  'Chase Bank',      '****9102', '021000021', 20000.00, 28150.00, 'USD', true),
    ('Petty Cash',       'cash',     NULL,              NULL,       NULL,        500.00,   325.50,   'USD', true),
    ('Payroll Account',  'checking', 'Wells Fargo',     '****3307', '121000248', 15000.00, 12800.00, 'USD', true)
  RETURNING id
`);
const [ba1, ba2] = baResult.rows.map(r => r.id);
console.log('✓ bank_accounts');

// ── Customers ─────────────────────────────────────────────────────────────────
const custResult = await client.query(`
  INSERT INTO customers (name, company, email, phone, address, city, state, zip_code, country, account_type, credit_limit, sales_rep) VALUES
    ('James Hartwell',  'Hartwell Industries',      'james@hartwell.com',    '(212) 555-0101', '123 Commerce Blvd', 'New York',    'NY', '10001', 'US', 'wholesale', 50000.00, 'Sarah Kim'),
    ('Linda Park',      'Park & Associates LLC',    'linda@parkassoc.com',   '(310) 555-0204', '456 Sunset Drive',  'Los Angeles', 'CA', '90028', 'US', 'retail',    15000.00, 'Tom Wright'),
    ('Marcus Webb',     'Webb Construction Co.',    'marcus@webbco.com',     '(713) 555-0319', '789 Industrial Way', 'Houston',   'TX', '77001', 'US', 'wholesale', 75000.00, 'Sarah Kim'),
    ('Priya Sharma',    'Sharma Tech Solutions',    'priya@sharmatech.io',   '(415) 555-0427', '321 Market St',     'San Francisco','CA','94105','US', 'retail',   25000.00, 'Tom Wright'),
    ('Carlos Mendez',   'Mendez Retail Group',      'carlos@mendezretail.com','(305) 555-0532','1010 Biscayne Blvd','Miami',      'FL', '33132', 'US', 'wholesale', 40000.00, 'Sarah Kim'),
    ('Emily Thornton',  'Thornton Hospitality',     'emily@thorntonhotel.com','(702) 555-0641','500 Las Vegas Blvd','Las Vegas',  'NV', '89101', 'US', 'retail',   20000.00, 'Tom Wright'),
    ('David Chen',      'Chen Global Imports',      'david@chenglobal.com',  '(312) 555-0758', '222 Lakeshore Dr',  'Chicago',    'IL', '60601', 'US', 'wholesale', 60000.00, 'Sarah Kim'),
    ('Rachel Green',    'Green Organics Co.',       'rachel@greenorganics.co','(503) 555-0863','88 Farm Road',      'Portland',   'OR', '97201', 'US', 'retail',   10000.00, 'Tom Wright')
  RETURNING id
`);
const custIds = custResult.rows.map(r => r.id);
console.log('✓ customers');

// ── Vendors ───────────────────────────────────────────────────────────────────
const vendResult = await client.query(`
  INSERT INTO vendors (name, company, email, phone, address, city, state, zip_code, country, payment_terms, ein_number) VALUES
    ('Michael Torres',  'Torres Manufacturing',     'mtorres@torresmfg.com', '(614) 555-1001', '500 Factory Lane',  'Columbus',   'OH', '43215', 'US', 'Net 30',  '34-1234567'),
    ('Susan Patel',     'Patel Supplies Inc.',      'susan@patelsupplies.com','(404) 555-1102','77 Warehouse Blvd', 'Atlanta',    'GA', '30301', 'US', 'Net 15',  '58-2345678'),
    ('Kevin Brooks',    'Brooks Logistics',         'kbrooks@brookslog.com', '(214) 555-1203', '300 Distribution Ct','Dallas',   'TX', '75201', 'US', 'Net 30',  '75-3456789'),
    ('Anna Schmidt',    'Schmidt Office Supplies',  'anna@schmidtoffice.com','(513) 555-1304','12 Supply Rd',       'Cincinnati','OH', '45201', 'US', 'Net 10',  '31-4567890'),
    ('Robert Kim',      'Kim Electronics',          'rkim@kimelectronics.com','(408) 555-1405','555 Tech Park',     'San Jose',  'CA', '95101', 'US', 'Net 45',  '94-5678901')
  RETURNING id
`);
const vendIds = vendResult.rows.map(r => r.id);
console.log('✓ vendors');

// ── Products ──────────────────────────────────────────────────────────────────
const prodResult = await client.query(`
  INSERT INTO products (name, sku, category, description, sale_price, cost_price, tax_percent, min_order_qty, is_inventory_item, unit, optimal_stock_min, estimated_lead_days) VALUES
    ('Industrial Widget A',   'WGT-A-001', 'Widgets',      'Heavy-duty industrial widget, grade A',          125.00,  68.00, 8.50, 10, true,  'ea',  50, 7),
    ('Industrial Widget B',   'WGT-B-002', 'Widgets',      'Standard industrial widget, grade B',             89.00,  45.00, 8.50,  5, true,  'ea',  75, 5),
    ('Steel Bracket Set',     'STL-BRK-10','Hardware',     'Set of 10 steel mounting brackets',               45.00,  22.00, 8.50, 20, true,  'set', 100, 3),
    ('Premium Lubricant 1L',  'LUB-P-1L',  'Maintenance',  'Food-grade lubricant, 1 litre bottle',            28.50,  12.00, 8.50, 12, true,  'ea',  60, 2),
    ('Circuit Board Type X',  'CB-X-301',  'Electronics',  'Custom circuit board, PCB type X',               220.00, 115.00, 8.50,  5, true,  'ea',  30, 14),
    ('Safety Helmet ANSI',    'SAF-HLM-A', 'Safety',       'ANSI-rated safety helmet, adjustable',            32.00,  14.50, 0.00, 24, true,  'ea',  80, 5),
    ('Packaging Box 12x12',   'PKG-12-12', 'Packaging',    'Corrugated box, 12"x12"x12"',                      3.50,   1.20, 0.00, 50, true,  'ea', 200, 2),
    ('Consulting - Hourly',   'SVC-CONS-H','Services',     'Professional consulting services, per hour',     150.00,   0.00, 0.00,  1, false, 'hr',   0, 0),
    ('Installation Service',  'SVC-INST',  'Services',     'On-site installation service, flat rate',        350.00,   0.00, 0.00,  1, false, 'job',  0, 0),
    ('Shipping & Handling',   'SHP-HNDL',  'Fees',         'Standard shipping and handling fee',              25.00,   0.00, 0.00,  1, false, 'ea',   0, 0)
  RETURNING id
`);
const prodIds = prodResult.rows.map(r => r.id);
console.log('✓ products');

// ── Inventory ─────────────────────────────────────────────────────────────────
const inventoryRows = [
  [prodIds[0], 87, 50], [prodIds[1], 134, 75], [prodIds[2], 212, 100],
  [prodIds[3], 58,  60], [prodIds[4],  23,  30], [prodIds[5], 145,  80],
  [prodIds[6], 380, 200],
];
for (const [pid, qty, rp] of inventoryRows) {
  await client.query(
    `INSERT INTO inventory (product_id, quantity, reorder_point) VALUES ($1, $2, $3)`,
    [pid, qty, rp]
  );
}
console.log('✓ inventory');

// ── Sales Leads ───────────────────────────────────────────────────────────────
await client.query(`
  INSERT INTO sales_leads (first_name, last_name, email, mobile) VALUES
    ('Tyler',   'Mason',    'tyler.mason@prospect.com',   '(917) 555-2001'),
    ('Natalie', 'Flores',   'nflores@startupco.io',       '(415) 555-2102'),
    ('George',  'Nakamura', 'george.n@nakamura-corp.com', '(206) 555-2203'),
    ('Zoe',     'Williams', 'zoe@zwilliams.biz',          '(646) 555-2304'),
    ('Aaron',   'Okafor',   'aaron.o@okafor-group.com',   '(832) 555-2405')
  ON CONFLICT DO NOTHING
`);
console.log('✓ sales_leads');

// ── Helper: date offset ───────────────────────────────────────────────────────
const daysAgo = d => new Date(Date.now() - d * 86400000).toISOString();
const daysFromNow = d => new Date(Date.now() + d * 86400000).toISOString();

// ── Invoices ──────────────────────────────────────────────────────────────────
const invoices = [
  { cid: custIds[0], num: 'INV-1001', status: 'paid',    li: [{ productId: prodIds[0], description: 'Industrial Widget A', qty: 20, unitPrice: 125.00, taxPercent: 8.5, discount: 0, total: 2500.00 }, { productId: prodIds[8], description: 'Installation Service', qty: 1, unitPrice: 350.00, taxPercent: 0, discount: 0, total: 350.00 }], sub: 2850.00, tax: 242.25, disc: 0,     tot: 3092.25, due: daysFromNow(0),  paid: daysAgo(5),  note: 'Thank you for your business!' },
  { cid: custIds[1], num: 'INV-1002', status: 'sent',    li: [{ productId: prodIds[1], description: 'Industrial Widget B', qty: 15, unitPrice: 89.00, taxPercent: 8.5, discount: 5, total: 1335.00 }, { productId: prodIds[2], description: 'Steel Bracket Set', qty: 10, unitPrice: 45.00, taxPercent: 8.5, discount: 0, total: 450.00 }], sub: 1785.00, tax: 151.73, disc: 66.75, tot: 1869.98, due: daysFromNow(15), paid: null,       note: 'Net 30 terms' },
  { cid: custIds[2], num: 'INV-1003', status: 'paid',    li: [{ productId: prodIds[4], description: 'Circuit Board Type X', qty: 5, unitPrice: 220.00, taxPercent: 8.5, discount: 0, total: 1100.00 }], sub: 1100.00, tax: 93.50,  disc: 0,     tot: 1193.50, due: daysAgo(10),   paid: daysAgo(12), note: null },
  { cid: custIds[3], num: 'INV-1004', status: 'draft',   li: [{ productId: prodIds[7], description: 'Consulting - Hourly', qty: 8, unitPrice: 150.00, taxPercent: 0, discount: 0, total: 1200.00 }, { productId: prodIds[3], description: 'Premium Lubricant 1L', qty: 24, unitPrice: 28.50, taxPercent: 8.5, discount: 0, total: 684.00 }], sub: 1884.00, tax: 58.14,  disc: 0,     tot: 1942.14, due: daysFromNow(30), paid: null,       note: 'Pending review' },
  { cid: custIds[4], num: 'INV-1005', status: 'overdue', li: [{ productId: prodIds[5], description: 'Safety Helmet ANSI', qty: 50, unitPrice: 32.00, taxPercent: 0, discount: 10, total: 1600.00 }, { productId: prodIds[6], description: 'Packaging Box 12x12', qty: 200, unitPrice: 3.50, taxPercent: 0, discount: 0, total: 700.00 }], sub: 2300.00, tax: 0,       disc: 230,   tot: 2070.00, due: daysAgo(7),    paid: null,       note: 'Payment overdue — please remit immediately' },
  { cid: custIds[5], num: 'INV-1006', status: 'sent',    li: [{ productId: prodIds[7], description: 'Consulting', qty: 6, unitPrice: 150.00, taxPercent: 8.5, discount: 0, total: 900.00 }], sub: 950.00,  tax: 80.75,  disc: 0,     tot: 1030.75, due: daysFromNow(20), paid: null,       note: null },
  { cid: custIds[6], num: 'INV-1007', status: 'paid',    li: [{ productId: prodIds[8], description: 'Installation Service', qty: 1, unitPrice: 350.00, taxPercent: 0, discount: 0, total: 350.00 }, { productId: prodIds[9], description: 'Shipping & Handling', qty: 1, unitPrice: 25.00, taxPercent: 0, discount: 0, total: 25.00 }], sub: 500.00,  tax: 0,       disc: 0,     tot: 500.00,  due: daysAgo(3),    paid: daysAgo(1),  note: 'Recurring service' },
  { cid: custIds[7], num: 'INV-1008', status: 'draft',   li: [{ productId: prodIds[3], description: 'Premium Lubricant 1L', qty: 10, unitPrice: 28.50, taxPercent: 8.5, discount: 0, total: 285.00 }], sub: 312.50, tax: 26.56,  disc: 0,     tot: 339.06,  due: daysFromNow(25), paid: null,       note: null },
];
for (const inv of invoices) {
  await client.query(
    `INSERT INTO invoices (customer_id, invoice_number, status, line_items, subtotal, tax_total, discount_total, total, due_date, payment_method, paid_at, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [inv.cid, inv.num, inv.status, JSON.stringify(inv.li), inv.sub, inv.tax, inv.disc, inv.tot, inv.due, inv.paid ? 'check' : null, inv.paid, inv.note]
  );
}
console.log('✓ invoices');

// ── Estimates ─────────────────────────────────────────────────────────────────
const estimates = [
  { cid: custIds[0], status: 'sent',     li: [{ productId: prodIds[0], description: 'Industrial Widget A', qty: 28, unitPrice: 125.00, taxPercent: 8.5, discount: 0, total: 3500.00 }], sub: 3500.00, tax: 297.50, disc: 0, tot: 3797.50, note: 'Valid for 30 days' },
  { cid: custIds[2], status: 'draft',    li: [{ productId: prodIds[7], description: 'Consulting', qty: 8, unitPrice: 150.00, taxPercent: 0, discount: 0, total: 1200.00 }], sub: 1200.00, tax: 0, disc: 0, tot: 1200.00, note: 'Awaiting customer approval' },
  { cid: custIds[4], status: 'approved', li: [{ productId: prodIds[4], description: 'Circuit Board Type X', qty: 20, unitPrice: 220.00, taxPercent: 8.5, discount: 0, total: 4400.00 }, { productId: prodIds[8], description: 'Installation', qty: 4, unitPrice: 350.00, taxPercent: 0, discount: 0, total: 1400.00 }], sub: 5600.00, tax: 374.00, disc: 0, tot: 5974.00, note: 'Approved — ready to invoice' },
  { cid: custIds[6], status: 'declined', li: [{ productId: prodIds[5], description: 'Safety Helmet ANSI', qty: 25, unitPrice: 32.00, taxPercent: 8.5, discount: 0, total: 800.00 }], sub: 800.00, tax: 68.00, disc: 0, tot: 868.00, note: 'Customer went with competitor' },
];
for (const est of estimates) {
  await client.query(
    `INSERT INTO estimates (customer_id, status, line_items, subtotal, tax_total, discount_total, total, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [est.cid, est.status, JSON.stringify(est.li), est.sub, est.tax, est.disc, est.tot, est.note]
  );
}
console.log('✓ estimates');

// ── Purchase Orders ───────────────────────────────────────────────────────────
const purchaseOrders = [
  { vid: vendIds[0], status: 'sent',     li: [{ productId: prodIds[0], description: 'Industrial Widget A', qty: 50, unitPrice: 68.00, taxPercent: 8.5, total: 3400.00 }],                                                                                                                                                                                                  sub: 3400.00, tax: 289.00,  tot: 3689.00, seq: 1001, note: 'Urgent restock — Widget A',     exp: daysFromNow(7)  },
  { vid: vendIds[3], status: 'received', li: [{ productId: prodIds[6], description: 'Packaging Box', qty: 500, unitPrice: 1.20, taxPercent: 8.5, total: 600.00 }, { productId: prodIds[3], description: 'Lubricant 1L', qty: 50, unitPrice: 12.00, taxPercent: 8.5, total: 600.00 }, { productId: prodIds[5], description: 'Safety Helmet', qty: 20, unitPrice: 14.50, taxPercent: 0, total: 290.00 }], sub: 1250.00, tax: 106.25, tot: 1356.25, seq: 1002, note: 'Monthly office supplies order', exp: daysAgo(2)      },
  { vid: vendIds[4], status: 'draft',    li: [{ productId: prodIds[4], description: 'Circuit Board X', qty: 25, unitPrice: 115.00, taxPercent: 8.5, total: 2875.00 }, { productId: prodIds[4], description: 'Circuit Board X v2', qty: 25, unitPrice: 115.00, taxPercent: 8.5, total: 2875.00 }],                                                                         sub: 5750.00, tax: 489.38,  tot: 6239.38, seq: 1003, note: 'Q3 electronics procurement',    exp: daysFromNow(21) },
  { vid: vendIds[1], status: 'approved', li: [{ productId: prodIds[5], description: 'Safety Helmet ANSI', qty: 40, unitPrice: 14.50, taxPercent: 0, total: 580.00 }, { productId: prodIds[3], description: 'Lubricant', qty: 16, unitPrice: 12.50, taxPercent: 0, total: 200.00 }],                                                                                          sub: 780.00,  tax: 0,       tot: 780.00,  seq: 1004, note: 'Safety equipment restocking',   exp: daysFromNow(5)  },
  { vid: vendIds[0], status: 'sent',     li: [{ productId: prodIds[1], description: 'Industrial Widget B', qty: 50, unitPrice: 45.00, taxPercent: 8.5, total: 2250.00 }],                                                                                                                                                                                                  sub: 2250.00, tax: 191.25,  tot: 2441.25, seq: 1005, note: 'Widget B bulk order',           exp: daysFromNow(10) },
];
const poIds = [];
for (const po of purchaseOrders) {
  const r = await client.query(
    `INSERT INTO purchase_orders (vendor_id, status, line_items, subtotal, tax_total, total, po_sequence, notes, expected_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [po.vid, po.status, JSON.stringify(po.li), po.sub, po.tax, po.tot, po.seq, po.note, po.exp]
  );
  poIds.push(r.rows[0].id);
}
console.log('✓ purchase_orders');

// ── Bills ─────────────────────────────────────────────────────────────────────
const bills = [
  { vid: vendIds[3], poid: poIds[1], status: 'paid',    li: [{ description: 'Monthly office supplies', qty: 1, unitPrice: 1250.00, taxPercent: 8.5, total: 1250.00 }],  sub: 3689.00, tax: 289.00, tot: 3978.00, due: daysAgo(20),   pm: 'check',         paid: daysAgo(18), ba: ba1,  note: 'PO-1002 — monthly supplies' },
  { vid: vendIds[0], poid: null,     status: 'unpaid',  li: [{ description: 'Freight & handling', qty: 1, unitPrice: 1500.00, taxPercent: 8.5, total: 1500.00 }],         sub: 1500.00, tax: 127.50, tot: 1627.50, due: daysFromNow(12), pm: null,            paid: null,        ba: null, note: 'Freight charges — Torres Mfg' },
  { vid: vendIds[1], poid: poIds[3], status: 'unpaid',  li: [{ description: 'Safety equipment', qty: 1, unitPrice: 2441.25, taxPercent: 0, total: 2441.25 }],             sub: 2441.25, tax: 0,      tot: 2441.25, due: daysFromNow(8),  pm: null,            paid: null,        ba: null, note: 'Safety equipment invoice' },
  { vid: vendIds[4], poid: null,     status: 'paid',    li: [{ description: 'Software license', qty: 1, unitPrice: 850.00, taxPercent: 8.5, total: 850.00 }],             sub: 850.00,  tax: 72.25,  tot: 922.25,  due: daysAgo(5),    pm: 'bank_transfer', paid: daysAgo(3),  ba: ba1,  note: 'Software licensing annual renewal' },
  { vid: vendIds[0], poid: null,     status: 'overdue', li: [{ description: 'Raw materials — overdue', qty: 1, unitPrice: 620.00, taxPercent: 8.5, total: 620.00 }],     sub: 620.00,  tax: 52.70,  tot: 672.70,  due: daysAgo(15),   pm: null,            paid: null,        ba: null, note: 'Overdue — please process payment' },
];
for (const b of bills) {
  await client.query(
    `INSERT INTO bills (vendor_id, purchase_order_id, status, line_items, subtotal, tax_total, total, due_date, payment_method, paid_at, bank_account_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [b.vid, b.poid, b.status, JSON.stringify(b.li), b.sub, b.tax, b.tot, b.due, b.pm, b.paid, b.ba, b.note]
  );
}
console.log('✓ bills');

// ── Expenses ──────────────────────────────────────────────────────────────────
const expenses = [
  { date: daysAgo(28), desc: 'Monthly office rent — July',         cat: 'Rent/Lease',     amt: 3500.00, vid: null,       pm: 'bank_transfer', ba: ba1,  ref: 'RENT-JUL-2026'   },
  { date: daysAgo(22), desc: 'Electricity bill',                    cat: 'Utilities',      amt: 285.40,  vid: null,       pm: 'check',         ba: ba1,  ref: 'UTIL-ELEC-0726'  },
  { date: daysAgo(21), desc: 'Internet & phone services',           cat: 'Utilities',      amt: 189.00,  vid: null,       pm: 'bank_transfer', ba: ba1,  ref: 'UTIL-NET-0726'   },
  { date: daysAgo(18), desc: 'Business insurance premium',          cat: 'Insurance',      amt: 1200.00, vid: null,       pm: 'bank_transfer', ba: ba1,  ref: 'INS-BIZ-Q3'      },
  { date: daysAgo(15), desc: 'Employee training materials',         cat: 'Office Supplies',amt: 340.00,  vid: vendIds[3], pm: 'credit_card',   ba: null, ref: null               },
  { date: daysAgo(12), desc: 'Sales conference travel — Sarah Kim', cat: 'Travel',         amt: 875.00,  vid: null,       pm: 'credit_card',   ba: null, ref: 'TRAVEL-SKM-0726' },
  { date: daysAgo(10), desc: 'Accounting software subscription',    cat: 'Software',       amt: 149.00,  vid: vendIds[4], pm: 'credit_card',   ba: null, ref: 'ACCT-SW-JUL'     },
  { date: daysAgo(8),  desc: 'Fuel & vehicle maintenance',          cat: 'Travel',         amt: 220.50,  vid: null,       pm: 'credit_card',   ba: null, ref: null               },
  { date: daysAgo(6),  desc: 'Promotional materials printing',      cat: 'Marketing',      amt: 510.00,  vid: null,       pm: 'check',         ba: ba2,  ref: null               },
  { date: daysAgo(5),  desc: 'Office cleaning service',             cat: 'Maintenance',    amt: 250.00,  vid: null,       pm: 'check',         ba: ba1,  ref: 'CLEAN-JUL'       },
  { date: daysAgo(3),  desc: 'Postage & shipping supplies',         cat: 'Shipping',       amt: 88.25,   vid: null,       pm: 'credit_card',   ba: null, ref: null               },
  { date: daysAgo(1),  desc: 'Bank service charges',                cat: 'Bank Charges',   amt: 45.00,   vid: null,       pm: null,            ba: ba1,  ref: 'BANK-CHG-0726'   },
];
for (const e of expenses) {
  await client.query(
    `INSERT INTO expenses (date, description, category, amount, vendor_id, payment_method, bank_account_id, reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [e.date, e.desc, e.cat, e.amt, e.vid, e.pm, e.ba, e.ref]
  );
}
console.log('✓ expenses');

await client.end();
console.log('\n✅ Seed complete — database is populated with sample data.');
