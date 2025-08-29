"use client"

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { useWebSocket } from '@/hooks/use-websocket'
import { apiRequest } from '@/lib/utils'

interface QRPairingProps {
  sessionId: string
  onSuccess: (data: any) => void
  onError: (error: string) => void
  onBack: () => void
  currentStep: number
}

export function QRPairing({ sessionId, onSuccess, onError, onBack, currentStep }: QRPairingProps) {
  const [qrCode, setQrCode] = useState<string>("")
  const [status, setStatus] = useState<string>("Initializing...")
  const [progress, setProgress] = useState(0)
  const { toast } = useToast()
  const [isInitialized, setIsInitialized] = useState(false); // State to track if initialization has started

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    sessionId,
    onQRCode: (qr) => {
      console.log('Received QR code:', qr)
      setQrCode(`data:image/png;base64,${qr}`)
      setStatus("Scan the QR code with WhatsApp")
      setProgress(50)
    },
    onConnected: (data) => {
      console.log('WhatsApp connected:', data)
      setProgress(100)
      onSuccess(data)
    },
    onError: (error) => {
      console.error('WebSocket error:', error)
      onError(error)
    }
  })

  const startQRPairingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/qr-pairing`)
      return response.json()
    },
    onSuccess: () => {
      setStatus("Waiting for QR code...")
      setProgress(25)
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to start QR pairing"
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
      onError(errorMessage)
    },
  })

  const refreshQRMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/refresh-qr`)
      return response.json()
    },
    onSuccess: () => {
      setStatus("Refreshing QR code...")
      setQrCode("")
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to refresh QR code",
        variant: "destructive",
      })
    },
  })

  // Start QR pairing only after WebSocket connection is established
  useEffect(() => {
    if (isConnected && !isInitialized) {
      console.log('WebSocket connected, starting QR pairing for session:', sessionId)
      setIsInitialized(true)

      const startQRPairing = async () => {
        try {
          // Small delay to ensure WebSocket listener is fully registered
          await new Promise(resolve => setTimeout(resolve, 1000))

          const response = await fetch(`/api/sessions/${sessionId}/qr-pairing`, {
            method: 'POST'
          })

          if (!response.ok) {
            const errorData = await response.text()
            throw new Error(errorData || 'Failed to start QR pairing')
          }

          console.log('QR pairing request sent successfully')
          setStatus("Generating QR code...")
          setProgress(25)
        } catch (error) {
          console.error('Failed to start QR pairing:', error)
          const errorMsg = error instanceof Error ? error.message : String(error)
          onError(errorMsg)
        }
      }

      startQRPairing()
    }
  }, [isConnected, isInitialized, sessionId, onError])

  // Real QR codes are now received via WebSocket

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Scan QR Code</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Step</span>
              <span className="bg-primary text-primary-foreground text-sm px-2 py-1 rounded">
                {currentStep}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground">Use your phone to scan the QR code below</p>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <div className="mb-4">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground mt-2">{status}</p>
            </div>

            {qrCode ? (
              <div className="inline-block p-4 bg-white rounded-lg shadow-sm border">
                <img 
                  src={qrCode} 
                  alt="QR Code for WhatsApp pairing" 
                  className="w-48 h-48 mx-auto"
                />
              </div>
            ) : (
              <div className="w-48 h-48 mx-auto bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Generating QR code...</p>
                </div>
              </div>
            )}

            {qrCode && (
              <div className="mt-4 text-sm text-muted-foreground space-y-1">
                <p>1. Open WhatsApp on your phone</p>
                <p>2. Go to Settings → Linked Devices</p>
                <p>3. Tap "Link a Device"</p>
                <p>4. Point your camera at this QR code</p>
              </div>
            )}
          </div>

          <div className="flex space-x-3">
            <Button
              variant="secondary"
              onClick={onBack}
              className="flex-1"
              disabled={startQRPairingMutation.isPending}
            >
              Back
            </Button>
            {qrCode && (
              <Button
                variant="outline"
                onClick={() => refreshQRMutation.mutate()}
                disabled={refreshQRMutation.isPending}
              >
                {refreshQRMutation.isPending ? "Refreshing..." : "Refresh QR"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}