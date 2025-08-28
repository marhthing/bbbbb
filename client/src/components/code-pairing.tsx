import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";

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

interface CodePairingProps {
  sessionId: string;
  onSuccess: (data: any) => void;
  onError: (message: string) => void;
  onBack: () => void;
  currentStep: number;
}

// Country codes with their flags and codes
const countryCodes = [
  { code: "44", country: "United Kingdom", flag: "🇬🇧" },
  { code: "1", country: "United States", flag: "🇺🇸" },
  { code: "1", country: "Canada", flag: "🇨🇦" },
  { code: "234", country: "Nigeria", flag: "🇳🇬" },
  { code: "91", country: "India", flag: "🇮🇳" },
  { code: "86", country: "China", flag: "🇨🇳" },
  { code: "49", country: "Germany", flag: "🇩🇪" },
  { code: "33", country: "France", flag: "🇫🇷" },
  { code: "39", country: "Italy", flag: "🇮🇹" },
  { code: "34", country: "Spain", flag: "🇪🇸" },
  { code: "81", country: "Japan", flag: "🇯🇵" },
  { code: "82", country: "South Korea", flag: "🇰🇷" },
  { code: "61", country: "Australia", flag: "🇦🇺" },
  { code: "55", country: "Brazil", flag: "🇧🇷" },
  { code: "52", country: "Mexico", flag: "🇲🇽" },
  { code: "7", country: "Russia", flag: "🇷🇺" },
  { code: "27", country: "South Africa", flag: "🇿🇦" },
  { code: "20", country: "Egypt", flag: "🇪🇬" },
  { code: "90", country: "Turkey", flag: "🇹🇷" },
  { code: "966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "971", country: "UAE", flag: "🇦🇪" },
  { code: "65", country: "Singapore", flag: "🇸🇬" },
  { code: "60", country: "Malaysia", flag: "🇲🇾" },
  { code: "66", country: "Thailand", flag: "🇹🇭" },
  { code: "84", country: "Vietnam", flag: "🇻🇳" },
  { code: "62", country: "Indonesia", flag: "🇮🇩" },
  { code: "63", country: "Philippines", flag: "🇵🇭" },
  { code: "92", country: "Pakistan", flag: "🇵🇰" },
  { code: "880", country: "Bangladesh", flag: "🇧🇩" },
  { code: "94", country: "Sri Lanka", flag: "🇱🇰" },
];

export function CodePairing({ sessionId, onSuccess, onError, onBack, currentStep }: CodePairingProps) {
  const [countryCode, setCountryCode] = useState("44"); // Default to UK
  const [phoneNumber, setPhoneNumber] = useState("");

  const [generatedCode, setGeneratedCode] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const { toast } = useToast();

  const requestCodeMutation = useMutation({
    mutationFn: async () => {
      if (!countryCode.trim()) {
        throw new Error("Country code is required");
      }
      if (!phoneNumber.trim()) {
        throw new Error("Phone number is required");
      }

      // Clean the phone number: remove spaces, dashes, and leading zero if present
      let cleanPhone = phoneNumber.replace(/\D/g, '');

      // Strip leading zero if present
      if (cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
      }

      // Combine country code with cleaned phone number
      const fullPhoneNumber = countryCode + cleanPhone;

      console.log('Sending request with:', { countryCode, phoneNumber, cleanPhone, fullPhoneNumber });

      const response = await apiRequest("POST", `/api/sessions/${sessionId}/request-code`, {
        phoneNumber: fullPhoneNumber,
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
        case 'connecting':
          toast({
            title: "Connecting...",
            description: "Establishing connection to WhatsApp servers",
          });
          break;
        case 'pairing_code_ready':
          console.log('Setting pairing code:', message.code);
          setGeneratedCode(message.code);
          setShowCodeInput(true);
          toast({
            title: "Code Generated!",
            description: `Your pairing code is: ${message.code}`,
          });
          break;
        case 'pairing_in_progress':
          toast({
            title: "Verification in Progress...",
            description: "WhatsApp is processing your pairing code",
          });
          break;
        case 'pairing_verified':
          toast({
            title: "Code Verified! ✅",
            description: "Your phone number has been verified. Connecting...",
          });
          break;
        case 'session_connected':
          toast({
            title: "Connected Successfully! 🎉",
            description: `Welcome ${message.name || 'User'}!`,
          });
          onSuccess({
            sessionId: message.sessionId,
            connectedAt: message.timestamp,
            phoneNumber: message.phoneNumber,
            name: message.name,
          });
          break;
        case 'session_failed':
          onError(message.error || "Pairing failed");
          break;
        default:
          console.log('Unhandled message type:', message.type);
      }
    },
    onError: () => {
      onError("WebSocket connection failed");
    },
  });

  const handleRequestCode = () => {
    requestCodeMutation.mutate();
  };

  const getSelectedCountry = () => {
    return countryCodes.find(c => c.code === countryCode) || countryCodes[0];
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
              <div className="max-w-md mx-auto">
                <div className="flex gap-2">
                  <div className="w-32">
                    <Select value={countryCode} onValueChange={setCountryCode} disabled={showCodeInput}>
                      <SelectTrigger data-testid="select-country-code">
                        <SelectValue>
                          <span className="flex items-center gap-2">
                            {getSelectedCountry().flag} +{countryCode}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {countryCodes.map((country) => (
                          <SelectItem key={`${country.code}-${country.country}`} value={country.code}>
                            <span className="flex items-center gap-2">
                              {country.flag} +{country.code} {country.country}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Input
                      type="tel"
                      placeholder={countryCode === "44" ? "7xxxxxxxxx" : "xxxxxxxxxx"}
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      disabled={showCodeInput}
                      data-testid="input-phone-number"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Enter your phone number without country code or leading zero
              </p>
              {countryCode && phoneNumber && (
                <p className="text-xs text-green-600 mt-1">
                  Full number: +{countryCode}{phoneNumber.replace(/\D/g, '').replace(/^0/, '')}
                </p>
              )}
            </div>

            {!showCodeInput && (
              <Button
                onClick={handleRequestCode}
                disabled={requestCodeMutation.isPending || !countryCode.trim() || !phoneNumber.trim()}
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
                <div className="text-xs text-muted-foreground mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="font-semibold text-blue-800 mb-2">📱 PAIRING INSTRUCTIONS:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700">
                    <li><strong>Open WhatsApp</strong> on your phone</li>
                    <li><strong>Go to Settings</strong> → <strong>Linked Devices</strong></li>
                    <li><strong>Tap "Link a Device"</strong></li>
                    <li><strong>Choose "Link with phone number instead"</strong></li>
                    <li><strong>Enter this 8-digit code:</strong> <span className="font-mono font-bold bg-blue-100 px-1 rounded">{generatedCode}</span></li>
                    <li><strong>Tap "Link Device"</strong> in WhatsApp</li>
                  </ol>
                  <div className="mt-3 p-2 bg-green-100 border border-green-300 rounded">
                    <p className="text-green-800 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      Connection is active - We'll detect when you verify the code!
                    </p>
                  </div>
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