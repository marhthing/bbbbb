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

      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;
        console.log('Connection update:', { connection, qr: !!qr, receivedPendingNotifications });

        if (qr) {
          callback({
            type: 'qr_code',
            qr,
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }

        if (connection === 'connecting') {
          callback({
            type: 'connecting',
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }

        if (connection === 'open') {
          console.log('WhatsApp connection opened for session:', sessionId);
          
          // Send confirmation message with session ID
          this.sendSessionConfirmation(sock, sessionId);
          
          this.emit('session_connected', sessionId, {
            jid: sock.user?.id,
            name: sock.user?.name,
          });
          return;
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log('Connection closed with status:', statusCode);
          
          // Handle the forced disconnect after QR scan (restartRequired)
          if (statusCode === DisconnectReason.restartRequired) {
            console.log('Restart required after QR scan - this is normal, restarting...');
            callback({
              type: 'restart_required',
              sessionId,
              timestamp: new Date().toISOString(),
            });
            
            // Clean up current session and restart
            this.cleanupSession(sessionId);
            
            // Restart the pairing process after a short delay
            setTimeout(() => {
              this.startQRPairing(sessionId, callback).catch(error => {
                console.error('Error restarting QR pairing:', error);
                this.emit('session_failed', sessionId, 'Failed to restart after QR scan');
              });
            }, 1000);
            return;
          }
          
          // Handle logout
          if (statusCode === DisconnectReason.loggedOut) {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Connection logged out');
            return;
          }
          
          // Handle other disconnects
          console.log('Connection closed, will retry if needed...');
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

      // Clean phone number (remove spaces, dashes, etc.) and ensure proper format
      let cleanPhone = phoneNumber.replace(/\D/g, '');
      // Remove leading 0 if present and country code isn't included
      if (cleanPhone.startsWith('0') && cleanPhone.length > 10) {
        cleanPhone = cleanPhone.substring(1);
      }
      // Ensure UK numbers have proper country code
      if (cleanPhone.startsWith('7') && cleanPhone.length === 11) {
        cleanPhone = '44' + cleanPhone;
      }
      console.log('Cleaned phone number:', cleanPhone);
      
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

      // Set up connection event handler
      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, isNewLogin } = update;

        console.log('Pairing connection update:', { 
          connection, 
          hasUser: !!sock.user, 
          isRegistered: sock.authState?.creds?.registered,
          isNewLogin 
        });

        if (connection === 'connecting') {
          callback({
            type: 'connecting',
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }

        // Only consider fully authenticated when connection is open AND user exists
        if (connection === 'open' && sock.user) {
          console.log('WhatsApp pairing connection fully authenticated for session:', sessionId);
          console.log('User info:', sock.user);
          
          this.emit('session_connected', sessionId, {
            jid: sock.user.id,
            name: sock.user.name,
            phoneNumber: cleanPhone,
          });
          
          // Send confirmation message
          this.sendSessionConfirmation(sock, sessionId);
          return;
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log('Pairing connection closed with status:', statusCode);
          
          if (statusCode === DisconnectReason.loggedOut) {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Connection logged out');
          } else if (statusCode === DisconnectReason.restartRequired) {
            console.log('Restart required for pairing - waiting for reconnection...');
            // Don't emit success yet, wait for the restart to complete
          } else {
            console.log('Connection closed unexpectedly');
            this.emit('session_failed', sessionId, 'Connection failed');
          }
        }
      });

      // Wait for connection to be ready and then request pairing code
      let pairingCodeRequested = false;
      
      const requestPairingCodeWhenReady = async () => {
        if (pairingCodeRequested) return;
        
        try {
          console.log('Requesting pairing code for phone:', cleanPhone);
          
          // Wait a moment for connection to stabilize
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const code = await sock.requestPairingCode(cleanPhone);
          pairingCodeRequested = true;
          
          console.log('Pairing code generated successfully:', code);
          console.log('Phone number used:', cleanPhone);
          
          callback({
            type: 'pairing_code_ready',
            sessionId,
            phoneNumber: cleanPhone,
            code: code,
            timestamp: new Date().toISOString(),
          });
          
          // Log instructions for user
          console.log('='.repeat(50));
          console.log('PAIRING CODE INSTRUCTIONS:');
          console.log('1. Open WhatsApp on your phone');
          console.log('2. Go to Settings → Linked Devices');
          console.log('3. Tap "Link a Device"');
          console.log('4. Choose "Link with phone number instead"');
          console.log(`5. Enter this code: ${code}`);
          console.log('='.repeat(50));
          
        } catch (error) {
          console.error('Error generating pairing code:', error);
          throw error;
        }
      };

      // Request pairing code when connection is ready
      const checkAndRequestCode = async () => {
        if (!pairingCodeRequested && !sock.authState.creds.registered) {
          try {
            await requestPairingCodeWhenReady();
          } catch (error) {
            console.error('Failed to request pairing code:', error);
            // Try again after delay
            setTimeout(checkAndRequestCode, 2000);
          }
        }
      };

      // Start checking after initial connection
      setTimeout(checkAndRequestCode, 2000);

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

  async sendSessionConfirmation(sock: any, sessionId: string) {
    try {
      // Get user's own JID (their WhatsApp number)
      const userJid = sock.user?.id;
      if (!userJid) {
        console.log('No user JID available for session confirmation');
        return;
      }

      // Template message - you can edit this later
      const confirmationMessage = `🔗 *WhatsApp Session Linked Successfully!*

✅ Your session has been created and saved securely.

📋 *Session Details:*
• Session ID: \`${sessionId}\`
• Connected: ${new Date().toLocaleString()}
• Status: Active

🤖 *What's Next?*
Your bot can now use this session to send and receive messages. The session is safely stored and ready for use.

---
*This is an automated confirmation message.*`;

      // Send message to user's own number
      await sock.sendMessage(userJid, { text: confirmationMessage });
      console.log('Session confirmation sent to:', userJid);
    } catch (error) {
      console.error('Error sending session confirmation:', error);
      // Don't throw error - this is optional functionality
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
