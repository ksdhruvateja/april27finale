import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const USER_ROLES = ["developer", "admin", "sales", "shipper", "accountant", "viewer", "custom"] as const;
export type UserRole = typeof USER_ROLES[number];

export const appUsersTable = pgTable("app_users", {
  id:                serial("id").primaryKey(),
  email:             text("email").notNull().unique(),
  name:              text("name"),
  role:              text("role").notNull().default("viewer"),
  passwordHash:      text("password_hash"),
  customPermissions: text("custom_permissions"),
  invitedBy:         text("invited_by"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({ id: true, createdAt: true });
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;
