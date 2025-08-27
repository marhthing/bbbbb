import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: varchar("id").primaryKey(),
  sessionData: jsonb("session_data"),
  phoneNumber: text("phone_number"),
  status: text("status").notNull().default("pending"), // pending, connected, failed, disconnected
  pairingMethod: text("pairing_method"), // qr, code
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  connectedAt: timestamp("connected_at"),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertWhatsappSessionSchema = createInsertSchema(whatsappSessions).pick({
  id: true,
  phoneNumber: true,
  pairingMethod: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type WhatsappSession = typeof whatsappSessions.$inferSelect;
export type InsertWhatsappSession = z.infer<typeof insertWhatsappSessionSchema>;
