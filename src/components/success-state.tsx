"use client"

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SuccessStateProps {
  sessionData: any
  onCreateNew: () => void
}

export function SuccessState({ sessionData, onCreateNew }: SuccessStateProps) {
  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-green-600 mb-2">
              Successfully Connected!
            </h2>
            <p className="text-muted-foreground">
              Your WhatsApp account has been paired successfully
            </p>
          </div>

          {sessionData && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left">
              <h3 className="font-semibold text-green-800 mb-2">Session Details</h3>
              <div className="space-y-1 text-sm text-green-700">
                {sessionData.name && (
                  <p><span className="font-medium">Name:</span> {sessionData.name}</p>
                )}
                {sessionData.jid && (
                  <p><span className="font-medium">WhatsApp ID:</span> {sessionData.jid}</p>
                )}
                {sessionData.phoneNumber && (
                  <p><span className="font-medium">Phone:</span> {sessionData.phoneNumber}</p>
                )}
                {sessionData.connectedAt && (
                  <p><span className="font-medium">Connected:</span> {new Date(sessionData.connectedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <p>✅ Your WhatsApp is now linked to this session</p>
              <p>✅ You can now use WhatsApp Business API features</p>
              <p>✅ The session will remain active until manually disconnected</p>
            </div>

            <div className="pt-4">
              <Button onClick={onCreateNew} variant="outline" className="w-full">
                Create New Session
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}