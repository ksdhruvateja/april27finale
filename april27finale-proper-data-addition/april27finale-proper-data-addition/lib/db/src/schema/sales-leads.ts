import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const salesLeadsTable = pgTable("sales_leads", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  mobile: text("mobile"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SalesLead = typeof salesLeadsTable.$inferSelect;
export type InsertSalesLead = typeof salesLeadsTable.$inferInsert;
