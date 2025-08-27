import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onOpen?: (event: Event) => void;
}

export function useWebSocket(sessionId: string | null, options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${sessionId}`;

    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = (event) => {
        setIsConnected(true);
        setError(null);
        options.onOpen?.(event);
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          options.onMessage?.(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onerror = (event) => {
        setError('WebSocket connection error');
        options.onError?.(event);
      };

      ws.current.onclose = (event) => {
        setIsConnected(false);
        if (event.code !== 1000) {
          setError(`Connection closed: ${event.reason || 'Unknown reason'}`);
        }
        options.onClose?.(event);
      };
    } catch (error) {
      setError('Failed to create WebSocket connection');
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [sessionId]);

  const sendMessage = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };

  return {
    isConnected,
    error,
    sendMessage,
  };
}
