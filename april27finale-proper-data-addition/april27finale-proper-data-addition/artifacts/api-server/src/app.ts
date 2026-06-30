import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const isProd = process.env.NODE_ENV === "production";

app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(
  cors({
    origin: allowedOrigin
      ? (origin, cb) => {
          if (!origin || origin === allowedOrigin) cb(null, true);
          else cb(new Error("Not allowed by CORS"));
        }
      : true,
    credentials: true,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes before trying again." },
  skip: () => !isProd,
});
app.use("/api/auth/login", authLimiter);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  skip: () => !isProd,
});
app.use("/api", apiLimiter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

const dashboardDistPath = path.resolve(
  process.cwd(),
  "artifacts",
  "dashboard",
  "dist",
  "public",
);
const hasDashboardBuild = existsSync(dashboardDistPath);

if (hasDashboardBuild) {
  app.use(express.static(dashboardDistPath));
}

app.get(hasDashboardBuild ? ["/api", "/api/"] : ["/", "/api", "/api/"], (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Team Forez Corp API</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    header { background: #1e293b; border-bottom: 1px solid #334155; padding: 20px 32px; display: flex; align-items: center; gap: 14px; }
    header h1 { font-size: 22px; font-weight: 700; color: #f8fafc; }
    .badge { background: #22c55e; color: #052e16; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
    .container { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .info-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 18px 20px; }
    .info-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 6px; }
    .info-card .value { font-size: 15px; font-weight: 600; color: #f1f5f9; }
    .info-card code { font-family: 'Menlo', monospace; font-size: 13px; color: #38bdf8; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 12px; }
    .endpoints { display: grid; gap: 8px; margin-bottom: 32px; }
    .ep { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
    .ep:hover { border-color: #475569; }
    .method { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 5px; min-width: 50px; text-align: center; font-family: monospace; }
    .get  { background: #0c4a6e; color: #38bdf8; }
    .post { background: #14532d; color: #4ade80; }
    .ep-path { font-family: 'Menlo', monospace; font-size: 13px; color: #cbd5e1; flex: 1; }
    .ep-desc { font-size: 12px; color: #64748b; }
    .section { margin-bottom: 32px; }
    .creds { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 18px 20px; }
    .creds p { font-size: 13px; color: #94a3b8; margin-bottom: 8px; }
    .creds code { background: #0f172a; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #e2e8f0; font-size: 13px; }
  </style>
</head>
<body>
  <header>
    <h1>⚡ Team Forez Corp API</h1>
    <span class="badge">LIVE</span>
  </header>
  <div class="container">
    <div class="info-grid">
      <div class="info-card">
        <div class="label">Base URL</div>
        <div class="value"><code>/api</code></div>
      </div>
      <div class="info-card">
        <div class="label">Health Check</div>
        <div class="value"><code>/api/healthz</code></div>
      </div>
      <div class="info-card">
        <div class="label">Auth Endpoint</div>
        <div class="value"><code>POST /api/auth/login</code></div>
      </div>
      <div class="info-card">
        <div class="label">Database</div>
        <div class="value">PostgreSQL + Drizzle ORM</div>
      </div>
    </div>

    <div class="section">
      <h2>Default Credentials</h2>
      <div class="creds">
        <p>Credentials are managed in the <strong>Users</strong> section of the dashboard.</p>
        <p style="margin:0">Contact your administrator for login details.</p>
      </div>
    </div>

    <div class="section">
      <h2>Core Resources</h2>
      <div class="endpoints">
        ${[
          ["GET/POST", "get", "/api/customers", "Customer management"],
          ["GET/POST", "get", "/api/vendors", "Vendor management"],
          ["GET/POST", "get", "/api/products", "Product catalog"],
          ["GET/POST", "get", "/api/invoices", "Invoices + payment"],
          ["GET/POST", "get", "/api/bills", "Bills + ACH/check payment"],
          ["GET/POST", "get", "/api/quotes", "Quotes → invoice conversion"],
          ["GET/POST", "get", "/api/estimates", "Estimates → invoice conversion"],
          ["GET/POST", "get", "/api/purchase-orders", "POs → bill conversion"],
          ["GET/POST", "get", "/api/inventory", "Inventory levels"],
          ["GET/POST", "get", "/api/shipments", "Shipment tracking"],
          ["GET/POST", "get", "/api/expenses", "Expense tracking"],
          ["GET/POST", "get", "/api/bank-accounts", "Bank accounts"],
          ["GET/POST", "get", "/api/tax-rates", "Tax rates (US states auto-seeded)"],
          ["GET/POST", "get", "/api/sales-leads", "Sales leads"],
          ["GET/POST", "get", "/api/users", "User management"],
        ].map(([m, cls, path, desc]) => `
        <div class="ep">
          <span class="method ${cls}">${m}</span>
          <span class="ep-path">${path}</span>
          <span class="ep-desc">${desc}</span>
        </div>`).join("")}
      </div>
    </div>

    <div class="section">
      <h2>Dashboard &amp; Accounting</h2>
      <div class="endpoints">
        ${[
          ["/api/dashboard/stats", "Cash flow, AR/AP, counts"],
          ["/api/accounting/general-ledger", "Full transaction ledger"],
          ["/api/accounting/ar-aging", "Accounts receivable aging"],
          ["/api/accounting/ap-aging", "Accounts payable aging"],
          ["/api/accounting/pnl", "Profit &amp; loss report"],
          ["/api/accounting/customer-revenue", "Revenue by customer"],
          ["/api/accounting/product-profit", "Profitability by product"],
        ].map(([path, desc]) => `
        <div class="ep">
          <span class="method get">GET</span>
          <span class="ep-path">${path}</span>
          <span class="ep-desc">${desc}</span>
        </div>`).join("")}
      </div>
    </div>
  </div>
</body>
</html>`);
});

app.use("/api", router);

if (hasDashboardBuild) {
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(dashboardDistPath, "index.html"));
  });
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  const status = typeof err.status === "number" ? err.status : 500;
  const message = isProd
    ? status >= 500 ? "An internal server error occurred." : err.message
    : err.message ?? "Unknown error";
  res.status(status).json({ error: message });
});

export default app;
