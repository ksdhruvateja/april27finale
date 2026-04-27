import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryLocationsTable = pgTable("inventory_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryLocationSchema = createInsertSchema(inventoryLocationsTable).omit({ id: true, createdAt: true });
export type InsertInventoryLocation = z.infer<typeof insertInventoryLocationSchema>;
export type InventoryLocation = typeof inventoryLocationsTable.$inferSelect;
