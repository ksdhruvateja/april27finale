import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  objectPath: text("object_path").notNull(),
  category: text("category").default("general"),
  description: text("description"),
  tags: text("tags").array().default([]),
  uploadedBy: text("uploaded_by"),
  starred: boolean("starred").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
