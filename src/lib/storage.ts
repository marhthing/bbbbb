import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { whatsappSessions, type WhatsappSession, type InsertWhatsappSession } from "./schema";

export class Storage {
  async createSession(data: InsertWhatsappSession): Promise<WhatsappSession> {
    const [session] = await db
      .insert(whatsappSessions)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return session;
  }

  async getSession(id: string): Promise<WhatsappSession | null> {
    const [session] = await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.id, id))
      .limit(1);
    return session || null;
  }

  async getSessionByPhoneNumber(phoneNumber: string): Promise<WhatsappSession | null> {
    const [session] = await db
      .select()
      .from(whatsappSessions)
      .where(
        and(
          eq(whatsappSessions.phoneNumber, phoneNumber),
          eq(whatsappSessions.isActive, true)
        )
      )
      .limit(1);
    return session || null;
  }

  async updateSession(id: string, updates: Partial<WhatsappSession>): Promise<WhatsappSession> {
    const [session] = await db
      .update(whatsappSessions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(whatsappSessions.id, id))
      .returning();
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    await db
      .update(whatsappSessions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(whatsappSessions.id, id));
  }

  async getAllSessions(): Promise<WhatsappSession[]> {
    return await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.isActive, true));
  }
}

export const storage = new Storage();