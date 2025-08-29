// Centralized EventStore for SSE communication
class EventStore {
  private listeners = new Map<string, Array<(data: any) => void>>()

  subscribe(sessionId: string, callback: (data: any) => void) {
    console.log(`📝 EventStore: Subscribing to session ${sessionId}`)
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, [])
    }
    this.listeners.get(sessionId)!.push(callback)
    console.log(`📊 EventStore: Now ${this.listeners.get(sessionId)!.length} listeners for session ${sessionId}`)

    return () => {
      const callbacks = this.listeners.get(sessionId)
      if (callbacks) {
        const index = callbacks.indexOf(callback)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
      }
    }
  }

  emit(sessionId: string, data: any) {
    console.log(`📢 EventStore: Emitting to session ${sessionId}:`, data.type)
    const callbacks = this.listeners.get(sessionId)
    console.log(`📊 EventStore: Found ${callbacks?.length || 0} listeners for session ${sessionId}`)
    if (callbacks) {
      console.log(`🚀 EventStore: Calling ${callbacks.length} callbacks`)
      callbacks.forEach((callback, index) => {
        console.log(`📞 EventStore: Calling callback ${index + 1}`)
        callback(data)
      })
    } else {
      console.log(`❌ EventStore: No listeners for session ${sessionId}`)
      console.log(`🔍 EventStore: Available sessions:`, Array.from(this.listeners.keys()))
    }
  }

  // Debug method to see all listeners
  getListenerCount(sessionId: string): number {
    return this.listeners.get(sessionId)?.length || 0
  }
}

// Export a single instance
export const eventStore = new EventStore()