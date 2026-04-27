import { pgTable, text, serial, timestamp, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const estimatesTable = pgTable("estimates", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  quoteId: integer("quote_id"),
  status: text("status").notNull().default("draft"),
  lineItems: jsonb("line_items").notNull().default([]),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxTotal: numeric("tax_total", { precision: 12, scale: 2 }).notNull().default("0"),
  discountTotal: numeric("discount_total", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  internalNote: text("internal_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEstimateSchema = createInsertSchema(estimatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimatesTable.$inferSelect;
