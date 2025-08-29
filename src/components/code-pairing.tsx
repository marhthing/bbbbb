"use client"

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { useWebSocket } from '@/hooks/use-websocket'
import { apiRequest } from '@/lib/utils'

interface CodePairingProps {
  sessionId: string
  onSuccess: (data: any) => void
  onError: (error: string) => void
  onBack: () => void
  currentStep: number
}

export function CodePairing({ sessionId, onSuccess, onError, onBack, currentStep }: CodePairingProps) {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [pairingCode, setPairingCode] = useState("")
  const [generatedCode, setGeneratedCode] = useState("")
  const [status, setStatus] = useState<string>("Enter your phone number")
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState<"phone" | "code">("phone")
  const { toast } = useToast()

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    sessionId,
    onPairingCode: (code) => {
      console.log('🎯 Received pairing code in component:', code)
      console.log('🔄 Updating UI state to show pairing code')
      setGeneratedCode(code)
      setStatus("Enter the code in WhatsApp")
      setProgress(50)
      setStep("code")
    },
    onConnected: (data) => {
      console.log('WhatsApp connected in component:', data)
      setStatus("Successfully connected!")
      setProgress(100)
      // Small delay to show success message before transitioning
      setTimeout(() => {
        onSuccess(data)
      }, 1000)
    },
    onError: (error) => {
      console.error('WebSocket error in component:', error)
      onError(error)
    }
  })

  const requestCodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/request-code`, {
        phoneNumber: phoneNumber
      })
      return response.json()
    },
    onSuccess: (data) => {
      // Real pairing codes are received via WebSocket
      // The backend will send the code through WebSocket when ready
      setStatus("Generating pairing code...")
      setProgress(25)
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to request pairing code"
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
      onError(errorMessage)
    },
  })

  const submitCodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/submit-code`, {
        code: pairingCode
      })
      return response.json()
    },
    onSuccess: () => {
      setStatus("Verifying code...")
      setProgress(75)
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to submit pairing code"
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    },
  })

  // Removed polling logic - using WebSocket for real-time updates

  const handleRequestCode = () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Please enter your phone number",
        variant: "destructive",
      })
      return
    }
    requestCodeMutation.mutate()
  }

  const handleSubmitCode = () => {
    if (!pairingCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter the pairing code",
        variant: "destructive",
      })
      return
    }
    submitCodeMutation.mutate()
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Pairing Code</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Step</span>
              <span className="bg-primary text-primary-foreground text-sm px-2 py-1 rounded">
                {currentStep}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground">Connect using a pairing code sent to your phone</p>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <Progress value={progress} className="w-full mb-4" />
            <p className="text-sm text-muted-foreground">{status}</p>
          </div>

          {step === "phone" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Phone Number</label>
                <Input
                  type="tel"
                  placeholder="+1234567890 (include country code)"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={requestCodeMutation.isPending}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Include your country code (e.g., +1 for US, +44 for UK)
                </p>
              </div>
              
              <Button
                onClick={handleRequestCode}
                disabled={requestCodeMutation.isPending || !phoneNumber.trim()}
                className="w-full"
              >
                {requestCodeMutation.isPending ? "Requesting Code..." : "Request Pairing Code"}
              </Button>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="bg-accent/50 border border-primary/20 rounded-lg p-4 mb-4">
                  <p className="text-sm text-muted-foreground mb-2">Your pairing code:</p>
                  <p className="text-2xl font-mono font-bold text-primary">{generatedCode}</p>
                </div>
                
                <div className="text-sm text-muted-foreground space-y-1 mb-4">
                  <p>1. Open WhatsApp on your phone</p>
                  <p>2. Go to Settings → Linked Devices</p>
                  <p>3. Tap "Link a Device"</p>
                  <p>4. Tap "Link with phone number instead"</p>
                  <p>5. Enter the code above: <strong>{generatedCode}</strong></p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Confirm Code Entry</label>
                <Input
                  placeholder="Enter the code you just typed in WhatsApp"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  disabled={submitCodeMutation.isPending}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Type the same code here to confirm you&apos;ve entered it correctly
                </p>
              </div>
              
              <Button
                onClick={handleSubmitCode}
                disabled={submitCodeMutation.isPending || pairingCode !== generatedCode}
                className="w-full"
              >
                {submitCodeMutation.isPending ? "Verifying..." : "Verify Code"}
              </Button>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              variant="secondary"
              onClick={onBack}
              className="flex-1"
              disabled={requestCodeMutation.isPending || submitCodeMutation.isPending}
            >
              Back
            </Button>
            {step === "code" && (
              <Button
                variant="outline"
                onClick={() => {
                  setStep("phone")
                  setPhoneNumber("")
                  setPairingCode("")
                  setGeneratedCode("")
                  setProgress(0)
                  setStatus("Enter your phone number")
                }}
              >
                Use Different Number
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}