import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorStateProps {
  errorMessage: string;
  onRetry: () => void;
  onStartOver: () => void;
}

export function ErrorState({ errorMessage, onRetry, onStartOver }: ErrorStateProps) {
  return (
    <Card className="mb-6" data-testid="error-state-card">
      <CardContent className="p-6">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <i className="fas fa-exclamation-triangle text-3xl text-red-600"></i>
          </div>
          
          <div>
            <h2 className="text-2xl font-semibold text-destructive mb-2">Connection Failed</h2>
            <p className="text-muted-foreground">We couldn't establish a connection with your WhatsApp account.</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-left">
            <div className="font-medium text-red-700 mb-2">Error Details:</div>
            <p className="text-red-600" data-testid="text-error-message">{errorMessage}</p>
            
            <div className="font-medium text-red-700 mt-4 mb-2">Possible solutions:</div>
            <ul className="list-disc list-inside space-y-1 text-red-600">
              <li>Ensure QR code is scanned within 2 minutes</li>
              <li>Check that pairing code is entered correctly</li>
              <li>Verify WhatsApp account isn't linked to maximum devices</li>
              <li>Check your internet connection</li>
              <li>Try refreshing and starting over</li>
            </ul>
          </div>

          <div className="flex space-x-3 justify-center">
            <Button
              onClick={onRetry}
              data-testid="button-retry"
            >
              <i className="fas fa-redo mr-2"></i>
              Try Again
            </Button>
            <Button
              variant="secondary"
              onClick={onStartOver}
              data-testid="button-start-over"
            >
              <i className="fas fa-home mr-2"></i>
              Start Over
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
