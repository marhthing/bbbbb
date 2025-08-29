import { NextRequest } from 'next/server'

// Simple in-memory event store for SSE
class EventStore {
  private listeners = new Map<string, Array<(data: any) => void>>()
  
  subscribe(sessionId: string, callback: (data: any) => void) {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, [])
    }
    this.listeners.get(sessionId)!.push(callback)
    
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
    const callbacks = this.listeners.get(sessionId)
    if (callbacks) {
      callbacks.forEach(callback => callback(data))
    }
  }
}

export const eventStore = new EventStore()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      
      // Send initial connection event
      const send = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      }
      
      // Send welcome message
      send({
        type: 'welcome',
        sessionId,
        timestamp: new Date().toISOString()
      })
      
      // Subscribe to events for this session
      const unsubscribe = eventStore.subscribe(sessionId, send)
      
      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        send({
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        })
      }, 30000) // 30 seconds
      
      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch (error) {
          // Controller might already be closed
        }
      })
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  })
}