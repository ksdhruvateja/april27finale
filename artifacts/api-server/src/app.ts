import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { stripeWebhookHandler } from "./routes/stripe.js";

const app: Express = express();

/* ── Security headers (helmet) ──────────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: false, // dashboard inlines styles; tune per-route if needed
    crossOriginEmbedderPolicy: false,
  }),
);

/* ── CORS ───────────────────────────────────────────────────────────────── */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
]);

// Railway injects RAILWAY_PUBLIC_DOMAIN for the service's public URL
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  ALLOWED_ORIGINS.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||                                    // same-origin / server-to-server
        ALLOWED_ORIGINS.has(origin) ||
        /\.replit\.dev$/.test(origin) ||
        /\.replit\.app$/.test(origin) ||
        /\.repl\.co$/.test(origin) ||
        /\.up\.railway\.app$/.test(origin) ||         // Railway preview domains
        /\.railway\.app$/.test(origin)                // Railway custom domains
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

/* ── Request logging ────────────────────────────────────────────────────── */
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

/* ── Stripe webhook (raw body — must be BEFORE express.json) ────────────── */
// Stripe requires the raw request body to verify the signature.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

/* ── Body parsing ───────────────────────────────────────────────────────── */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

/* ── Static dashboard (production build) ───────────────────────────────── */
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

/* ── API landing (no credentials exposed) ──────────────────────────────── */
app.get(
  hasDashboardBuild ? ["/api", "/api/"] : ["/", "/api", "/api/"],
  (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>QuickBoo API</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:40px 48px;max-width:420px;text-align:center}
    h1{font-size:24px;font-weight:700;color:#f8fafc;margin-bottom:10px}
    p{font-size:14px;color:#94a3b8;line-height:1.6}
    .badge{display:inline-block;background:#22c55e;color:#052e16;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;margin-bottom:18px}
    code{background:#0f172a;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:13px;color:#38bdf8}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">LIVE</div>
    <h1>⚡ QuickBoo API</h1>
    <p>All endpoints require authentication.<br/>Sign in via <code>POST /api/auth/login</code>.</p>
  </div>
</body>
</html>`);
  },
);

/* ── Routes ─────────────────────────────────────────────────────────────── */
app.use("/api", router);

/* ── SPA fallback ───────────────────────────────────────────────────────── */
if (hasDashboardBuild) {
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(dashboardDistPath, "index.html"));
  });
}

export default app;
