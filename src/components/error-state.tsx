"use client"

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  errorMessage: string
  onRetry: () => void
  onStartOver: () => void
}

export function ErrorState({ errorMessage, onRetry, onStartOver }: ErrorStateProps) {
  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-red-600 mb-2">
              Connection Failed
            </h2>
            <p className="text-muted-foreground">
              We couldn&apos;t establish a connection to your WhatsApp account
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-800 mb-2">Error Details</h3>
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground text-left">
              <p className="font-medium mb-2">Common solutions:</p>
              <ul className="space-y-1">
                <li>• Make sure your phone has an active internet connection</li>
                <li>• Ensure WhatsApp is updated to the latest version</li>
                <li>• Try refreshing the QR code or requesting a new pairing code</li>
                <li>• Check that your phone number is correct (for code pairing)</li>
                <li>• Wait a few minutes and try again</li>
              </ul>
            </div>

            <div className="pt-4 space-y-2">
              <Button onClick={onRetry} className="w-full">
                Try Again
              </Button>
              <Button onClick={onStartOver} variant="outline" className="w-full">
                Start Over
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}