import { pgTable, text, serial, timestamp, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  emails: jsonb("emails").default([]),
  phone: text("phone"),
  phones: jsonb("phones").default([]),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  billingAddress: jsonb("billing_address"),
  shippingAddress: jsonb("shipping_address"),
  companyAddresses: jsonb("company_addresses").default([]),
  taxExempt: boolean("tax_exempt").notNull().default(false),
  accountType: text("account_type"),
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }),
  salesRep: text("sales_rep"),
  shippingCarrierName: text("shipping_carrier_name"),
  shippingAccountNumber: text("shipping_account_number"),
  taxNumber: text("tax_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
