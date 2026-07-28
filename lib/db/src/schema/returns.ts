import { pgTable, text, serial, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const returnsTable = pgTable("returns_refunds", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("return"),
  customerId: integer("customer_id").notNull(),
  invoiceId: integer("invoice_id"),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  lineItems: jsonb("line_items").notNull().default([]),
  refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }),
  refundMethod: text("refund_method"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  usedByInvoiceId: integer("used_by_invoice_id"),
  notes: text("notes"),
  internalNote: text("internal_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertReturnSchema = createInsertSchema(returnsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReturn = z.infer<typeof insertReturnSchema>;
export type Return = typeof returnsTable.$inferSelect;
