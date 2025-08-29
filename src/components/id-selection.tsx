"use client"

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/utils'

interface IDSelectionProps {
  onNext: (id: string) => void
  currentStep: number
}

export function IDSelection({ onNext, currentStep }: IDSelectionProps) {
  const [idType, setIdType] = useState<"custom" | "auto">("custom")
  const [customId, setCustomId] = useState("")
  const [generatedId, setGeneratedId] = useState("")
  const [sessionStatus, setSessionStatus] = useState<any>(null)
  const { toast } = useToast()

  const generateIdMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sessions/generate-id")
      return response.json()
    },
    onSuccess: (data) => {
      setGeneratedId(data.sessionId || data.id || "")
      setSessionStatus(null)
    },
    onError: (_error) => {
      toast({
        title: "Error",
        description: "Failed to generate ID. Please try again.",
        variant: "destructive",
      })
    },
  })

  const checkSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("GET", `/api/sessions/check/${encodeURIComponent(id)}`)
      return response.json()
    },
    onSuccess: (data) => {
      setSessionStatus(data)
    },
    onError: (_error) => {
      setSessionStatus(null)
    },
  })

  const handleIdTypeChange = (value: string) => {
    setIdType(value as "custom" | "auto")
    setSessionStatus(null)
    if (value === "auto" && !generatedId) {
      generateIdMutation.mutate()
    }
  }

  const handleCustomIdChange = (value: string) => {
    setCustomId(value)
    setSessionStatus(null)
  }

  // Debounce the session availability check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (customId.trim().length >= 3) {
        checkSessionMutation.mutate(customId.trim())
      }
    }, 800) // Wait 800ms after user stops typing

    return () => clearTimeout(timer)
  }, [customId])

  const handleNext = () => {
    const selectedId = idType === "custom" ? customId : generatedId

    if (!selectedId.trim()) {
      toast({
        title: "Error",
        description: "Please provide a session ID.",
        variant: "destructive",
      })
      return
    }

    if (idType === "custom" && customId.length < 3) {
      toast({
        title: "Error",
        description: "Custom ID must be at least 3 characters long.",
        variant: "destructive",
      })
      return
    }

    onNext(selectedId)
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">MATDEV Bot Session ID</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Step</span>
              <span className="bg-primary text-primary-foreground text-sm px-2 py-1 rounded">
                {currentStep}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground">Choose or generate a unique session identifier for your MATDEV Bot</p>
        </div>

        <div className="space-y-6">
          <RadioGroup value={idType} onValueChange={handleIdTypeChange}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="custom" />
              <label htmlFor="custom" className="text-sm font-medium cursor-pointer">
                Use custom ID
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="auto" id="auto" />
              <label htmlFor="auto" className="text-sm font-medium cursor-pointer">
                Generate ID automatically
              </label>
            </div>
          </RadioGroup>

          {idType === "custom" && (
            <div className="space-y-2">
              <Input
                placeholder="Enter your custom MATDEV session ID (min 3 characters)"
                value={customId || ""}
                onChange={(e) => handleCustomIdChange(e.target.value)}
                disabled={checkSessionMutation.isPending}
              />
              {checkSessionMutation.isPending && (
                <p className="text-xs text-muted-foreground">Checking availability...</p>
              )}
              {sessionStatus && (
                <div className={`text-xs p-2 rounded ${
                  sessionStatus.exists && sessionStatus.isActive 
                    ? 'bg-destructive/10 text-destructive' 
                    : sessionStatus.exists 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : 'bg-green-100 text-green-800'
                }`}>
                  {sessionStatus.exists && sessionStatus.isActive 
                    ? "⚠️ This ID is currently active. Please choose a different one."
                    : sessionStatus.exists 
                      ? "⚠️ This ID exists but is not active. You can reuse it."
                      : "✅ This ID is available!"}
                </div>
              )}
            </div>
          )}

          {idType === "auto" && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Input
                  value={generatedId || ""}
                  readOnly
                  placeholder="Click 'Generate New ID' to create one"
                />
                <Button
                  onClick={() => generateIdMutation.mutate()}
                  disabled={generateIdMutation.isPending}
                  variant="outline"
                >
                  {generateIdMutation.isPending ? "Generating..." : "Generate New ID"}
                </Button>
              </div>
              {generatedId && (
                <p className="text-xs text-green-600">✅ ID generated successfully!</p>
              )}
            </div>
          )}

          <div className="pt-4">
            <Button
              onClick={handleNext}
              className="w-full"
              disabled={
                idType === "custom" 
                  ? (customId.length < 3 || 
                     checkSessionMutation.isPending || 
                     !sessionStatus ||
                     (sessionStatus?.exists && sessionStatus?.isActive))
                  : (generateIdMutation.isPending || !generatedId)
              }
            >
              {idType === "custom" && checkSessionMutation.isPending 
                ? "Checking availability..." 
                : idType === "auto" && generateIdMutation.isPending
                  ? "Generating ID..."
                  : "Continue to Pairing Method"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}