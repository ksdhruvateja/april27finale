import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const plaidItemsTable = pgTable("plaid_items", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  institutionLogo: text("institution_logo"),
  institutionColor: text("institution_color"),
  cursor: text("cursor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PlaidItem = typeof plaidItemsTable.$inferSelect;
