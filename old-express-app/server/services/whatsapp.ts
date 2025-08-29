import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { EventEmitter } from 'events';
import { storage } from '../storage';
import path from 'path';
import fs from 'fs';

// Configure Node.js to handle SSL certificates properly in Replit environment
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
    for (const [sessionId, sock] of Array.from(this.activeSessions.entries())) {
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
          if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            console.log('Restart required after QR scan - this is normal, starting authenticated session...');
            
            // Check if we have valid credentials from the QR scan
            const hasValidCreds = sock.authState?.creds?.registered || sock.authState?.creds?.me;
            
            if (hasValidCreds) {
              console.log('✅ QR scan successful! Starting authenticated session...');
              
              callback({
                type: 'qr_scan_successful',
                sessionId,
                timestamp: new Date().toISOString(),
              });

              // Clean up current session
              this.cleanupSession(sessionId);

              // Start authenticated session instead of restarting QR pairing
              setTimeout(async () => {
                try {
                  await this.startAuthenticatedSession(sessionId, '', callback);
                } catch (error) {
                  console.error('Error starting authenticated session after QR:', error);
                  this.emit('session_failed', sessionId, 'Failed to establish authenticated connection after QR scan');
                }
              }, 2000);
              return;
            } else {
              console.log('Restart required but no valid credentials - restarting QR pairing...');
              callback({
                type: 'restart_required',
                sessionId,
                timestamp: new Date().toISOString(),
              });

              // Clean up current session and restart QR pairing
              this.cleanupSession(sessionId);

              setTimeout(() => {
                this.startQRPairing(sessionId, callback).catch(error => {
                  console.error('Error restarting QR pairing:', error);
                  this.emit('session_failed', sessionId, 'Failed to restart after QR scan');
                });
              }, 1000);
              return;
            }
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

      sock.ev.on('creds.update', (creds) => {
        saveCreds(creds);
        
        // Monitor for successful QR pairing
        if (creds.registered || creds.me) {
          console.log('✅ QR Pairing successful! Credentials updated:', {
            registered: creds.registered,
            hasMe: !!creds.me,
            meId: creds.me?.id
          });

          callback({
            type: 'qr_pairing_successful',
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }
      });

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
      this.cleanupSession(sessionId);

      // Clean phone number (remove spaces, dashes, etc.)
      let cleanPhone = phoneNumber.replace(/\D/g, '');

      // Remove leading + if present
      if (cleanPhone.startsWith('+')) {
        cleanPhone = cleanPhone.substring(1);
      }

      // Validate the phone number length
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        throw new Error('Invalid phone number format. Please check country code and number.');
      }

      console.log('Original phone:', phoneNumber, '-> Cleaned phone for pairing:', cleanPhone);

      const sessionPath = path.join(this.sessionsDir, sessionId);

      // Completely clear existing session data
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

      // Create socket with optimized settings for pairing
      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 120_000, // Increased timeout
        defaultQueryTimeoutMs: 120_000, // Increased timeout
        keepAliveIntervalMs: 30_000,
        retryRequestDelayMs: 2_000, // Increased retry delay
        maxMsgRetryCount: 5, // More retries
        getMessage: async () => undefined,
        shouldIgnoreJid: () => false,
        shouldSyncHistoryMessage: () => false,
        emitOwnEvents: false,
        qrTimeout: 120_000, // Increased QR timeout
      });

      this.activeSessions.set(sessionId, sock);

      let pairingCodeGenerated = false;
      let connectionEstablished = false;

      // Handle credentials updates - this is key for detecting successful pairing
      sock.ev.on('creds.update', (creds) => {
        saveCreds(creds);
        
        console.log('📋 Credentials updated:', {
          registered: creds.registered,
          hasMe: !!creds.me,
          hasNoKey: creds.noiseKey ? 'present' : 'missing',
          hasSignedIdentityKey: creds.signedIdentityKey ? 'present' : 'missing'
        });

        // This indicates successful pairing completion
        if (creds.registered && creds.me) {
          console.log('🎉 PAIRING VERIFICATION SUCCESSFUL!');
          console.log('✅ Phone number verified:', cleanPhone);
          console.log('✅ User authenticated:', creds.me.id);

          connectionEstablished = true;

          callback({
            type: 'pairing_verified',
            sessionId,
            phoneNumber: cleanPhone,
            userId: creds.me.id,
            timestamp: new Date().toISOString(),
          });

          // Give a moment for credentials to be fully saved
          setTimeout(() => {
            this.startVerifiedSession(sessionId, cleanPhone, callback);
          }, 2000);
        } else if (creds.registered) {
          console.log('✅ User registration detected - pairing in progress...');
          
          callback({
            type: 'pairing_in_progress',
            sessionId,
            phoneNumber: cleanPhone,
            timestamp: new Date().toISOString(),
          });
        }
      });

      // Handle connection updates
      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr, isOnline } = update;
        
        console.log('🔄 Connection update:', { 
          connection, 
          isOnline,
          hasUser: !!sock.user,
          registered: sock.authState?.creds?.registered,
          sessionReady: connectionEstablished
        });

        if (connection === 'connecting') {
          callback({
            type: 'connecting',
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }

        if (connection === 'open') {
          console.log('🔗 WebSocket connection established');
          
          if (!pairingCodeGenerated) {
            // Generate pairing code immediately when connection opens
            setTimeout(async () => {
              try {
                console.log('🔢 Generating pairing code for:', cleanPhone);
                const code = await sock.requestPairingCode(cleanPhone);
                console.log('✅ Pairing code generated:', code);
                
                pairingCodeGenerated = true;
                
                callback({
                  type: 'pairing_code_ready',
                  sessionId,
                  phoneNumber: cleanPhone,
                  code: code,
                  timestamp: new Date().toISOString(),
                });

                console.log('📋 PAIRING CODE:', code);
                console.log('Enter this code in WhatsApp: Settings → Linked Devices → Link with phone number');
              } catch (error) {
                console.error('Failed to generate pairing code:', error);
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.emit('session_failed', sessionId, 'Failed to generate pairing code: ' + errorMsg);
              }
            }, 1000);
          }

          // If we already have user info (authenticated), proceed directly
          if (sock.user && connectionEstablished) {
            console.log('🎯 Already authenticated with user:', sock.user.name);
            
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
          }
        }

        // FALLBACK: Generate pairing code after seeing registration attempt
        if (!pairingCodeGenerated && connection === undefined && isOnline === undefined) {
          // Wait a bit for the connection to stabilize, then try to generate code
          setTimeout(async () => {
            if (!pairingCodeGenerated) {
              try {
                console.log('🔄 Attempting pairing code generation (fallback)...');
                console.log('🔢 Generating pairing code for:', cleanPhone);
                const code = await sock.requestPairingCode(cleanPhone);
                console.log('✅ Pairing code generated:', code);
                
                pairingCodeGenerated = true;
                
                callback({
                  type: 'pairing_code_ready',
                  sessionId,
                  phoneNumber: cleanPhone,
                  code: code,
                  timestamp: new Date().toISOString(),
                });

                console.log('📋 PAIRING CODE:', code);
                console.log('Enter this code in WhatsApp: Settings → Linked Devices → Link with phone number');
              } catch (error) {
                console.error('Failed to generate pairing code (fallback):', error);
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.emit('session_failed', sessionId, 'Failed to generate pairing code: ' + errorMsg);
              }
            }
          }, 3000);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log('❌ Connection closed. Status:', statusCode);

          if (connectionEstablished) {
            // Pairing was successful, just need to reconnect
            console.log('🔄 Reconnecting authenticated session...');
            setTimeout(() => {
              this.startVerifiedSession(sessionId, cleanPhone, callback);
            }, 2000);
          } else if (statusCode === DisconnectReason.loggedOut) {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Session logged out. Please try again.');
          } else if (statusCode === DisconnectReason.restartRequired) {
            console.log('🔄 Restart required - checking credentials...');
            
            if (sock.authState?.creds?.registered) {
              console.log('✅ Credentials exist, restarting verified session');
              setTimeout(() => {
                this.startVerifiedSession(sessionId, cleanPhone, callback);
              }, 2000);
            } else {
              console.log('❌ No valid credentials, cleaning up');
              this.cleanupSession(sessionId);
              this.emit('session_failed', sessionId, 'Authentication failed. Please try again.');
            }
          } else {
            // Other disconnect reasons - retry if we haven't succeeded yet
            if (!connectionEstablished && !pairingCodeGenerated) {
              console.log('🔄 Retrying connection for pairing...');
              this.cleanupSession(sessionId);
              setTimeout(() => {
                this.requestPairingCode(sessionId, phoneNumber, callback).catch(console.error);
              }, 3000);
            } else {
              console.log('❌ Connection failed');
              this.cleanupSession(sessionId);
              this.emit('session_failed', sessionId, 'Connection failed. Please try again.');
            }
          }
        }
      });

      // Set timeout for the entire pairing process
      setTimeout(() => {
        if (!connectionEstablished) {
          console.log('⏰ Pairing timeout - no successful verification within 5 minutes');
          this.cleanupSession(sessionId);
          this.emit('session_failed', sessionId, 'Pairing timeout. Please generate a new code and try again.');
        }
      }, 300000); // 5 minutes timeout

      return {
        success: true,
        message: 'Pairing process started successfully',
        phoneNumber: cleanPhone
      };

    } catch (error) {
      console.error('❌ Error in pairing process:', error);
      this.cleanupSession(sessionId);
      this.emit('session_failed', sessionId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  private async generatePairingCode(sock: any, phoneNumber: string, sessionId: string, callback: (data: any) => void): Promise<void> {
    try {
      console.log('🔢 Generating pairing code for:', phoneNumber);
      
      const code = await sock.requestPairingCode(phoneNumber);
      
      console.log('✅ Pairing code generated:', code);
      console.log('📱 Phone number:', phoneNumber);
      
      callback({
        type: 'pairing_code_ready',
        sessionId,
        phoneNumber: phoneNumber,
        code: code,
        timestamp: new Date().toISOString(),
      });

      console.log('📋 PAIRING INSTRUCTIONS:');
      console.log('1. Open WhatsApp on your phone');
      console.log('2. Go to Settings → Linked Devices');
      console.log('3. Tap "Link a Device"');
      console.log('4. Choose "Link with phone number instead"');
      console.log(`5. Enter exactly: ${code}`);
      console.log('6. The connection will detect verification automatically');

    } catch (error) {
      console.error('❌ Failed to generate pairing code:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error('Failed to generate pairing code: ' + errorMsg);
    }
  }

  private async startVerifiedSession(sessionId: string, phoneNumber: string, callback: (data: any) => void): Promise<void> {
    try {
      console.log('🚀 Starting verified session for:', sessionId);
      
      // Clean up the pairing session
      this.cleanupSession(sessionId);
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const sessionPath = path.join(this.sessionsDir, sessionId);
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 120_000, // Increased timeout
        defaultQueryTimeoutMs: 120_000, // Increased timeout
        keepAliveIntervalMs: 30_000,
        retryRequestDelayMs: 2_000, // Increased retry delay
        maxMsgRetryCount: 5, // More retries
      });

      this.activeSessions.set(sessionId, sock);

      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect } = update;
        console.log('🔄 Verified session update:', { connection, hasUser: !!sock.user });

        if (connection === 'connecting') {
          callback({
            type: 'connecting',
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }

        if (connection === 'open' && sock.user) {
          console.log('✅ Verified session connected successfully!');
          console.log('👤 User:', sock.user.name, 'JID:', sock.user.id);

          callback({
            type: 'session_connected',
            sessionId,
            phoneNumber: phoneNumber,
            name: sock.user.name,
            jid: sock.user.id,
            timestamp: new Date().toISOString(),
          });

          this.emit('session_connected', sessionId, {
            jid: sock.user.id,
            name: sock.user.name,
            phoneNumber: phoneNumber,
          });

          this.sendSessionConfirmation(sock, sessionId);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log('❌ Verified session closed:', statusCode);

          if (statusCode === DisconnectReason.loggedOut) {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Session logged out');
          } else {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Connection lost');
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);

    } catch (error) {
      console.error('❌ Error in verified session:', error);
      this.cleanupSession(sessionId);
      this.emit('session_failed', sessionId, 'Failed to establish verified session');
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

    try {
      const sessionPath = path.join(this.sessionsDir, sessionId);
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', `${Math.floor(Math.random() * 1000)}.0`],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 30_000,
      });

      this.activeSessions.set(sessionId, sock);

      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect } = update;
        console.log('Authenticated session update:', { connection, hasUser: !!sock.user });

        if (connection === 'connecting') {
          callback({
            type: 'connecting',
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }

        if (connection === 'open' && sock.user) {
          console.log('✅ Authenticated session established successfully!');
          console.log('User:', sock.user.name, 'JID:', sock.user.id);

          callback({
            type: 'session_connected',
            sessionId,
            phoneNumber: phoneNumber || sock.user.id?.split(':')[0] || '',
            name: sock.user.name,
            jid: sock.user.id,
            timestamp: new Date().toISOString(),
          });

          this.emit('session_connected', sessionId, {
            jid: sock.user.id,
            name: sock.user.name,
            phoneNumber: phoneNumber || sock.user.id?.split(':')[0] || '',
          });

          this.sendSessionConfirmation(sock, sessionId);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log('Authenticated session closed with status:', statusCode);

          if (statusCode === DisconnectReason.loggedOut) {
            this.cleanupSession(sessionId);
            this.emit('session_failed', sessionId, 'Session logged out');
          } else {
            console.log('Authenticated session disconnected, cleaning up');
            this.cleanupSession(sessionId);
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);
    } catch (error) {
      console.error('Error in authenticated session:', error);
      this.emit('session_failed', sessionId, 'Failed to start authenticated session');
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