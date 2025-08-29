"use client"

import { useEffect, useRef, useState } from 'react'

interface SSEMessage {
  type: string
  sessionId?: string
  qr?: string
  code?: string
  timestamp: string
  phoneNumber?: string // Added to store phone number
  [key: string]: any
}

interface UseSSEProps {
  sessionId: string
  onQRCode?: (qr: string) => void
  onPairingCode?: (code: string) => void
  onConnected?: (data: any) => void
  onError?: (error: string) => void
}

export function useWebSocket({ 
  sessionId, 
  onQRCode, 
  onPairingCode, 
  onConnected, 
  onError 
}: UseSSEProps) {
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const connect = () => {
    try {
      const sseUrl = `/api/events/${sessionId}`

      console.log('Connecting to SSE:', sseUrl)
      eventSourceRef.current = new EventSource(sseUrl)

      eventSourceRef.current.onopen = () => {
        console.log('SSE connected')
        setIsConnected(true)
        reconnectAttempts.current = 0
      }

      eventSourceRef.current.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data)
          console.log('📥 SSE message received:', message.type, message)

          switch (message.type) {
            case 'qr_code':
              if (message.qr && onQRCode) {
                onQRCode(message.qr)
              }
              break
            case 'pairing_code':
              console.log('Processing pairing code:', message.code)
              if (message.code && onPairingCode) {
                onPairingCode(message.code)
              }
              break
            case 'session_connected':
            case 'connection_open':
              if (onConnected) {
                // Pass the entire message to onConnected to access phoneNumber
                onConnected(message) 
              }
              break
            case 'connecting':
              console.log('Connection status: connecting')
              break
            case 'error':
              console.error('SSE error received:', message.message)
              if (onError) {
                onError(message.message || 'SSE error')
              }
              break
            case 'welcome':
            case 'heartbeat':
              // Ignore these system messages
              break
            default:
              console.log('Unknown SSE message type:', message.type, message)
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error)
        }
      }

      eventSourceRef.current.onerror = (error) => {
        console.log('SSE disconnected')
        setIsConnected(false)

        // Attempt to reconnect if not intentionally closed
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current})`)

          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        } else {
          console.error('SSE error:', error)
          if (onError) {
            onError('SSE connection error')
          }
        }
      }

    } catch (error) {
      console.error('Failed to create SSE connection:', error)
      if (onError) {
        onError('Failed to connect to server')
      }
    }
  }

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [sessionId])

  return {
    isConnected,
    connect,
    disconnect
  }
}