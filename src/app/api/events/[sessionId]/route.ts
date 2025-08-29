import { NextRequest } from 'next/server'
import { eventStore } from '../../../../lib/event-store'

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
          console.log(`🔍 SSE: Controller state - desiredSize: ${controller.desiredSize}`)
          if (controller.desiredSize !== null && !controller.desiredSize === 0) {
            console.log(`📡 SSE: Sending data to frontend:`, data)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            )
            console.log(`✅ SSE: Data sent successfully`)
          } else {
            console.log(`⚠️ SSE: Controller closed or full, cannot send data`)
            // Unsubscribe from events if controller is closed
            unsubscribe()
          }
        } catch (error) {
          console.log(`❌ SSE: Error sending data:`, error)
          // Unsubscribe from events if there's an error
          unsubscribe()
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