import { whatsappSessions, type WhatsappSession, type InsertWhatsappSession } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // WhatsApp session methods
  getSession(id: string): Promise<WhatsappSession | undefined>;
  getSessionByPhoneNumber(phoneNumber: string): Promise<WhatsappSession | undefined>;
  createSession(session: InsertWhatsappSession): Promise<WhatsappSession>;
  updateSession(id: string, updates: Partial<WhatsappSession>): Promise<WhatsappSession | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteSessionByPhoneNumber(phoneNumber: string): Promise<void>;
  getActiveSessions(): Promise<WhatsappSession[]>;
}

export class DatabaseStorage implements IStorage {
  async getSession(id: string): Promise<WhatsappSession | undefined> {
    const [session] = await db.select().from(whatsappSessions).where(eq(whatsappSessions.id, id));
    return session || undefined;
  }

  async getSessionByPhoneNumber(phoneNumber: string): Promise<WhatsappSession | undefined> {
    const [session] = await db.select().from(whatsappSessions).where(eq(whatsappSessions.phoneNumber, phoneNumber));
    return session || undefined;
  }

  async createSession(insertSession: InsertWhatsappSession): Promise<WhatsappSession> {
    const [session] = await db
      .insert(whatsappSessions)
      .values({
        ...insertSession,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return session;
  }

  async updateSession(id: string, updates: Partial<WhatsappSession>): Promise<WhatsappSession | undefined> {
    const [session] = await db
      .update(whatsappSessions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(whatsappSessions.id, id))
      .returning();
    return session || undefined;
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(whatsappSessions).where(eq(whatsappSessions.id, id));
  }

  async deleteSessionByPhoneNumber(phoneNumber: string): Promise<void> {
    await db.delete(whatsappSessions).where(eq(whatsappSessions.phoneNumber, phoneNumber));
  }

  async getActiveSessions(): Promise<WhatsappSession[]> {
    return await db.select().from(whatsappSessions).where(eq(whatsappSessions.isActive, true));
  }
}

export const storage = new DatabaseStorage();
