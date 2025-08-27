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
      
      // Clear existing session data to start fresh
      if (fs.existsSync(sessionPath)) {
        console.log('Clearing existing session data for fresh pairing...');
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', '22.04.4'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 120_000,
        keepAliveIntervalMs: 45_000,
        connectTimeoutMs: 60_000,
        qrTimeout: 120_000,
        retryRequestDelayMs: 2000,
        maxMsgRetryCount: 3,
        emitOwnEvents: false
      });

      this.activeSessions.set(sessionId, sock);

      // Add error handlers to prevent crashes from buffer errors
      sock.ev.on('messages.update', () => {});
      sock.ev.on('messages.upsert', () => {});

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
            this.emit('session_failed', sessionId, 'Connection logged out - please try again');
          } else if (statusCode === DisconnectReason.restartRequired) {
            console.log('Restart required for pairing - restarting connection now...');
            
            // If we have user info from before the restart, the pairing was successful
            if (sock.authState?.creds?.registered) {
              console.log('Pairing successful! Starting fresh connection...');
              
              // Clean up current session
              this.cleanupSession(sessionId);
              
              // Start a new authenticated session
              setTimeout(async () => {
                try {
                  await this.startAuthenticatedSession(sessionId, cleanPhone, callback);
                } catch (error) {
                  console.error('Error starting authenticated session:', error);
                  this.emit('session_failed', sessionId, 'Failed to establish authenticated connection');
                }
              }, 3000);
            }
          } else if (statusCode === 503) {
            console.log('WhatsApp server error (503) - this is temporary, you can try again');
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'WhatsApp servers are busy. Please wait a minute and try again.');
          } else {
            console.log('Connection closed unexpectedly with status:', statusCode);
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Connection failed. Please try again in a few moments.');
          }
        }
      });

      // Wait for connection to be ready and then request pairing code
      let pairingCodeRequested = false;
      
      const requestPairingCodeWhenReady = async () => {
        if (pairingCodeRequested) return;
        
        try {
          console.log('Requesting pairing code for phone:', cleanPhone);
          
          // Wait longer for connection to stabilize
          await new Promise(resolve => setTimeout(resolve, 3000));
          
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
          
          // Set up a listener for successful authentication
          const authSuccessHandler = () => {
            if (sock.authState?.creds?.registered) {
              console.log('✅ Authentication successful! User is now registered.');
              
              // Wait a bit for connection to stabilize, then attempt to connect
              setTimeout(async () => {
                try {
                  console.log('Starting authenticated connection after successful pairing...');
                  
                  // Close current connection and start fresh authenticated session
                  this.cleanupSession(sessionId);
                  await this.startAuthenticatedSession(sessionId, cleanPhone, callback);
                } catch (error) {
                  console.error('Error starting authenticated session:', error);
                  this.emit('session_failed', sessionId, 'Failed to establish connection after pairing');
                }
              }, 3000);
            }
          };
          
          // Monitor for authentication changes
          sock.ev.on('creds.update', authSuccessHandler);
          
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

      // Start checking after initial connection with longer delay
      setTimeout(checkAndRequestCode, 5000);

      sock.ev.on('creds.update', saveCreds);

      // Add global error handlers to prevent crashes
      const originalListeners = process.listeners('uncaughtException');
      const originalRejectionListeners = process.listeners('unhandledRejection');
      
      const bufferErrorHandler = (error: any) => {
        if (error && error.message && error.message.includes('Invalid buffer')) {
          console.log('Ignoring buffer error during pairing process - this is normal');
          return;
        }
        // Re-emit to original handlers if not a buffer error
        originalListeners.forEach(listener => listener(error));
      };
      
      const bufferRejectionHandler = (reason: any) => {
        if (reason && reason.message && reason.message.includes('Invalid buffer')) {
          console.log('Ignoring buffer rejection during pairing process - this is normal');
          return;
        }
        // Re-emit to original handlers if not a buffer error
        originalRejectionListeners.forEach(listener => listener(reason));
      };
      
      process.on('uncaughtException', bufferErrorHandler);
      process.on('unhandledRejection', bufferRejectionHandler);
      
      // Clean up handlers when session ends
      const cleanup = () => {
        process.removeListener('uncaughtException', bufferErrorHandler);
        process.removeListener('unhandledRejection', bufferRejectionHandler);
      };
      
      // Store cleanup function
      (sock as any)._cleanup = cleanup;

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
        // Clean up error handlers if they exist
        if ((sock as any)._cleanup) {
          (sock as any)._cleanup();
        }
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

  async startAuthenticatedSession(sessionId: string, phoneNumber: string, callback: (data: any) => void) {
    console.log('Starting authenticated session for:', sessionId);
    
    const sessionPath = path.join(this.sessionsDir, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: true,
    });

    this.activeSessions.set(sessionId, sock);

    sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect } = update;
      console.log('Authenticated session update:', { connection, hasUser: !!sock.user });

      if (connection === 'open' && sock.user) {
        console.log('✅ Authenticated session established successfully!');
        console.log('User:', sock.user.name, 'JID:', sock.user.id);
        
        this.emit('session_connected', sessionId, {
          jid: sock.user.id,
          name: sock.user.name,
          phoneNumber: phoneNumber,
        });
        
        this.sendSessionConfirmation(sock, sessionId);
      }
    });

    sock.ev.on('creds.update', saveCreds);
  }

  async cleanup() {
    // Cleanup all active sessions
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      this.cleanupSession(sessionId);
    }
  }
}
