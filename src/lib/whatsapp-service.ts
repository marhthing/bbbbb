import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import * as fs from 'fs'
import * as path from 'path'
import { storage } from './storage'
import { eventStore } from './event-store'
import P from 'pino'

export class WhatsAppService {
  private activeSessions = new Map<string, any>()
  private sessionsDir: string
  private maxConcurrentSessions: number = 20 // Increased for better concurrency
  private rateLimitMap = new Map<string, number>()
  private rateLimitWindow = 2 * 60 * 1000 // 2 minutes (reduced from 5)
  private maxAttemptsPerWindow = 3 // Allow 3 attempts per user per window
  private connections = new Map<string, any>()
  private connectionTimeouts = new Map<string, NodeJS.Timeout>() // Track connection timeouts
  private sessionMemoryUsage = new Map<string, number>() // Track memory per session
  private maxMemoryPerSession = 100 * 1024 * 1024 // 100MB per session
  private totalMemoryLimit = 1024 * 1024 * 1024 // 1GB total for all sessions
  private queuedRequests = new Map<string, Array<{ resolve: Function, reject: Function }>>() // Queue for high load

  constructor() {
    this.sessionsDir = path.join(process.cwd(), 'sessions')
    this.ensureSessionsDir()

    // Start cleanup scheduler for idle sessions
    this.startCleanupScheduler()
    
    // Start health monitoring
    this.startHealthMonitoring()
  }

  // Clean up idle sessions every 30 minutes
  private startCleanupScheduler() {
    setInterval(() => {
      this.cleanupIdleSessions()
    }, 30 * 60 * 1000) // 30 minutes
  }

  // Monitor session health every 5 minutes
  private startHealthMonitoring() {
    setInterval(() => {
      this.monitorSessionHealth()
    }, 5 * 60 * 1000) // 5 minutes
  }

  // Monitor session health and recover failed sessions
  private async monitorSessionHealth() {
    console.log(`🏥 Health check: ${this.activeSessions.size} active sessions`)
    
    for (const [sessionId, connection] of Array.from(this.activeSessions.entries())) {
      try {
        // Check if connection is still alive
        if (!connection || !connection.ws || connection.ws.readyState !== 1) {
          console.log(`🔴 Unhealthy session detected: ${sessionId}`)
          await this.handleUnhealthySession(sessionId)
        }
      } catch (error) {
        console.error(`Error monitoring session ${sessionId}:`, error)
        await this.handleUnhealthySession(sessionId)
      }
    }
  }

  // Handle unhealthy sessions
  private async handleUnhealthySession(sessionId: string) {
    try {
      // Update database status
      await storage.updateSession(sessionId, { status: 'disconnected' })
      
      // Clean up the session
      this.cleanupSession(sessionId)
      
      console.log(`🧹 Cleaned up unhealthy session: ${sessionId}`)
    } catch (error) {
      console.error(`Failed to handle unhealthy session ${sessionId}:`, error)
    }
  }

  // Remove sessions that have been idle for too long
  private cleanupIdleSessions() {
    const idleThreshold = 60 * 60 * 1000 // 1 hour
    const now = Date.now()

    Array.from(this.activeSessions.entries()).forEach(([sessionId, connection]) => {
      try {
        // Check if session is still active or has been idle
        if (connection && connection.ws && connection.ws.readyState === 3) { // CLOSED
          console.log(`🧹 Cleaning up idle session: ${sessionId}`)
          this.cleanupSession(sessionId)
        }
      } catch (error) {
        console.error(`Error checking session ${sessionId}:`, error)
        this.cleanupSession(sessionId)
      }
    })

    // Monitor memory usage and cleanup if needed
    this.monitorMemoryUsage()
  }

  // Monitor and manage memory usage
  private monitorMemoryUsage() {
    const memUsage = process.memoryUsage()
    const totalHeap = memUsage.heapUsed
    
    console.log(`📊 Memory usage: ${Math.round(totalHeap / 1024 / 1024)}MB`)
    
    // If total memory exceeds limit, cleanup oldest sessions
    if (totalHeap > this.totalMemoryLimit) {
      console.log(`⚠️ Total memory limit exceeded, cleaning up oldest sessions`)
      this.cleanupOldestSessions()
    }
  }

