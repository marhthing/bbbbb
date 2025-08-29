import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import QRCode from "qrcode";

interface StepIndicatorProps {
  currentStep: number;
}

function StepIndicator({ currentStep: _currentStep }: StepIndicatorProps) {
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

interface QRPairingProps {
  sessionId: string;
  onSuccess: (data: any) => void;
  onError: (message: string) => void;
  onBack: () => void;
  currentStep: number;
}

export function QRPairing({ sessionId, onSuccess, onError, onBack, currentStep }: QRPairingProps) {
  const [qrCode, setQrCode] = useState<string>("");
  const [connectionTimer, setConnectionTimer] = useState(0);
  const [status, setStatus] = useState<"waiting" | "connecting" | "qr_ready" | "scanned" | "restarting" | "connected">("waiting");
  const { toast } = useToast();

  const startQRPairingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/qr-pairing`);
      return response.json();
    },
    onError: (_error) => {
      onError(_error instanceof Error ? _error.message : "Failed to start QR pairing");
    },
  });

  const refreshQRMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/refresh-qr`);
      return response.json();
    },
    onSuccess: () => {
      setQrCode("");
      setConnectionTimer(0);
    },
    onError: (_error) => {
      toast({
        title: "Error",
        description: "Failed to refresh QR code",
        variant: "destructive",
      });
    },
  });

  const { isConnected } = useWebSocket(sessionId, {
    onMessage: async (message) => {
      console.log('Received WebSocket message:', message);
      switch (message.type) {
        case 'connecting':
          setStatus("connecting");
          break;
        case 'qr_code':
          try {
            const qrDataURL = await QRCode.toDataURL(message.qr, {
              width: 256,
              margin: 2,
            });
            setQrCode(qrDataURL);
            setStatus("qr_ready");
          } catch (error) {
            console.error('Error generating QR code:', error);
            onError("Failed to generate QR code");
          }
          break;
        case 'restart_required':
          setStatus("restarting");
          setQrCode(""); // Clear QR while restarting
          break;
        case 'session_connected':
          setStatus("connected");
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

  useEffect(() => {
    if (isConnected) {
      startQRPairingMutation.mutate();
    }
  }, [isConnected]);

  useEffect(() => {
    const timer = setInterval(() => {
      setConnectionTimer(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="mb-6" data-testid="qr-pairing-card">
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Scan QR Code</h2>
            <StepIndicator currentStep={currentStep} />
          </div>
          <div className="text-sm bg-accent/50 border-l-4 border-primary p-3 rounded-r-md">
            <span className="font-medium">Session ID: </span>
            <span className="font-mono" data-testid="text-session-id">{sessionId}</span>
          </div>
        </div>

        <div className="text-center space-y-6">
          <div className="max-w-sm mx-auto">
            <div className="bg-white p-8 rounded-lg border-2 border-dashed border-border mb-4" data-testid="qr-code-container">
              {qrCode ? (
                <img src={qrCode} alt="QR Code" className="w-64 h-64 mx-auto" data-testid="img-qr-code" />
              ) : (
                <div className="w-64 h-64 mx-auto bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <div className={startQRPairingMutation.isPending ? "animate-pulse" : ""}>
                      <i className="fas fa-qrcode text-6xl mb-2"></i>
                    </div>
                    <p className="text-sm" data-testid="text-qr-status">
                      {startQRPairingMutation.isPending ? "Generating QR Code..." : "Waiting for QR Code..."}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium">How to scan:</p>
              <ol className="text-left list-decimal list-inside space-y-1">
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings → Linked Devices</li>
                <li>Tap "Link a Device"</li>
                <li>Scan this QR code</li>
              </ol>
            </div>
          </div>

          <div className="bg-accent/30 p-4 rounded-lg border-l-4 border-primary">
            <div className="flex items-center justify-center space-x-2 text-sm">
              <div className={`w-3 h-3 rounded-full ${
                status === "waiting" || status === "connecting" ? "bg-blue-400 animate-pulse" :
                status === "qr_ready" ? "bg-amber-400 animate-pulse" :
                status === "scanned" || status === "restarting" ? "bg-green-400 animate-pulse" :
                status === "connected" ? "bg-green-400" : "bg-gray-400"
              }`}></div>
              <span className="font-medium" data-testid="text-connection-status">
                {status === "waiting" ? "Initializing..." :
                 status === "connecting" ? "Connecting to WhatsApp..." :
                 status === "qr_ready" ? "Waiting for QR scan..." :
                 status === "scanned" ? "QR Scanned! Processing..." :
                 status === "restarting" ? "Finalizing connection..." :
                 status === "connected" ? "Connected!" : "Waiting..."}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              <span data-testid="text-connection-timer">{formatTime(connectionTimer)}</span> elapsed
              {status === "qr_ready" && (
                <div className="mt-1 text-center">
                  <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-ping mr-1"></span>
                  Ready to scan
                </div>
              )}
              {status === "restarting" && (
                <div className="mt-1 text-center text-green-600">
                  <i className="fas fa-check-circle mr-1"></i>
                  QR code was scanned successfully
                </div>
              )}
            </div>
          </div>

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
            <Button
              variant="outline"
              onClick={() => refreshQRMutation.mutate()}
              className="flex-1"
              disabled={refreshQRMutation.isPending}
              data-testid="button-refresh"
            >
              <i className="fas fa-sync-alt mr-2"></i>
              Refresh Code
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
