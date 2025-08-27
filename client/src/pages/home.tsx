import { useState } from "react";
import { IDSelection } from "@/components/id-selection";
import { PairingMethod } from "@/components/pairing-method";
import { QRPairing } from "@/components/qr-pairing";
import { CodePairing } from "@/components/code-pairing";
import { SuccessState } from "@/components/success-state";
import { ErrorState } from "@/components/error-state";

type Step = "id-selection" | "pairing-method" | "qr-pairing" | "code-pairing" | "success" | "error";
type PairingMethodType = "qr" | "code";

export default function Home() {
  const [currentStep, setCurrentStep] = useState<Step>("id-selection");
  const [sessionId, setSessionId] = useState<string>("");
  const [pairingMethod, setPairingMethod] = useState<PairingMethodType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [sessionData, setSessionData] = useState<any>(null);

  const handleStepChange = (step: Step) => {
    setCurrentStep(step);
  };

  const handleSessionIdSet = (id: string) => {
    setSessionId(id);
  };

  const handlePairingMethodSelect = (method: PairingMethodType) => {
    setPairingMethod(method);
    setCurrentStep(method === "qr" ? "qr-pairing" : "code-pairing");
  };

  const handleSuccess = (data: any) => {
    setSessionData(data);
    setCurrentStep("success");
  };

  const handleError = (message: string) => {
    setErrorMessage(message);
    setCurrentStep("error");
  };

  const handleRetry = () => {
    if (pairingMethod) {
      setCurrentStep(pairingMethod === "qr" ? "qr-pairing" : "code-pairing");
    } else {
      setCurrentStep("pairing-method");
    }
  };

  const handleStartOver = () => {
    setSessionId("");
    setPairingMethod(null);
    setErrorMessage("");
    setSessionData(null);
    setCurrentStep("id-selection");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-whatsapp rounded-lg flex items-center justify-center">
                <i className="fab fa-whatsapp text-white text-xl"></i>
              </div>
              <div>
                <h1 className="text-xl font-semibold">WhatsApp Linker</h1>
                <p className="text-sm text-muted-foreground">Secure Session Management</p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <i className="fas fa-shield-alt mr-1"></i>
              Secure Connection
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          {currentStep === "id-selection" && (
            <IDSelection
              onNext={(id) => {
                handleSessionIdSet(id);
                handleStepChange("pairing-method");
              }}
              currentStep={1}
            />
          )}

          {currentStep === "pairing-method" && (
            <PairingMethod
              sessionId={sessionId}
              onMethodSelect={handlePairingMethodSelect}
              onBack={() => handleStepChange("id-selection")}
              currentStep={2}
            />
          )}

          {currentStep === "qr-pairing" && (
            <QRPairing
              sessionId={sessionId}
              onSuccess={handleSuccess}
              onError={handleError}
              onBack={() => handleStepChange("pairing-method")}
              currentStep={3}
            />
          )}

          {currentStep === "code-pairing" && (
            <CodePairing
              sessionId={sessionId}
              onSuccess={handleSuccess}
              onError={handleError}
              onBack={() => handleStepChange("pairing-method")}
              currentStep={3}
            />
          )}

          {currentStep === "success" && (
            <SuccessState
              sessionData={sessionData}
              onCreateNew={handleStartOver}
            />
          )}

          {currentStep === "error" && (
            <ErrorState
              errorMessage={errorMessage}
              onRetry={handleRetry}
              onStartOver={handleStartOver}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-6">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-6 text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <i className="fas fa-lock text-green-600"></i>
              <span>Secure Connection</span>
            </div>
            <div className="flex items-center space-x-2">
              <i className="fas fa-database text-blue-600"></i>
              <span>Session Encrypted</span>
            </div>
            <div className="flex items-center space-x-2">
              <i className="fas fa-clock text-amber-600"></i>
              <span>Real-time Status</span>
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            Powered by Baileys • Built for high-performance WhatsApp linking
          </div>
        </div>
      </footer>
    </div>
  );
}
