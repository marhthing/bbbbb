"use client"

import { useMutation } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/utils'

interface PairingMethodProps {
  sessionId: string
  onMethodSelect: (method: "qr" | "code") => void
  onBack: () => void
  currentStep: number
}

export function PairingMethod({ sessionId, onMethodSelect, onBack, currentStep }: PairingMethodProps) {
  const { toast } = useToast()

  const createSessionMutation = useMutation({
    mutationFn: async (method: "qr" | "code") => {
      const response = await apiRequest("POST", "/api/sessions", {
        id: sessionId,
        pairingMethod: method,
      })
      return response.json()
    },
    onSuccess: (_data, method) => {
      onMethodSelect(method)
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to create session"

      if (errorMessage.includes("already active and connected")) {
        toast({
          title: "Session Already Active",
          description: "This session ID is already connected. Please use a different ID or wait for the current session to disconnect.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
      }
    },
  })

  const isCreatingSession = createSessionMutation.isPending

  const handleMethodSelect = (method: 'qr' | 'code') => {
    if (isCreatingSession) return

    createSessionMutation.mutate(method)
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Choose Pairing Method</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Step</span>
              <span className="bg-primary text-primary-foreground text-sm px-2 py-1 rounded">
                {currentStep}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground">Select how you want to connect your WhatsApp account</p>
          <div className="mt-2 text-sm bg-accent/50 border-l-4 border-primary p-3 rounded-r-md">
            <span className="font-medium">Session ID: </span>
            <span className="font-mono">{sessionId}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card
              className={`transition-colors ${
                createSessionMutation.isPending
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-accent/50'
              }`}
              onClick={() => !createSessionMutation.isPending && handleMethodSelect("qr")}
            >
              <CardContent className="p-4">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M12 12h-3m-1 8h6m3-7H3m18-6V9a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2v-1m-2-7a2 2 0 00-2-2H5a2 2 0 00-2 2v1m0 0h16" />
                    </svg>
                  </div>
                  <h3 className="font-semibold">QR Code</h3>
                  <p className="text-sm text-muted-foreground">
                    Scan a QR code with your phone&apos;s WhatsApp app
                  </p>
                  <div className="text-xs text-muted-foreground">
                    <p>✓ Quick and easy</p>
                    <p>✓ No phone number needed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`transition-colors ${
                createSessionMutation.isPending
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-accent/50'
              }`}
              onClick={() => !createSessionMutation.isPending && handleMethodSelect("code")}
            >
              <CardContent className="p-4">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-1.586l-2.707 2.707A1 1 0 0116 18v-2h-2.293z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold">Pairing Code</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter a 8-digit code sent to your phone number
                  </p>
                  <div className="text-xs text-muted-foreground">
                    <p>✓ Works on all devices</p>
                    <p>✓ No camera required</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="pt-4 flex space-x-3">
            <Button
              variant="secondary"
              onClick={onBack}
              className="flex-1"
              disabled={createSessionMutation.isPending}
            >
              Back
            </Button>
          </div>

          {createSessionMutation.isPending && (
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span>Creating session...</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Please wait, do not click the buttons above</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}