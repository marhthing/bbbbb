"use client"

import { useState } from 'react'
import { IDSelection } from '@/components/id-selection'
import { PairingMethod } from '@/components/pairing-method'
import { QRPairing } from '@/components/qr-pairing'
import { CodePairing } from '@/components/code-pairing'
import { SuccessState } from '@/components/success-state'
import { ErrorState } from '@/components/error-state'

type Step = 'id-selection' | 'pairing-method' | 'qr-pairing' | 'code-pairing' | 'success' | 'error'
type PairingMethodType = 'qr' | 'code'

export default function Home() {
  const [currentStep, setCurrentStep] = useState<Step>('id-selection')
  const [sessionId, setSessionId] = useState<string>('')
  const [pairingMethod, setPairingMethod] = useState<PairingMethodType | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [sessionData, setSessionData] = useState<any>(null)

  const handleSessionIdSet = (id: string) => {
    setSessionId(id)
  }

  const handlePairingMethodSelect = (method: PairingMethodType) => {
    setPairingMethod(method)
    setCurrentStep(method === 'qr' ? 'qr-pairing' : 'code-pairing')
  }

  const handleSuccess = (data: any) => {
    setSessionData(data)
    setCurrentStep('success')
  }

  const handleError = (message: string) => {
    setErrorMessage(message)
    setCurrentStep('error')
  }

  const handleStepChange = (step: Step) => {
    setCurrentStep(step)
  }

  const handleStartOver = () => {
    setCurrentStep('id-selection')
    setSessionId('')
    setPairingMethod(null)
    setErrorMessage('')
    setSessionData(null)
  }

  const handleRetry = () => {
    if (pairingMethod) {
      setCurrentStep(pairingMethod === 'qr' ? 'qr-pairing' : 'code-pairing')
    } else {
      setCurrentStep('pairing-method')
    }
    setErrorMessage('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            WhatsApp Pairing
          </h1>
          <p className="text-lg text-gray-600">
            Connect your WhatsApp account securely and easily
          </p>
        </div>

        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          {currentStep === 'id-selection' && (
            <IDSelection
              onNext={(id) => {
                handleSessionIdSet(id)
                handleStepChange('pairing-method')
              }}
              currentStep={1}
            />
          )}

          {currentStep === 'pairing-method' && (
            <PairingMethod
              sessionId={sessionId}
              onMethodSelect={handlePairingMethodSelect}
              onBack={() => handleStepChange('id-selection')}
              currentStep={2}
            />
          )}

          {currentStep === 'qr-pairing' && (
            <QRPairing
              sessionId={sessionId}
              onSuccess={handleSuccess}
              onError={handleError}
              onBack={() => handleStepChange('pairing-method')}
              currentStep={3}
            />
          )}

          {currentStep === 'code-pairing' && (
            <CodePairing
              sessionId={sessionId}
              onSuccess={handleSuccess}
              onError={handleError}
              onBack={() => handleStepChange('pairing-method')}
              currentStep={3}
            />
          )}

          {currentStep === 'success' && (
            <SuccessState
              sessionData={sessionData}
              onCreateNew={handleStartOver}
            />
          )}

          {currentStep === 'error' && (
            <ErrorState
              errorMessage={errorMessage}
              onRetry={handleRetry}
              onStartOver={handleStartOver}
            />
          )}
        </div>
      </div>
    </div>
  )
}