import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";

/**
 * Immutable ledger of every payment event in the system.
 * Written atomically together with the status update on the source record
 * (invoice or bill) so the owe is only reduced if the record is created.
 */
export const transactionsTable = pgTable("transactions", {
  id:              serial("id").primaryKey(),

  // What kind of payment
  type:            text("type").notNull(), // "invoice_payment" | "bill_payment"

  // Source document
  sourceId:        integer("source_id").notNull(),
  sourceRef:       text("source_ref").notNull(),  // "INV-0001" | "BILL-0001"

  // Counter-party
  entityId:        integer("entity_id"),           // customerId or vendorId
  entityName:      text("entity_name"),

  // Money
  amount:          numeric("amount", { precision: 12, scale: 2 }).notNull(),

  // How it was paid
  paymentMethod:   text("payment_method").notNull(),
  referenceNumber: text("reference_number"),  // check #, external tx id, card auth, etc.
  bankAccountId:   integer("bank_account_id"),

  // Notes
  note:            text("note"),

  // Timestamps — paidAt is set by the caller (= the moment the DB update fires)
  paidAt:          timestamp("paid_at", { withTimezone: true }).notNull(),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
