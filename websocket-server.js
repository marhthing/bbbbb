
const { WebSocketServer } = require('ws')

class WebSocketManager {
  constructor() {
    this.wss = null
    this.clients = new Map()
    this.sessionRooms = new Map()
  }

  initialize(server) {
    if (this.wss) return // Already initialized

    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      perMessageDeflate: false,
    })

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId()
      console.log(`New WebSocket connection: ${clientId}`)

      const client = {
        ws,
        clientId,
      }

      this.clients.set(clientId, client)

      // Handle incoming messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString())
          this.handleMessage(clientId, data)
        } catch (error) {
          console.error('Invalid WebSocket message:', error)
        }
      })

      // Handle client disconnect
      ws.on('close', () => {
        console.log(`WebSocket disconnected: ${clientId}`)
        this.removeClient(clientId)
      })

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error)
        this.removeClient(clientId)
      })

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        clientId,
        timestamp: new Date().toISOString(),
      }))
    })

    console.log('WebSocket server initialized')
  }

  generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9)
  }

  handleMessage(clientId, data) {
    const client = this.clients.get(clientId)
    if (!client) return

    switch (data.type) {
      case 'join_session':
        this.joinSession(clientId, data.sessionId)
        break
      case 'leave_session':
        this.leaveSession(clientId, data.sessionId)
        break
      default:
        console.log('Unknown WebSocket message type:', data.type)
    }
  }

  joinSession(clientId, sessionId) {
    const client = this.clients.get(clientId)
    if (!client) return

    // Leave previous session if any
    if (client.sessionId) {
      this.leaveSession(clientId, client.sessionId)
    }

    // Join new session
    client.sessionId = sessionId
    
    if (!this.sessionRooms.has(sessionId)) {
      this.sessionRooms.set(sessionId, new Set())
    }
    
    this.sessionRooms.get(sessionId).add(clientId)
    
    console.log(`Client ${clientId} joined session ${sessionId}`)

    // Send confirmation
    client.ws.send(JSON.stringify({
      type: 'session_joined',
      sessionId,
      timestamp: new Date().toISOString(),
    }))
  }

  leaveSession(clientId, sessionId) {
    const client = this.clients.get(clientId)
    if (!client) return

    // Remove from session room
    const room = this.sessionRooms.get(sessionId)
    if (room) {
      room.delete(clientId)
      if (room.size === 0) {
        this.sessionRooms.delete(sessionId)
      }
    }

    // Clear session from client
    client.sessionId = undefined
    
    console.log(`Client ${clientId} left session ${sessionId}`)
  }

  removeClient(clientId) {
    const client = this.clients.get(clientId)
    if (!client) return

    // Leave session if in one
    if (client.sessionId) {
      this.leaveSession(clientId, client.sessionId)
    }

    // Remove client
    this.clients.delete(clientId)
  }

  // Public method to broadcast to a specific session
  broadcastToSession(sessionId, data) {
    const room = this.sessionRooms.get(sessionId)
    if (!room || room.size === 0) {
      console.log(`No clients in session ${sessionId}`)
      return
    }

    const message = JSON.stringify({
      ...data,
      sessionId,
      timestamp: new Date().toISOString(),
    })

    let sentCount = 0
    room.forEach(clientId => {
      const client = this.clients.get(clientId)
      if (client && client.ws.readyState === 1) { // WebSocket.OPEN
        try {
          client.ws.send(message)
          sentCount++
        } catch (error) {
          console.error(`Failed to send to client ${clientId}:`, error)
          this.removeClient(clientId)
        }
      }
    })

    console.log(`Broadcasted to ${sentCount} clients in session ${sessionId}:`, data.type)
  }

  // Public method to broadcast to all clients
  broadcastToAll(data) {
    const message = JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
    })

    let sentCount = 0
    this.clients.forEach(client => {
      if (client.ws.readyState === 1) { // WebSocket.OPEN
        try {
          client.ws.send(message)
          sentCount++
        } catch (error) {
          console.error(`Failed to send to client ${client.clientId}:`, error)
          this.removeClient(client.clientId)
        }
      }
    })

    console.log(`Broadcasted to ${sentCount} clients:`, data.type)
  }

  getSessionClientCount(sessionId) {
    const room = this.sessionRooms.get(sessionId)
    return room ? room.size : 0
  }

  getTotalClients() {
    return this.clients.size
  }
}

const wsManager = new WebSocketManager()

// Helper function to broadcast session updates
function broadcastToSession(sessionId, data) {
  wsManager.broadcastToSession(sessionId, data)
}

module.exports = {
  wsManager,
  broadcastToSession
}
