import { pgTable, text, serial, timestamp, numeric, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  estimateId: integer("estimate_id"),
  quoteId: integer("quote_id"),
  invoiceNumber: text("invoice_number"),
  trackingNumber: text("tracking_number"),
  status: text("status").notNull().default("draft"),
  lineItems: jsonb("line_items").notNull().default([]),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxTotal: numeric("tax_total", { precision: 12, scale: 2 }).notNull().default("0"),
  discountTotal: numeric("discount_total", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  paymentMethod: text("payment_method"),
  paymentNote: text("payment_note"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  isQuickInvoice: boolean("is_quick_invoice").notNull().default(false),
  salesLead: text("sales_lead"),
  notes: text("notes"),
  internalNote: text("internal_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
