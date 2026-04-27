import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  movementType: text("movement_type").notNull(), // "in" | "out" | "transfer" | "adjust" | "initial"
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  locationId: integer("location_id"), // source location (null = default)
  toLocationId: integer("to_location_id"), // destination (for transfers)
  referenceId: integer("reference_id"), // linked invoice/PO id
  referenceType: text("reference_type"), // "invoice" | "purchase_order" | "manual"
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStockMovementSchema = createInsertSchema(stockMovementsTable).omit({ id: true, createdAt: true });
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