  // Cleanup oldest sessions when memory limit is reached
  private cleanupOldestSessions() {
    const sessionEntries = Array.from(this.activeSessions.entries())
    const oldestSessions = sessionEntries.slice(0, Math.ceil(sessionEntries.length * 0.3)) // Remove 30% oldest
    
    oldestSessions.forEach(([sessionId]) => {
      console.log(`🧹 Cleaning up old session due to memory pressure: ${sessionId}`)
      this.cleanupSession(sessionId)
    })
  }

  private ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true })
    }
  }

  private canAcceptNewSession(): boolean {
    // Check session count limit
    if (this.activeSessions.size >= this.maxConcurrentSessions) {
      console.log(`⛔ Session limit reached: ${this.activeSessions.size}/${this.maxConcurrentSessions}`)
      return false
    }

    // Check memory usage
    const memUsage = process.memoryUsage()
    if (memUsage.heapUsed > this.totalMemoryLimit * 0.85) { // 85% threshold (more lenient)
      console.log(`⛔ Memory threshold reached: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB of ${Math.round(this.totalMemoryLimit / 1024 / 1024)}MB limit`)
      return false
    }

    return true
  }

  private checkRateLimit(identifier: string): boolean {
    const now = Date.now()
    const userKey = `user_${identifier}`
    const attemptKey = `attempts_${identifier}`

    const lastAttempt = this.rateLimitMap.get(userKey) || 0
    const attemptCount = this.rateLimitMap.get(attemptKey) || 0

    // If outside window, reset attempts
    if (now - lastAttempt >= this.rateLimitWindow) {
      this.rateLimitMap.set(attemptKey, 0)
      this.rateLimitMap.set(userKey, now)
      console.log(`✅ Rate limit window reset for ${identifier}`)
      return true
    }

    // Check if within attempt limit
    if (attemptCount >= this.maxAttemptsPerWindow) {
      console.log(`⚠️ Rate limit exceeded for ${identifier}. Attempts: ${attemptCount}/${this.maxAttemptsPerWindow}`)
      return false
    }

    // Increment attempt count
    this.rateLimitMap.set(attemptKey, attemptCount + 1)
    this.rateLimitMap.set(userKey, now)
    console.log(`✅ Rate limit check passed for ${identifier}. Attempts: ${attemptCount + 1}/${this.maxAttemptsPerWindow}`)
    return true
  }

  async startQRPairing(sessionId: string, callback?: (data: any) => void): Promise<{ message: string }> {
    try {
      if (!this.canAcceptNewSession()) {
        throw new Error('Server at capacity. Please try again later or try during off-peak hours.')
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
        browser: ['Ubuntu', 'Chrome', `${Date.now()}.${Math.floor(Math.random() * 1000)}`], // Unique browser ID per session
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
            // Extract phone number from user JID for QR pairing
            const phoneNumber = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] : null

            await storage.updateSession(sessionId, {
              status: 'connected',
              connectedAt: new Date(),
              phoneNumber: phoneNumber, // Save phone number
            })

            // Emit SSE event for connection
            eventStore.emit(sessionId, {
              type: 'session_connected',
              sessionId,
              user: {
                jid: sock.user?.id,
                name: sock.user?.name,
              },
              phoneNumber: phoneNumber,
              timestamp: new Date().toISOString(),
            })

            // Send welcome message to WhatsApp user's personal chat
            try {
              const userJid = sock.user?.id
              if (userJid) {
                // Convert to personal chat JID format - handle both formats
                let personalChatJid = userJid
                if (userJid.includes(':')) {
                  // Format like "447350152214:31@s.whatsapp.net" -> "447350152214@s.whatsapp.net"
                  personalChatJid = userJid.split(':')[0] + '@s.whatsapp.net'
                }
                
                const welcomeMessage = `🎉 Welcome! Your WhatsApp session is now connected.\n\nSession ID: ${sessionId}\n\nYour bot is ready to receive and send messages.`

                console.log(`📱 Attempting to send welcome message to: ${personalChatJid}`)
                
                // Wait a bit longer for connection to fully stabilize
                setTimeout(async () => {
                  try {
                    await sock.sendMessage(personalChatJid, { text: welcomeMessage })
                    console.log('✅ Welcome message sent successfully to:', personalChatJid)
                  } catch (delayedError) {
                    console.error('❌ Failed to send welcome message:', delayedError)
                    // Try alternative JID format
                    try {
                      const altJid = userJid
                      await sock.sendMessage(altJid, { text: welcomeMessage })
                      console.log('✅ Welcome message sent using alternative JID:', altJid)
                    } catch (altError) {
                      console.error('❌ Alternative JID also failed:', altError)
                    }
                  }
                }, 5000) // Increased delay to 5 seconds
              }
            } catch (messageError) {
              console.error('❌ Error in welcome message setup:', messageError)
            }

            if (callback) {
              callback({
                type: 'session_connected',
                sessionId,
                user: {
                  jid: sock.user?.id,
                  name: sock.user?.name,
                },
                phoneNumber: phoneNumber,
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
      sock.ev.on('creds.update', async (creds) => {
        // Save to file system
        await saveCreds()

        // Also save to database
        try {
          const sessionDataPath = path.join(sessionPath, 'creds.json')
          if (fs.existsSync(sessionDataPath)) {
            const sessionData = fs.readFileSync(sessionDataPath, 'utf8')
            await storage.updateSession(sessionId, {
              sessionData: sessionData
            })
            console.log('✅ Session credentials saved to database for:', sessionId)
          }
        } catch (error) {
          console.error('Failed to save session data to database:', error)
        }
      })

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
        throw new Error('Server at capacity. Please try again later or try during off-peak hours.')
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
        browser: ['Ubuntu', 'Chrome', `${Date.now()}.${Math.floor(Math.random() * 1000)}`], // Unique browser ID per session
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
          connectionEstablished = true

          try {
            // Extract phone number from user JID for code pairing
            const phoneNumber = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] : null

            await storage.updateSession(sessionId, {
              status: 'connected',
              connectedAt: new Date(),
              phoneNumber: phoneNumber,
            })

            // Send welcome message to WhatsApp user's personal chat
            try {
              const userJid = sock.user?.id
              if (userJid) {
                // Convert to personal chat JID format
                const personalChatJid = userJid.replace(':9@s.whatsapp.net', '@s.whatsapp.net')
                const welcomeMessage = `🎉 Welcome! Your WhatsApp session is now connected.\n\nSession ID: ${sessionId}\n\nThis bot is ready to receive and send messages.`

                // Wait a bit for connection to stabilize
                setTimeout(async () => {
                  try {
                    await sock.sendMessage(personalChatJid, { text: welcomeMessage })
                    console.log('✅ Welcome message sent to personal chat:', personalChatJid)
                  } catch (delayedError) {
                    console.error('Failed to send delayed welcome message:', delayedError)
                  }
                }, 3000)
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
                phoneNumber: phoneNumber,
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

          try {
            if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
              console.log('Restart required after pairing code entry - checking credentials...')

              const hasValidCreds = sock.authState?.creds?.registered || sock.authState?.creds?.me

              if (hasValidCreds) {
                console.log('✅ Pairing code successful! Restarting authenticated session...')

                this.cleanupSession(sessionId)
                setTimeout(() => {
                  this.startAuthenticatedSession(sessionId, callback)
                }, 2000)
                return
              }
            }

            if (!connectionEstablished && !pairingCodeGenerated) {
              await storage.updateSession(sessionId, {
                status: 'failed',
              })

              // Emit error via SSE
              eventStore.emit(sessionId, {
                type: 'error',
                sessionId,
                message: 'Connection failed during pairing',
                timestamp: new Date().toISOString(),
              })

              if (callback) {
                callback({
                  type: 'error',
                  sessionId,
                  message: 'Connection failed during pairing',
                  timestamp: new Date().toISOString(),
                })
              }
            }
          } catch (error) {
            console.error('Failed to handle connection close:', error)
          }

          this.cleanupSession(sessionId)
        }
      })

      sock.ev.on('creds.update', async (creds) => {
        // Save to file system
        await saveCreds()

        // Also save to database
        try {
          const sessionDataPath = path.join(sessionPath, 'creds.json')
          if (fs.existsSync(sessionDataPath)) {
            const sessionData = fs.readFileSync(sessionDataPath, 'utf8')
            await storage.updateSession(sessionId, {
              sessionData: sessionData
            })
            console.log('✅ Session credentials saved to database for:', sessionId)
          }
        } catch (error) {
          console.error('Failed to save session data to database:', error)
        }
      })

      try {
        console.log('📱 Requesting pairing code for:', cleanPhone)

        // Add a delay to ensure connection is stable
        await new Promise(resolve => setTimeout(resolve, 2000))

        const code = await sock.requestPairingCode(cleanPhone)
        pairingCodeGenerated = true

        console.log(`✅ Generated 8-digit pairing code: ${code}`)

        const pairingCodeData = {
          type: 'pairing_code',
          code,
          sessionId,
          timestamp: new Date().toISOString(),
        }

        // Emit pairing code via SSE
        console.log('📤 Emitting pairing code event:', pairingCodeData)
        eventStore.emit(sessionId, pairingCodeData)

        if (callback) {
          console.log('📞 Calling callback with pairing code')
          callback(pairingCodeData)
        }

        return { code }

      } catch (error) {
        console.error('❌ Failed to generate pairing code:', error)

        // Emit error via SSE
        eventStore.emit(sessionId, {
          type: 'error',
          sessionId,
          message: 'Failed to generate pairing code',
          timestamp: new Date().toISOString(),
        })

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
    console.log('🔄 Starting authenticated session for:', sessionId)

    const sessionPath = path.join(process.cwd(), 'sessions', sessionId)

    // Make sure session directory exists
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      logger: P({ level: 'silent' }), // Use silent to reduce noise
    })

    // Store connection
    this.connections.set(sessionId, sock)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        console.log('✅ Authenticated WhatsApp session started:', sessionId)

        // Update session in database
        try {
          const phoneNumber = sock.user?.id?.split(':')[0] || 'Unknown'
          const name = sock.user?.name || 'Unknown'

          await storage.updateSession(sessionId, {
            status: 'connected',
            phoneNumber: phoneNumber,
            connectedAt: new Date(),
          })

          const connectionData = {
            type: 'session_connected',
            sessionId,
            phoneNumber: phoneNumber,
            name: name,
            timestamp: new Date().toISOString(),
          }

          // Emit via SSE
          eventStore.emit(sessionId, connectionData)

          if (callback) {
            callback(connectionData)
          }
        } catch (error) {
          console.error('Failed to update session:', error)
        }
      } else if (connection === 'close') {
        console.log('❌ Authenticated session closed:', sessionId)
        this.cleanupSession(sessionId)
      }
    })

    sock.ev.on('creds.update', async (creds) => {
      // Save to file system
      await saveCreds()

      // Also save to database
      try {
        const sessionDataPath = path.join(sessionPath, 'creds.json')
        if (fs.existsSync(sessionDataPath)) {
          const sessionData = fs.readFileSync(sessionDataPath, 'utf8')
          await storage.updateSession(sessionId, {
            sessionData: sessionData
          })
          console.log('✅ Session credentials updated in database for:', sessionId)
        }
      } catch (error) {
        console.error('Failed to update session data in database:', error)
      }
    })
  }

  private cleanupSession(sessionId: string, deleteFromDb: boolean = true) {
    const sock = this.activeSessions.get(sessionId)
    if (sock) {
      try {
        // Check if socket is still open before trying to end it
        if (sock.ws && sock.ws.readyState === 1) { // WebSocket.OPEN = 1
          sock.end()
        }
        if (sock.removeAllListeners && typeof sock.removeAllListeners === 'function') {
          sock.removeAllListeners()
        }
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