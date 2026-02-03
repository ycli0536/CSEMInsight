import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertDialogState } from "@/hooks/useAlertDialog";

interface CustomAlertDialogProps {
  alertState: AlertDialogState;
  onClose: () => void;
  onConfirm: () => void;
}

export function CustomAlertDialog({ alertState, onClose, onConfirm }: CustomAlertDialogProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  const getTitleColor = (type: string) => {
    switch (type) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'warning': return 'text-amber-600';
      default: return 'text-blue-600';
    }
  };

  const isPythonTraceback = alertState.description.includes('Traceback') || 
    alertState.description.includes('File "');
  const isLongError = alertState.description.length > 200;
  const hasDetailedError = alertState.type === 'error' && (isPythonTraceback || isLongError);

  const getErrorSummary = (description: string): string => {
    if (isPythonTraceback) {
      const lines = description.trim().split('\n');
      const lastNonEmptyLine = lines.filter(line => line.trim()).pop() || '';
      return lastNonEmptyLine.length > 150 ? lastNonEmptyLine.substring(0, 150) + '...' : lastNonEmptyLine;
    }
    return description.length > 150 ? description.substring(0, 150) + '...' : description;
  };

  const handleClose = () => {
    setShowDetails(false);
    onClose();
  };

  const handleConfirm = () => {
    setShowDetails(false);
    onConfirm();
  };

  return (
    <AlertDialog open={alertState.isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className={hasDetailedError ? "max-w-2xl" : "max-w-md"}>
        <AlertDialogHeader>
          <AlertDialogTitle className={`flex items-center gap-2 ${getTitleColor(alertState.type)}`}>
            <span className="text-lg">{getIcon(alertState.type)}</span>
            {alertState.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-left text-sm text-muted-foreground">
              {hasDetailedError ? (
                <>
                  <p className="mb-2">{getErrorSummary(alertState.description)}</p>
                  <button
                    type="button"
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline text-xs mb-2"
                  >
                    {showDetails ? '▼ Hide Details' : '▶ Show Full Error Details'}
                  </button>
                  {showDetails && (
                    <div className="mt-2 p-3 bg-muted/50 rounded-md border">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto text-red-600 dark:text-red-400">
                        {alertState.description}
                      </pre>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(alertState.description);
                        }}
                        className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        📋 Copy to Clipboard
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="whitespace-pre-line">{alertState.description}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleConfirm}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 