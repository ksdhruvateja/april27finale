import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const EXPENSE_CATEGORIES = [
  "Office Supplies", "Utilities", "Rent/Lease", "Salaries", "Marketing",
  "Travel", "Insurance", "Equipment", "Software", "Shipping", "Maintenance",
  "Professional Services", "Taxes & Licenses", "Bank Charges", "Miscellaneous",
];

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  description: text("description").notNull(),
  category: text("category"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  vendorId: integer("vendor_id"),
  paymentMethod: text("payment_method"),
  bankAccountId: integer("bank_account_id"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
