import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { EventEmitter } from 'events';
import { storage } from '../storage';
import path from 'path';
import fs from 'fs';

export class WhatsAppService extends EventEmitter {
  private activeSessions = new Map<string, any>();
  private sessionsDir = path.join(process.cwd(), 'sessions');

  constructor() {
    super();
    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  async startQRPairing(sessionId: string, callback: (data: any) => void) {
    try {
      if (this.activeSessions.has(sessionId)) {
        throw new Error('Session already active');
      }

      const sessionPath = path.join(this.sessionsDir, sessionId);
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
      });

      this.activeSessions.set(sessionId, sock);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          callback({
            type: 'qr_code',
            qr,
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
          
          if (shouldReconnect) {
            console.log('Connection closed, reconnecting...');
            // Don't auto-reconnect for pairing sessions
          } else {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Connection logged out');
          }
        } else if (connection === 'open') {
          console.log('WhatsApp connection opened for session:', sessionId);
          this.emit('session_connected', sessionId, {
            jid: sock.user?.id,
            name: sock.user?.name,
          });
        }
      });

      sock.ev.on('creds.update', saveCreds);

      return { success: true, message: 'QR pairing started' };
    } catch (error) {
      console.error('Error starting QR pairing:', error);
      this.emit('session_failed', sessionId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  async requestPairingCode(sessionId: string, phoneNumber: string, callback: (data: any) => void) {
    try {
      if (this.activeSessions.has(sessionId)) {
        throw new Error('Session already active');
      }

      // Clean phone number (remove spaces, dashes, etc.)
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      const sessionPath = path.join(this.sessionsDir, sessionId);
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
      });

      this.activeSessions.set(sessionId, sock);

      // Request pairing code
      const code = await sock.requestPairingCode(cleanPhone);
      
      callback({
        type: 'pairing_code_ready',
        sessionId,
        phoneNumber: cleanPhone,
        timestamp: new Date().toISOString(),
      });

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
          
          if (!shouldReconnect) {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Connection logged out');
          }
        } else if (connection === 'open') {
          console.log('WhatsApp connection opened for session:', sessionId);
          this.emit('session_connected', sessionId, {
            jid: sock.user?.id,
            name: sock.user?.name,
            phoneNumber: cleanPhone,
          });
        }
      });

      sock.ev.on('creds.update', saveCreds);

      return { 
        success: true, 
        message: 'Pairing code requested successfully',
        phoneNumber: cleanPhone 
      };
    } catch (error) {
      console.error('Error requesting pairing code:', error);
      this.emit('session_failed', sessionId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  async submitPairingCode(sessionId: string, code: string, callback: (data: any) => void) {
    try {
      const sock = this.activeSessions.get(sessionId);
      if (!sock) {
        throw new Error('No active session found');
      }

      // The pairing code validation happens automatically through Baileys
      // We just need to wait for the connection update
      callback({
        type: 'pairing_code_submitted',
        sessionId,
        timestamp: new Date().toISOString(),
      });

      return { success: true, message: 'Pairing code submitted' };
    } catch (error) {
      console.error('Error submitting pairing code:', error);
      this.emit('session_failed', sessionId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  async refreshQR(sessionId: string, callback: (data: any) => void) {
    try {
      // Close existing session and start new one
      this.cleanupSession(sessionId);
      return await this.startQRPairing(sessionId, callback);
    } catch (error) {
      console.error('Error refreshing QR:', error);
      throw error;
    }
  }

  cleanupSession(sessionId: string) {
    const sock = this.activeSessions.get(sessionId);
    if (sock) {
      try {
        sock.end();
      } catch (error) {
        console.error('Error ending socket:', error);
      }
      this.activeSessions.delete(sessionId);
    }
  }

  async cleanup() {
    // Cleanup all active sessions
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      this.cleanupSession(sessionId);
    }
  }
}
