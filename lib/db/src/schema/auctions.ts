import { pgTable, text, serial, timestamp, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auctionsTable = pgTable("auctions", {
  id: serial("id").primaryKey(),
  projectName: text("project_name").notNull(),
  bidAmount: numeric("bid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  costAmount: numeric("cost_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  invoiceId: integer("invoice_id"),
  linkedInvoiceIds: jsonb("linked_invoice_ids").default([]),
  purchaseOrderIds: jsonb("purchase_order_ids").default([]),
  shipmentIds: jsonb("shipment_ids").default([]),
  billIds: jsonb("bill_ids").default([]),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAuctionSchema = createInsertSchema(auctionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAuction = z.infer<typeof insertAuctionSchema>;
export type Auction = typeof auctionsTable.$inferSelect;
