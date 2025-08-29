import { NextRequest } from 'next/server'

// Simple in-memory event store for SSE
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
      console.log(`SSE connection opened for session: ${sessionId}`)

      // Send welcome message
      console.log(`📡 SSE: Sending welcome message for session ${sessionId}`)
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'welcome',
          sessionId,
          timestamp: new Date().toISOString()
        })}\n\n`)
      )

      // Register event listener
      const listener = (data: any) => {
        try {
          console.log(`📤 SSE: Emitting event for ${sessionId}:`, data.type, data)
          console.log(`🔍 SSE: Controller state - desiredSize:`, controller.desiredSize)
          // Check if controller is still open before enqueueing
          if (controller.desiredSize !== null) {
            console.log(`📡 SSE: Sending data to frontend:`, data)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            )
            console.log(`✅ SSE: Data sent successfully`)
          } else {
            console.log(`❌ SSE: Controller closed, cannot send data`)
          }
        } catch (error) {
          console.error('❌ SSE: Error sending data:', error)
        }
      }

      console.log(`🔗 SSE: Subscribing listener for session ${sessionId}`)
      const unsubscribe = eventStore.subscribe(sessionId, listener)
      console.log(`✅ SSE: Listener subscribed for session ${sessionId}`)

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        try {
          if (controller.desiredSize !== null) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'heartbeat',
                timestamp: new Date().toISOString()
              })}\n\n`)
            )
          }
        } catch (error) {
          console.error('Error sending SSE heartbeat:', error)
        }
      }, 30000) // 30 seconds

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        // eventStore.unsubscribe(sessionId, listener); // Assuming subscribe returns an unsubscribe function or similar
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