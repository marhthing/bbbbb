import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';

// Configure for Vercel serverless environment
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export class WhatsAppService extends EventEmitter {
  constructor() {
    super();
    // Use Vercel's /tmp directory for session storage
    this.sessionsDir = '/tmp/sessions';
    this.setMaxListeners(200);
    
    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  async requestPairingCode(sessionId, phoneNumber) {
    try {
      // Clean phone number
      let cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.startsWith('+')) {
        cleanPhone = cleanPhone.substring(1);
      }

      console.log('Generating pairing code for:', cleanPhone);

      const sessionPath = path.join(this.sessionsDir, sessionId);
      
      // Clear existing session data
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['Vercel', 'Chrome', '120.0.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        qrTimeout: 60_000,
      });

      // Generate pairing code
      const code = await sock.requestPairingCode(cleanPhone);
      
      console.log('✅ Pairing code generated:', code);
      
      // Clean up the socket after generating code
      sock.end();
      
      return {
        success: true,
        code: code,
        phoneNumber: cleanPhone,
        message: 'Pairing code generated successfully'
      };

    } catch (error) {
      console.error('Error generating pairing code:', error);
      throw new Error('Failed to generate pairing code: ' + error.message);
    }
  }

  async startQRPairing(sessionId) {
    try {
      console.log('Starting QR pairing for session:', sessionId);

      const sessionPath = path.join(this.sessionsDir, sessionId);
      
      // Clear existing session data
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['Vercel', 'Chrome', '120.0.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 60_000,
        qrTimeout: 60_000,
      });

      return new Promise((resolve, reject) => {
        let qrCode = null;
        
        sock.ev.on('connection.update', (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr) {
            qrCode = qr;
            console.log('QR code generated for session:', sessionId);
          }
          
          if (connection === 'open') {
            console.log('QR pairing successful for session:', sessionId);
            sock.end();
            resolve({
              success: true,
              qr: qrCode,
              message: 'QR pairing started successfully'
            });
          }
          
          if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (!shouldReconnect) {
              sock.end();
              if (qrCode) {
                resolve({
                  success: true,
                  qr: qrCode,
                  message: 'QR code generated'
                });
              } else {
                reject(new Error('Failed to generate QR code'));
              }
            }
          }
        });

        sock.ev.on('creds.update', saveCreds);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          if (qrCode) {
            sock.end();
            resolve({
              success: true,
              qr: qrCode,
              message: 'QR code generated'
            });
          } else {
            sock.end();
            reject(new Error('QR code generation timeout'));
          }
        }, 30000);
      });

    } catch (error) {
      console.error('Error starting QR pairing:', error);
      throw new Error('Failed to start QR pairing: ' + error.message);
    }
  }
}