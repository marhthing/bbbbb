import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface StepIndicatorProps {
  currentStep: number;
}

function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center space-x-2">
      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm ${
        currentStep >= 1 ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        1
      </div>
      <div className="w-10 h-0.5 bg-border"></div>
      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
        currentStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        2
      </div>
      <div className="w-10 h-0.5 bg-border"></div>
      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm ${
        currentStep >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        3
      </div>
    </div>
  );
}

interface PairingMethodProps {
  sessionId: string;
  onMethodSelect: (method: "qr" | "code") => void;
  onBack: () => void;
  currentStep: number;
}

export function PairingMethod({ sessionId, onMethodSelect, onBack, currentStep }: PairingMethodProps) {
  const { toast } = useToast();

  const createSessionMutation = useMutation({
    mutationFn: async (pairingMethod: "qr" | "code") => {
      const response = await apiRequest("POST", "/api/sessions", {
        id: sessionId,
        pairingMethod,
      });
      return response.json();
    },
    onSuccess: (data, pairingMethod) => {
      onMethodSelect(pairingMethod);
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to create session";
      
      // Show specific message for active sessions
      if (errorMessage.includes("already active and connected")) {
        toast({
          title: "Session Already Active",
          description: "This session ID is already connected. Please use a different ID or wait for the current session to disconnect.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const handleMethodSelect = (method: "qr" | "code") => {
    createSessionMutation.mutate(method);
  };

  return (
    <Card className="mb-6" data-testid="pairing-method-card">
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Choose Pairing Method</h2>
            <StepIndicator currentStep={currentStep} />
          </div>
          <p className="text-muted-foreground">Select how you want to connect your WhatsApp account</p>
          <div className="mt-2 text-sm bg-accent/50 border-l-4 border-primary p-3 rounded-r-md">
            <span className="font-medium">Session ID: </span>
            <span className="font-mono" data-testid="text-session-id">{sessionId}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleMethodSelect("qr")}
              data-testid="card-qr-method"
            >
              <CardContent className="p-4">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                    <i className="fas fa-qrcode text-2xl text-primary"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold">QR Code</h3>
                    <p className="text-sm text-muted-foreground">Scan with WhatsApp camera</p>
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    Recommended
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleMethodSelect("code")}
              data-testid="card-code-method"
            >
              <CardContent className="p-4">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center">
                    <i className="fas fa-key text-2xl text-secondary-foreground"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold">8-Digit Code</h3>
                    <p className="text-sm text-muted-foreground">Enter pairing code manually</p>
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    Alternative
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
              data-testid="button-back"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Back
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
