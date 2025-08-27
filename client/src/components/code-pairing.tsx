import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";

interface StepIndicatorProps {
  currentStep: number;
}

function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center justify-center w-8 h-8 rounded-full text-sm bg-muted text-muted-foreground">
        1
      </div>
      <div className="w-10 h-0.5 bg-border"></div>
      <div className="flex items-center justify-center w-8 h-8 rounded-full text-sm bg-muted text-muted-foreground">
        2
      </div>
      <div className="w-10 h-0.5 bg-border"></div>
      <div className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium bg-primary text-primary-foreground">
        3
      </div>
    </div>
  );
}

interface CodePairingProps {
  sessionId: string;
  onSuccess: (data: any) => void;
  onError: (message: string) => void;
  onBack: () => void;
  currentStep: number;
}

export function CodePairing({ sessionId, onSuccess, onError, onBack, currentStep }: CodePairingProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  
  const [generatedCode, setGeneratedCode] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const { toast } = useToast();

  const requestCodeMutation = useMutation({
    mutationFn: async () => {
      if (!phoneNumber.trim()) {
        throw new Error("Phone number is required");
      }
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/request-code`, {
        phoneNumber: phoneNumber.trim(),
      });
      return response.json();
    },
    onSuccess: () => {
      setShowCodeInput(true);
      toast({
        title: "Code Requested",
        description: "Check your WhatsApp for the 8-digit pairing code",
      });
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to request pairing code");
    },
  });

  

  useWebSocket(sessionId, {
    onMessage: (message) => {
      console.log('Received WebSocket message:', message);
      switch (message.type) {
        case 'pairing_code_ready':
          console.log('Setting pairing code:', message.code);
          setGeneratedCode(message.code);
          setShowCodeInput(true);
          break;
        case 'pairing_successful':
          toast({
            title: "Pairing Successful!",
            description: "Code accepted. Establishing secure connection...",
          });
          break;
        case 'session_connected':
          onSuccess({
            sessionId: message.sessionId,
            connectedAt: message.timestamp,
            phoneNumber: message.phoneNumber,
            name: message.name,
          });
          break;
        case 'session_failed':
          onError(message.error || "Connection failed");
          break;
      }
    },
    onError: () => {
      onError("WebSocket connection failed");
    },
  });

  const handleRequestCode = () => {
    requestCodeMutation.mutate();
  };

  

  return (
    <Card className="mb-6" data-testid="code-pairing-card">
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">8-Digit Pairing Code</h2>
            <StepIndicator currentStep={currentStep} />
          </div>
          <div className="text-sm bg-accent/50 border-l-4 border-primary p-3 rounded-r-md">
            <span className="font-medium">Session ID: </span>
            <span className="font-mono" data-testid="text-session-id">{sessionId}</span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <div className="mb-4">
              <Label className="block text-sm font-medium mb-2">Phone Number</Label>
              <div className="max-w-sm mx-auto">
                <Input
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="text-center"
                  disabled={showCodeInput}
                  data-testid="input-phone-number"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Include country code</p>
            </div>

            {!showCodeInput && (
              <Button
                onClick={handleRequestCode}
                disabled={requestCodeMutation.isPending || !phoneNumber.trim()}
                data-testid="button-request-code"
              >
                <i className="fas fa-mobile-alt mr-2"></i>
                {requestCodeMutation.isPending ? "Requesting..." : "Request Pairing Code"}
              </Button>
            )}
          </div>

          {showCodeInput && (
            <div className="text-center space-y-4" data-testid="code-input-section">
              <div className="text-sm text-muted-foreground">
                <p>Check your WhatsApp for the 8-digit pairing code</p>
                <p className="font-medium">Go to Settings → Linked Devices → Link a Device</p>
              </div>

              <div className="max-w-sm mx-auto">
                <Label className="block text-sm font-medium mb-2">Your pairing code is: {generatedCode}</Label>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                  <div className="text-3xl font-mono font-bold text-green-700 tracking-wider">
                    {generatedCode || "Loading..."}
                  </div>
                  <p className="text-sm text-green-600 mt-2">Enter this code in your WhatsApp app</p>
                </div>
                <div className="text-xs text-muted-foreground mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="font-semibold text-amber-800 mb-2">⚠️ EXACT Steps (Follow Precisely):</p>
                  <ol className="list-decimal list-inside space-y-1 text-amber-700">
                    <li><strong>Open WhatsApp</strong> on your phone</li>
                    <li><strong>Tap Settings</strong> (bottom right)</li>
                    <li><strong>Tap "Linked Devices"</strong></li>
                    <li><strong>Tap "Link a Device"</strong></li>
                    <li><strong>Tap "Link with phone number instead"</strong> (bottom)</li>
                    <li><strong>Enter EXACTLY:</strong> {generatedCode || "Loading..."}</li>
                    <li><strong>Wait for WhatsApp to process</strong> (don't close the app)</li>
                  </ol>
                  <p className="mt-2 font-semibold text-red-700">
                    ⚠️ If code shows "invalid", the phone number format may be wrong. Try again with proper country code.
                  </p>
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Waiting for you to enter the code in WhatsApp...
                </p>
                <div className="animate-pulse mt-2">
                  <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 flex space-x-3">
            <Button
              variant="secondary"
              onClick={onBack}
              className="flex-1"
              data-testid="button-back"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Change Method
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
