import { pgTable, text, serial, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taxRatesTable = pgTable("tax_rates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  rate: numeric("rate", { precision: 5, scale: 2 }).notNull().default("0"),
  country: text("country"),
  region: text("region"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaxRateSchema = createInsertSchema(taxRatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTaxRate = z.infer<typeof insertTaxRateSchema>;
export type TaxRate = typeof taxRatesTable.$inferSelect;
