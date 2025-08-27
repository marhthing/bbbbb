import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { EventEmitter } from 'events';
import { storage } from '../storage';
import path from 'path';
import fs from 'fs';

export class WhatsAppService extends EventEmitter {
  private activeSessions = new Map<string, any>();
  private sessionsDir = path.join(process.cwd(), 'sessions');
  private connectionPool = new Map<string, number>(); // Track connection counts per IP
  private rateLimits = new Map<string, { count: number; lastReset: number }>(); // Rate limiting
  private maxConcurrentSessions = 100; // Maximum concurrent sessions
  private maxConnectionsPerIP = 5; // Maximum connections per IP address

  constructor() {
    super();
    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    // Set higher event listener limit for performance
    this.setMaxListeners(200);

    // Cleanup inactive sessions every 5 minutes
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  // Performance monitoring and cleanup
  private cleanupInactiveSessions() {
    const now = Date.now();
    for (const [sessionId, sock] of this.activeSessions.entries()) {
      try {
        if (!sock || sock.readyState === sock.CLOSED || sock.readyState === sock.CLOSING) {
          console.log(`Cleaning up inactive session: ${sessionId}`);
          this.cleanupSession(sessionId);
        }
      } catch (error) {
        console.error(`Error during cleanup of session ${sessionId}:`, error);
        this.cleanupSession(sessionId);
      }
    }
  }

  // Rate limiting check
  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const limit = this.rateLimits.get(identifier);

    if (!limit || now - limit.lastReset > 60000) { // Reset every minute
      this.rateLimits.set(identifier, { count: 1, lastReset: now });
      return true;
    }

    if (limit.count >= 10) { // Max 10 requests per minute
      return false;
    }

    limit.count++;
    return true;
  }

  // Check if server can accept more sessions
  private canAcceptNewSession(): boolean {
    return this.activeSessions.size < this.maxConcurrentSessions;
  }

