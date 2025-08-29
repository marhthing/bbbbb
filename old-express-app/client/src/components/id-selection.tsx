import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface StepIndicatorProps {
  currentStep: number;
}

function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center space-x-2">
      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
        currentStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        1
      </div>
      <div className="w-10 h-0.5 bg-border"></div>
      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm ${
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

interface IDSelectionProps {
  onNext: (id: string) => void;
  currentStep: number;
}

export function IDSelection({ onNext, currentStep }: IDSelectionProps) {
  const [idType, setIdType] = useState<"custom" | "auto">("custom");
  const [customId, setCustomId] = useState("");
  const [generatedId, setGeneratedId] = useState("");
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const { toast } = useToast();

  const generateIdMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sessions/generate-id");
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedId(data.id);
      setSessionStatus(null);
    },
    onError: (_error) => {
      toast({
        title: "Error",
        description: "Failed to generate ID. Please try again.",
        variant: "destructive",
      });
    },
  });

  const checkSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("GET", `/api/sessions/check/${encodeURIComponent(id)}`);
      return response.json();
    },
    onSuccess: (data) => {
      setSessionStatus(data);
    },
    onError: (_error) => {
      setSessionStatus(null);
    },
  });

  const handleIdTypeChange = (value: string) => {
    setIdType(value as "custom" | "auto");
    setSessionStatus(null);
    if (value === "auto" && !generatedId) {
      generateIdMutation.mutate();
    }
  };

  const handleCustomIdChange = (value: string) => {
    setCustomId(value);
    setSessionStatus(null);
    if (value.trim().length >= 3) {
      checkSessionMutation.mutate(value.trim());
    }
  };

  const handleNext = () => {
    const selectedId = idType === "custom" ? customId : generatedId;

    if (!selectedId.trim()) {
      toast({
        title: "Error",
        description: "Please provide a session ID.",
        variant: "destructive",
      });
      return;
    }

    if (idType === "custom" && customId.length < 3) {
      toast({
        title: "Error",
        description: "Custom ID must be at least 3 characters long.",
        variant: "destructive",
      });
      return;
    }

    onNext(selectedId);
  };

  return (
    <Card className="mb-6" data-testid="id-selection-card">
      <CardContent className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Setup Your Connection</h2>
            <StepIndicator currentStep={currentStep} />
          </div>
          <p className="text-muted-foreground">Choose your unique identifier for this WhatsApp session</p>
        </div>

        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium mb-2">Session Identifier</Label>
            <RadioGroup value={idType} onValueChange={handleIdTypeChange} className="space-y-3">
              <div className="flex items-center space-x-3 p-3 border border-border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
                <RadioGroupItem value="custom" id="custom-id" data-testid="radio-custom-id" />
                <Label htmlFor="custom-id" className="flex-1 cursor-pointer">
                  <div className="font-medium">Custom ID</div>
                  <div className="text-sm text-muted-foreground">Choose your own identifier</div>
                </Label>
              </div>
              {idType === "custom" && (
                <div className="ml-6">
                  <Input
                    type="text"
                    placeholder="Enter your custom ID (e.g., my-bot-session)"
                    value={customId}
                    onChange={(e) => handleCustomIdChange(e.target.value)}
                    className="w-full"
                    data-testid="input-custom-id"
                  />
                  {sessionStatus && idType === "custom" && (
                    <div className="mt-2">
                      {sessionStatus.exists && sessionStatus.isActive ? (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertDescription className="text-red-700">
                            ⚠️ This session ID is already active and connected. Please choose a different ID.
                          </AlertDescription>
                        </Alert>
                      ) : sessionStatus.exists ? (
                        <Alert className="border-yellow-200 bg-yellow-50">
                          <AlertDescription className="text-yellow-700">
                            ℹ️ This session ID exists but is not active (status: {sessionStatus.status}). You can reuse it.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="border-green-200 bg-green-50">
                          <AlertDescription className="text-green-700">
                            ✅ This session ID is available.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-3 p-3 border border-border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
                <RadioGroupItem value="auto" id="auto-id" data-testid="radio-auto-id" />
                <Label htmlFor="auto-id" className="flex-1 cursor-pointer">
                  <div className="font-medium">Auto-generated ID</div>
                  <div className="text-sm text-muted-foreground">We'll create a unique identifier for you</div>
                </Label>
              </div>
              {idType === "auto" && (
                <div className="ml-6">
                  <div className="p-3 bg-muted rounded-md">
                    <span className="text-sm text-muted-foreground">Generated ID: </span>
                    <span className="font-mono text-sm" data-testid="text-generated-id">
                      {generateIdMutation.isPending ? "Generating..." : generatedId || "Click to generate"}
                    </span>
                  </div>
                </div>
              )}
            </RadioGroup>
          </div>

          <div className="pt-4">
            <Button
              onClick={handleNext}
              className="w-full"
              disabled={generateIdMutation.isPending || checkSessionMutation.isPending || (sessionStatus?.exists && sessionStatus?.isActive)}
              data-testid="button-continue"
            >
              Continue to Pairing Method
              <i className="fas fa-arrow-right ml-2"></i>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}