import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SuccessStateProps {
  sessionData: {
    sessionId: string;
    connectedAt: string;
    phoneNumber?: string;
    name?: string;
  };
  onCreateNew: () => void;
}

export function SuccessState({ sessionData, onCreateNew }: SuccessStateProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Card className="mb-6" data-testid="success-state-card">
      <CardContent className="p-6">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <i className="fas fa-check text-3xl text-green-600"></i>
          </div>
          
          <div>
            <h2 className="text-2xl font-semibold text-green-700 mb-2">WhatsApp Connected Successfully!</h2>
            <p className="text-muted-foreground">Your session has been saved and is ready to use.</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
            <div className="space-y-2 text-left">
              <div>
                <span className="font-medium">Session ID:</span>{" "}
                <span className="font-mono" data-testid="text-connected-session-id">
                  {sessionData.sessionId}
                </span>
              </div>
              {sessionData.phoneNumber && (
                <div>
                  <span className="font-medium">Connected Phone:</span>{" "}
                  <span data-testid="text-connected-phone">{sessionData.phoneNumber}</span>
                </div>
              )}
              {sessionData.name && (
                <div>
                  <span className="font-medium">Account Name:</span>{" "}
                  <span data-testid="text-connected-name">{sessionData.name}</span>
                </div>
              )}
              <div>
                <span className="font-medium">Connected At:</span>{" "}
                <span data-testid="text-connection-time">{formatDate(sessionData.connectedAt)}</span>
              </div>
              <div>
                <span className="font-medium">Status:</span>{" "}
                <span className="text-green-600 font-medium">Active</span>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground bg-accent/30 p-3 rounded-md">
            <i className="fas fa-info-circle mr-1"></i>
            Your bot can now load this session and start operating. The session data has been securely stored in the database.
          </div>

          <Button
            onClick={onCreateNew}
            data-testid="button-create-new"
          >
            <i className="fas fa-plus mr-2"></i>
            Create Another Session
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