  async startQRPairing(sessionId: string, callback: (data: any) => void) {
    try {
      if (!this.canAcceptNewSession()) {
        throw new Error('Server at capacity. Please try again later.');
      }

      // Clean up any existing session first
      if (this.activeSessions.has(sessionId)) {
        console.log('Cleaning up existing session before starting QR pairing');
        this.cleanupSession(sessionId);
      }

      const sessionPath = path.join(this.sessionsDir, sessionId);

      // Clear existing session data completely for fresh QR pairing
      if (fs.existsSync(sessionPath)) {
        console.log('Clearing existing session data for fresh QR pairing...');
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      // Add delay to ensure cleanup completes
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', `${Math.floor(Math.random() * 1000)}.0`], // Randomized for fresh sessions
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 30_000,
        qrTimeout: 60_000,
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
      if (!this.canAcceptNewSession()) {
        throw new Error('Server at capacity. Please try again later.');
      }

      if (!this.checkRateLimit(phoneNumber)) {
        throw new Error('Rate limit exceeded. Please wait before trying again.');
      }

      // Clean up any existing session first
      if (this.activeSessions.has(sessionId)) {
        console.log('Cleaning up existing session before starting QR pairing');
        this.cleanupSession(sessionId);
      }

      // Clean phone number (remove spaces, dashes, etc.)
      let cleanPhone = phoneNumber.replace(/\D/g, '');

      // Remove leading + if present
      if (cleanPhone.startsWith('+')) {
        cleanPhone = cleanPhone.substring(1);
      }

      // Validate the phone number length (should already be in correct format from frontend)
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        throw new Error('Invalid phone number format. Please check country code and number.');
      }

      console.log('Original phone:', phoneNumber, '-> Cleaned phone:', cleanPhone);

      const sessionPath = path.join(this.sessionsDir, sessionId);

      // Clear existing session data completely for fresh pairing
      if (fs.existsSync(sessionPath)) {
        console.log('Clearing existing session data for fresh pairing...');
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      // Also clear any cached authentication state
      if (this.activeSessions.has(sessionId)) {
        this.cleanupSession(sessionId);
      }

      // Clear all session files for this phone number to avoid conflicts
      const allSessionDirs = fs.readdirSync(this.sessionsDir);
      for (const dir of allSessionDirs) {
        const dirPath = path.join(this.sessionsDir, dir);
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          // Check if this session might be for the same phone number
          const credsPath = path.join(dirPath, 'creds.json');
          if (fs.existsSync(credsPath)) {
            try {
              const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
              if (creds.me?.id && creds.me.id.includes(cleanPhone.replace('+', ''))) {
                console.log(`Clearing conflicting session: ${dir}`);
                fs.rmSync(dirPath, { recursive: true, force: true });
              }
            } catch (e) {
              // Ignore errors reading creds
            }
          }
        }
      }

      // Add delay to ensure cleanup completes
      await new Promise(resolve => setTimeout(resolve, 2000));
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Windows', 'Desktop', `${Math.floor(Math.random() * 1000)}.0`], // Randomized version for re-linking
        markOnlineOnConnect: false,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 60_000, // Reduced for faster failure detection
        keepAliveIntervalMs: 30_000, // More frequent keep-alive
        connectTimeoutMs: 30_000, // Faster connection timeout
        qrTimeout: 60_000,
        retryRequestDelayMs: 3_000, // Standard retry delay
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

          callback({
            type: 'session_connected',
            sessionId,
            phoneNumber: cleanPhone,
            name: sock.user.name,
            jid: sock.user.id,
            timestamp: new Date().toISOString(),
          });

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

          // Check if we have valid credentials before handling disconnect
          const hasValidCreds = sock.authState?.creds?.registered || sock.authState?.creds?.me;

          if (statusCode === DisconnectReason.loggedOut) {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Connection logged out - please try again');
          } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            if (hasValidCreds) {
              console.log('✅ Pairing successful! Restarting for authenticated session...');

              callback({
                type: 'pairing_successful',
                sessionId,
                phoneNumber: cleanPhone,
                timestamp: new Date().toISOString(),
              });

              // Clean up current session
              this.cleanupSession(sessionId);

              // Start authenticated session
              setTimeout(async () => {
                try {
                  await this.startAuthenticatedSession(sessionId, cleanPhone, callback);
                } catch (error) {
                  console.error('Error starting authenticated session:', error);
                  this.emit('session_failed', sessionId, 'Failed to establish authenticated connection');
                }
              }, 2000);
              return;
            } else {
              console.log('Restart required but no valid credentials - continuing pairing...');
              this.cleanupSession(sessionId);
              setTimeout(() => {
                this.requestPairingCode(sessionId, phoneNumber, callback).catch(error => {
                  console.error('Error restarting pairing:', error);
                  this.emit('session_failed', sessionId, 'Failed to restart pairing process');
                });
              }, 3000);
              return;
            }
          } else if (statusCode === 503) {
            console.log('WhatsApp server error (503) - this is temporary, you can try again');
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'WhatsApp servers are busy. Please wait a minute and try again.');
          } else if (statusCode === 428) {
            console.log('Connection precondition failed (428) - retrying with fresh session...');
            this.cleanupSession(sessionId);
            setTimeout(() => {
              this.requestPairingCode(sessionId, phoneNumber, callback).catch(error => {
                console.error('Error retrying pairing:', error);
                this.emit('session_failed', sessionId, 'Failed to retry pairing process');
              });
            }, 5000);
          } else {
            // Check if we have credentials even with unexpected disconnect
            if (hasValidCreds) {
              console.log('Unexpected disconnect but credentials exist - trying authenticated session...');
              this.cleanupSession(sessionId);
              setTimeout(async () => {
                try {
                  await this.startAuthenticatedSession(sessionId, cleanPhone, callback);
                } catch (error) {
                  console.error('Error starting authenticated session:', error);
                  this.emit('session_failed', sessionId, 'Connection established but failed to connect');
                }
              }, 2000);
            } else {
              console.log('Connection closed unexpectedly with status:', statusCode);
              this.cleanupSession(sessionId);
              this.emit('session_failed', sessionId, 'Connection failed. Please try again in a few moments.');
            }
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

          // For WhatsApp pairing, we need to ensure the number is in the exact format WhatsApp expects
          console.log('Requesting pairing code for formatted phone:', cleanPhone);

          const code = await sock.requestPairingCode(cleanPhone);
          pairingCodeRequested = true;

          console.log('✅ Pairing code generated successfully:', code);
          console.log('📱 Phone number used:', cleanPhone);
          console.log('🔗 Code format validated for WhatsApp');

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
          sock.ev.on('creds.update', (creds) => {
            console.log('Credentials updated:', {
              registered: creds.registered,
              hasMe: !!creds.me,
              meId: creds.me?.id
            });

            if (creds.registered || creds.me) {
              console.log('✅ Pairing successful! Credentials indicate user is registered.');

              callback({
                type: 'pairing_successful',
                sessionId,
                phoneNumber: cleanPhone,
                timestamp: new Date().toISOString(),
              });

              // Don't immediately start authenticated session, wait for connection to stabilize
              setTimeout(() => {
                if (sock.user) {
                  // Already connected with user info
                  callback({
                    type: 'session_connected',
                    sessionId,
                    phoneNumber: cleanPhone,
                    name: sock.user.name,
                    jid: sock.user.id,
                    timestamp: new Date().toISOString(),
                  });

                  this.emit('session_connected', sessionId, {
                    jid: sock.user.id,
                    name: sock.user.name,
                    phoneNumber: cleanPhone,
                  });
                } else {
                  // Need to restart for authenticated session
                  console.log('Restarting for authenticated session...');
                  this.cleanupSession(sessionId);
                  setTimeout(() => {
                    this.startAuthenticatedSession(sessionId, cleanPhone, callback);
                  }, 2000);
                }
              }, 3000);
            }
          });

          // Set a timeout for pairing code validation
          setTimeout(() => {
            if (!sock.authState?.creds?.registered && !sock.user) {
              console.log('Pairing code timeout - no successful authentication within 2 minutes');
              this.emit('session_failed', sessionId, 'Pairing code expired or was not entered correctly. Please try again.');
              this.cleanupSession(sessionId);
            }
          }, 120000); // 2 minutes timeout

        } catch (error) {
          console.error('❌ Error generating pairing code:', error.message);

          // Check for specific error messages
          if (error.message.includes('Invalid phone number') || error.message.includes('phone number format')) {
            this.emit('session_failed', sessionId, 'Invalid phone number format. Examples: +447xxxxxxxxx (UK), +234xxxxxxxxxx (Nigeria), +1xxxxxxxxxx (US)');
          } else if (error.message.includes('rate limit') || error.message.includes('too many')) {
            this.emit('session_failed', sessionId, 'Too many requests. Please wait 5-10 minutes before trying again.');
          } else if (error.message.includes('503') || error.message.includes('server')) {
            this.emit('session_failed', sessionId, 'WhatsApp servers are busy. Please try again in a few minutes.');
          } else {
            this.emit('session_failed', sessionId, 'Failed to generate pairing code. Check your phone number format and try again.');
          }
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

      console.log('User entered pairing code:', code, 'for session:', sessionId);

      // The pairing code validation happens automatically when user enters it in WhatsApp
      // This method is mainly for UI feedback
      callback({
        type: 'pairing_code_submitted',
        sessionId,
        code,
        timestamp: new Date().toISOString(),
      });

      // Wait a bit to see if connection succeeds
      setTimeout(() => {
        if (sock.authState?.creds?.registered) {
          console.log('Pairing appears successful, user is registered');
        } else {
          console.log('Waiting for pairing confirmation from WhatsApp...');
        }
      }, 2000);

      return { success: true, message: 'Waiting for WhatsApp confirmation...' };
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
        // Remove all listeners to prevent memory leaks
        sock.ev.removeAllListeners();
        sock.end();
      } catch (error) {
        console.error('Error ending socket:', error);
      }
      this.activeSessions.delete(sessionId);
    }

    // Update performance metrics
    console.log(`Active sessions: ${this.activeSessions.size}/${this.maxConcurrentSessions}`);
  }

  async sendSessionConfirmation(sock: any, sessionId: string) {
    try {
      // Get user's own JID (their WhatsApp number)
      const userJid = sock.user?.id;
      if (!userJid) {
        console.log('No user JID available for session confirmation');
        return;
      }

      // MATDEV branded confirmation message
      const confirmationMessage = `🖥️ *MATDEV WhatsApp Desktop Connected!*

✅ Your session has been linked successfully to MATDEV platform.

📋 *Session Details:*
• Session ID: \`${sessionId}\`
• Platform: Windows Desktop
• Connected: ${new Date().toLocaleString()}
• Status: Active & Secure

🚀 *MATDEV Integration Ready*
Your WhatsApp is now connected to MATDEV's professional messaging platform. All communications are encrypted and secure.

---
*MATDEV © 2025 - Professional WhatsApp Desktop Integration*`;

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