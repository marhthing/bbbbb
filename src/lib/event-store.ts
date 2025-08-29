// Centralized EventStore for SSE communication - HMR-resistant
class EventStore {
  private listeners = new Map<string, Array<(data: any) => void>>()
  private eventQueue = new Map<string, Array<any>>() // Queue events for sessions without listeners
  private maxQueueSize = 10 // Max queued events per session

  subscribe(sessionId: string, callback: (data: any) => void) {
    console.log(`📝 EventStore: Subscribing to session ${sessionId}`)
    
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, [])
    }
    this.listeners.get(sessionId)!.push(callback)
    console.log(`📊 EventStore: Now ${this.listeners.get(sessionId)!.length} listeners for session ${sessionId}`)

    // Replay any queued events for this session
    const queuedEvents = this.eventQueue.get(sessionId) || []
    if (queuedEvents.length > 0) {
      console.log(`🔄 EventStore: Replaying ${queuedEvents.length} queued events for ${sessionId}`)
      queuedEvents.forEach(event => callback(event))
      this.eventQueue.delete(sessionId) // Clear queue after replay
    }

    return () => {
      const callbacks = this.listeners.get(sessionId)
      if (callbacks) {
        const index = callbacks.indexOf(callback)
        if (index > -1) {
          callbacks.splice(index, 1)
          console.log(`🗑️ EventStore: Listener removed for session ${sessionId}. Remaining: ${callbacks.length}`)
        }
      }
    }
  }

  emit(sessionId: string, data: any) {
    console.log(`📢 EventStore: Emitting to session ${sessionId}:`, data.type)
    const callbacks = this.listeners.get(sessionId)
    console.log(`📊 EventStore: Found ${callbacks?.length || 0} listeners for session ${sessionId}`)
    
    if (callbacks && callbacks.length > 0) {
      console.log(`🚀 EventStore: Calling ${callbacks.length} callbacks`)
      callbacks.forEach((callback, index) => {
        try {
          console.log(`📞 EventStore: Calling callback ${index + 1}`)
          callback(data)
        } catch (error) {
          console.error(`❌ EventStore: Error in callback ${index + 1}:`, error)
        }
      })
    } else {
      // No listeners - queue the event for later replay
      console.log(`⏳ EventStore: No listeners for session ${sessionId}, queueing event`)
      if (!this.eventQueue.has(sessionId)) {
        this.eventQueue.set(sessionId, [])
      }
      const queue = this.eventQueue.get(sessionId)!
      queue.push(data)
      
      // Limit queue size
      if (queue.length > this.maxQueueSize) {
        queue.shift() // Remove oldest event
      }
      console.log(`📦 EventStore: Event queued for ${sessionId}. Queue size: ${queue.length}`)
      console.log(`🔍 EventStore: Available sessions:`, Array.from(this.listeners.keys()))
    }
  }

  // Clean up old queued events
  cleanupOldEvents(maxAgeMs: number = 5 * 60 * 1000) {
    const now = Date.now()
    Array.from(this.eventQueue.entries()).forEach(([sessionId, events]) => {
      const filteredEvents = events.filter((event: any) => {
        const eventTime = new Date(event.timestamp).getTime()
        return now - eventTime < maxAgeMs
      })
      if (filteredEvents.length === 0) {
        this.eventQueue.delete(sessionId)
      } else {
        this.eventQueue.set(sessionId, filteredEvents)
      }
    })
  }

  // Debug method to see all listeners
  getListenerCount(sessionId: string): number {
    return this.listeners.get(sessionId)?.length || 0
  }

  // Debug method to see queue status
  getQueueStatus(): { [key: string]: number } {
    const status: { [key: string]: number } = {}
    Array.from(this.eventQueue.entries()).forEach(([sessionId, events]) => {
      status[sessionId] = events.length
    })
    return status
  }
}

// Use globalThis to ensure singleton survives HMR
declare global {
  var __eventStore: EventStore | undefined
}

if (!globalThis.__eventStore) {
  globalThis.__eventStore = new EventStore()
  console.log('🏗️ EventStore: Created new instance')
  
  // Clean up old events every 2 minutes
  setInterval(() => {
    globalThis.__eventStore?.cleanupOldEvents()
  }, 2 * 60 * 1000)
} else {
  console.log('♻️ EventStore: Reusing existing instance (HMR)')
}

export const eventStore = globalThis.__eventStore