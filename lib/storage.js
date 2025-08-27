import { whatsappSessions } from "../shared/schema.js";
import { db } from "./db.js";
import { eq } from "drizzle-orm";

export class DatabaseStorage {
  async getSession(id) {
    const [session] = await db.select().from(whatsappSessions).where(eq(whatsappSessions.id, id));
    return session || undefined;
  }

  async getSessionByPhoneNumber(phoneNumber) {
    const [session] = await db.select().from(whatsappSessions).where(eq(whatsappSessions.phoneNumber, phoneNumber));
    return session || undefined;
  }

  async createSession(insertSession) {
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

  async updateSession(id, updates) {
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

  async deleteSession(id) {
    await db.delete(whatsappSessions).where(eq(whatsappSessions.id, id));
  }

  async deleteSessionByPhoneNumber(phoneNumber) {
    await db.delete(whatsappSessions).where(eq(whatsappSessions.phoneNumber, phoneNumber));
  }

  async getActiveSessions() {
    return await db.select().from(whatsappSessions).where(eq(whatsappSessions.isActive, true));
  }
}

export const storage = new DatabaseStorage();