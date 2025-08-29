import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import * as fs from 'fs'
import * as path from 'path'
import { storage } from './storage'
import { eventStore } from '../app/api/events/[sessionId]/route'

export class WhatsAppService {
  private activeSessions = new Map<string, any>()
  private sessionsDir: string
  private maxConcurrentSessions: number = 5
  private rateLimitMap = new Map<string, number>()
  private rateLimitWindow = 5 * 60 * 1000 // 5 minutes

  constructor() {
    this.sessionsDir = path.join(process.cwd(), 'sessions')
    this.ensureSessionsDir()
  }

  private ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true })
    }
  }

  private canAcceptNewSession(): boolean {
    return this.activeSessions.size < this.maxConcurrentSessions
  }

  private checkRateLimit(identifier: string): boolean {
    const now = Date.now()
    const lastAttempt = this.rateLimitMap.get(identifier) || 0
    
    if (now - lastAttempt < this.rateLimitWindow) {
      return false
    }
    
    this.rateLimitMap.set(identifier, now)
    return true
  }

  async startQRPairing(sessionId: string, callback?: (data: any) => void): Promise<{ message: string }> {
    try {
      if (!this.canAcceptNewSession()) {
        throw new Error('Server at capacity. Please try again later.')
      }

      // Clean up any existing session first
      this.cleanupSession(sessionId)

      const sessionPath = path.join(this.sessionsDir, sessionId)

      // Completely clear existing session data
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true })
      }

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000))

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
      const { version, isLatest } = await fetchLatestBaileysVersion()

      console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`)

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', `${Math.floor(Math.random() * 1000)}.0`],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 30_000,
        qrTimeout: 60_000,
      })

      this.activeSessions.set(sessionId, sock)

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr, receivedPendingNotifications } = update
        console.log('Connection update:', { connection, qr: !!qr, receivedPendingNotifications })

        if (qr) {
          try {
            // Generate QR code as base64 image
            const qrDataURL = await QRCode.toDataURL(qr)
            const qrBase64 = qrDataURL.split(',')[1] // Remove data:image/png;base64, prefix
            
            console.log('✅ QR Code generated for session:', sessionId)
            
            // Emit QR code via SSE
            eventStore.emit(sessionId, {
              type: 'qr_code',
              qr: qrBase64,
              sessionId,
              timestamp: new Date().toISOString(),
            })
            
            if (callback) {
              callback({
                type: 'qr_code',
                qr: qrBase64,
                sessionId,
                timestamp: new Date().toISOString(),
              })
            }
          } catch (qrError) {
            console.error('Failed to generate QR code:', qrError)
          }
        }

        if (connection === 'connecting') {
          // Emit connecting status via SSE
          eventStore.emit(sessionId, {
            type: 'connecting',
            sessionId,
            timestamp: new Date().toISOString(),
          })
          
          if (callback) {
            callback({
              type: 'connecting',
              sessionId,
              timestamp: new Date().toISOString(),
            })
          }
        }

        if (connection === 'open') {
          console.log('✅ WhatsApp connection opened for session:', sessionId)

          try {
            await storage.updateSession(sessionId, {
              status: 'connected',
              connectedAt: new Date(),
            })

            // Emit SSE event for connection
            eventStore.emit(sessionId, {
              type: 'session_connected',
              sessionId,
              user: {
                jid: sock.user?.id,
                name: sock.user?.name,
              },
              timestamp: new Date().toISOString(),
            })

            // Send welcome message to WhatsApp user
            try {
              const userJid = sock.user?.id
              if (userJid) {
                const welcomeMessage = `🎉 Welcome! Your WhatsApp session is now connected.\n\nSession ID: ${sessionId}\n\nThis bot is ready to receive and send messages.`
                await sock.sendMessage(userJid, { text: welcomeMessage })
                console.log('✅ Welcome message sent to user:', userJid)
              }
            } catch (messageError) {
              console.error('Failed to send welcome message:', messageError)
            }

            if (callback) {
              callback({
                type: 'session_connected',
                sessionId,
                user: {
                  jid: sock.user?.id,
                  name: sock.user?.name,
                },
                timestamp: new Date().toISOString(),
              })
            }
          } catch (error) {
            console.error('Failed to update session status:', error)
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
          console.log('Connection closed with status:', statusCode)

          try {
            if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
              console.log('Restart required after QR scan - checking credentials...')
              
              const hasValidCreds = sock.authState?.creds?.registered || sock.authState?.creds?.me
              
              if (hasValidCreds) {
                console.log('✅ QR scan successful! Restarting authenticated session...')
                
                this.cleanupSession(sessionId)
                setTimeout(() => {
                  this.startAuthenticatedSession(sessionId, callback)
                }, 2000)
                return
              }
            }

            await storage.updateSession(sessionId, {
              status: 'failed',
            })

            if (callback) {
              callback({
                type: 'error',
                sessionId,
                message: 'Connection failed',
                timestamp: new Date().toISOString(),
              })
            }
          } catch (error) {
            console.error('Failed to handle connection close:', error)
          }

          this.cleanupSession(sessionId)
        }
      })

      // Save credentials when they change
      sock.ev.on('creds.update', saveCreds)

      return { message: 'QR pairing started successfully' }

    } catch (error) {
      console.error('❌ Failed to start QR pairing:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error('Failed to start QR pairing: ' + errorMsg)
    }
  }

  async requestPairingCode(sessionId: string, phoneNumber: string, callback?: (data: any) => void): Promise<{ code: string }> {
    try {
      if (!this.canAcceptNewSession()) {
        throw new Error('Server at capacity. Please try again later.')
      }

      if (!this.checkRateLimit(phoneNumber)) {
        throw new Error('Rate limit exceeded. Please wait before trying again.')
      }

      // Clean up any existing session first
      this.cleanupSession(sessionId)

      // Clean phone number (remove spaces, dashes, etc.)
      let cleanPhone = phoneNumber.replace(/\D/g, '')

      // Remove leading + if present
      if (cleanPhone.startsWith('+')) {
        cleanPhone = cleanPhone.substring(1)
      }

      // Validate the phone number length
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        throw new Error('Invalid phone number format. Please check country code and number.')
      }

      console.log('Original phone:', phoneNumber, '-> Cleaned phone for pairing:', cleanPhone)

      const sessionPath = path.join(this.sessionsDir, sessionId)

      // Completely clear existing session data
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true })
      }

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000))

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
      const { version, isLatest } = await fetchLatestBaileysVersion()

      console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`)

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 120_000,
        defaultQueryTimeoutMs: 120_000,
        keepAliveIntervalMs: 30_000,
        retryRequestDelayMs: 2_000,
        maxMsgRetryCount: 5,
        getMessage: async () => undefined,
        shouldIgnoreJid: () => false,
        shouldSyncHistoryMessage: () => false,
        emitOwnEvents: false,
        qrTimeout: 120_000,
      })

      this.activeSessions.set(sessionId, sock)

      let pairingCodeGenerated = false
      let connectionEstablished = false

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, isNewLogin, receivedPendingNotifications } = update

        if (connection === 'connecting') {
          console.log('🔗 Connecting to WhatsApp...')
        }

        if (connection === 'open') {
          console.log('✅ WhatsApp connection opened for session:', sessionId)
          connectionEstablished = true

          try {
            await storage.updateSession(sessionId, {
              status: 'connected',
              connectedAt: new Date(),
            })

            if (callback) {
              callback({
                type: 'session_connected',
                sessionId,
                user: {
                  jid: sock.user?.id,
                  name: sock.user?.name,
                },
                timestamp: new Date().toISOString(),
              })
            }
          } catch (error) {
            console.error('Failed to update session status:', error)
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
          console.log(`❌ Connection closed. Status: ${statusCode}`)

          if (!connectionEstablished) {
            try {
              await storage.updateSession(sessionId, {
                status: 'failed',
              })

              if (callback) {
                callback({
                  type: 'error',
                  sessionId,
                  message: 'Pairing failed',
                  timestamp: new Date().toISOString(),
                })
              }
            } catch (error) {
              console.error('Failed to update session status:', error)
            }
          }

          this.cleanupSession(sessionId)
        }
      })

      sock.ev.on('creds.update', saveCreds)

      try {
        console.log('📱 Requesting pairing code for:', cleanPhone)
        const code = await sock.requestPairingCode(cleanPhone)
        pairingCodeGenerated = true

        console.log(`✅ Generated 8-digit pairing code: ${code}`)

        if (callback) {
          callback({
            type: 'pairing_code',
            code,
            sessionId,
            timestamp: new Date().toISOString(),
          })
        }

        return { code }

      } catch (error) {
        console.error('❌ Failed to generate pairing code:', error)
        this.cleanupSession(sessionId)
        throw error
      }

    } catch (error) {
      console.error('❌ Failed to request pairing code:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error('Failed to generate pairing code: ' + errorMsg)
    }
  }

  private async startAuthenticatedSession(sessionId: string, callback?: (data: any) => void) {
    try {
      const sessionPath = path.join(this.sessionsDir, sessionId)
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
      const { version } = await fetchLatestBaileysVersion()

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '120.0.0.0'],
        markOnlineOnConnect: false,
      })

      this.activeSessions.set(sessionId, sock)

      sock.ev.on('connection.update', async (update: any) => {
        const { connection } = update

        if (connection === 'open') {
          console.log('✅ Authenticated WhatsApp session started:', sessionId)

          try {
            await storage.updateSession(sessionId, {
              status: 'connected',
              connectedAt: new Date(),
            })

            if (callback) {
              callback({
                type: 'session_connected',
                sessionId,
                user: {
                  jid: sock.user?.id,
                  name: sock.user?.name,
                },
                timestamp: new Date().toISOString(),
              })
            }
          } catch (error) {
            console.error('Failed to update session status:', error)
          }
        }
      })

      sock.ev.on('creds.update', saveCreds)

    } catch (error) {
      console.error('Failed to start authenticated session:', error)
    }
  }

  cleanupSession(sessionId: string) {
    const sock = this.activeSessions.get(sessionId)
    if (sock) {
      try {
        sock.end()
        sock.removeAllListeners()
      } catch (error) {
        console.log('Error cleaning up socket:', error)
      }
      this.activeSessions.delete(sessionId)
    }
  }

  async refreshQR(sessionId: string, callback?: (data: any) => void): Promise<{ message: string }> {
    // Clean up and restart QR pairing
    this.cleanupSession(sessionId)
    
    // Small delay before restarting
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return this.startQRPairing(sessionId, callback)
  }

  async submitPairingCode(sessionId: string, code: string, callback?: (data: any) => void): Promise<{ message: string }> {
    // The pairing code verification is handled automatically by Baileys
    // This endpoint can be used for additional verification if needed
    return { message: 'Code verification in progress' }
  }
}

export const whatsappService = new WhatsAppService()