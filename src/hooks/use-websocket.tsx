"use client"

import { useEffect, useRef, useState } from 'react'

interface WebSocketMessage {
  type: string
  sessionId?: string
  qr?: string
  code?: string
  timestamp: string
  [key: string]: any
}

interface UseWebSocketProps {
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
}: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const connect = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const wsUrl = `${protocol}//${host}/ws`
      
      console.log('Connecting to WebSocket:', wsUrl)
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        reconnectAttempts.current = 0
        
        // Join the session room
        wsRef.current?.send(JSON.stringify({
          type: 'join_session',
          sessionId
        }))
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          console.log('WebSocket message received:', message)
          
          if (message.sessionId === sessionId) {
            switch (message.type) {
              case 'qr_code':
                if (message.qr && onQRCode) {
                  onQRCode(message.qr)
                }
                break
              case 'pairing_code':
                if (message.code && onPairingCode) {
                  onPairingCode(message.code)
                }
                break
              case 'session_connected':
              case 'connection_open':
                if (onConnected) {
                  onConnected(message)
                }
                break
              case 'error':
                if (onError) {
                  onError(message.message || 'WebSocket error')
                }
                break
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        setIsConnected(false)
        
        // Attempt to reconnect if not intentionally closed
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        if (onError) {
          onError('WebSocket connection error')
        }
      }

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      if (onError) {
        onError('Failed to connect to server')
      }
    }
  }

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'User initiated disconnect')
      wsRef.current = null
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