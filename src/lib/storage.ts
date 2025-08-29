import { eq, and, sql } from "drizzle-orm";
import { db } from "./db";
import { whatsappSessions, users, type WhatsappSession, type InsertWhatsappSession, type User } from "./schema";

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

  // User management methods
  async getUserByUsername(username: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return user || null;
  }

  async getUserById(id: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user || null;
  }

  async createUser(username: string, hashedPassword: string): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        username,
        password: hashedPassword,
      })
      .returning();
    return user;
  }

  // Admin methods
  async getSessionStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    disconnected: number;
    failed: number;
  }> {
    const allSessions = await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.isActive, true));

    const stats = {
      total: allSessions.length,
      active: allSessions.filter(s => s.status === 'connected').length,
      pending: allSessions.filter(s => s.status === 'pending').length,
      disconnected: allSessions.filter(s => s.status === 'disconnected').length,
      failed: allSessions.filter(s => s.status === 'failed').length,
    };

    return stats;
  }

  async getAllSessionsForAdmin(): Promise<WhatsappSession[]> {
    return await db
      .select()
      .from(whatsappSessions)
      .where(eq(whatsappSessions.isActive, true))
      .orderBy(sql`${whatsappSessions.createdAt} DESC`);
  }
}

export const storage = new Storage();