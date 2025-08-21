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

  return (
    <AlertDialog open={alertState.isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className={`flex items-center gap-2 ${getTitleColor(alertState.type)}`}>
            <span className="text-lg">{getIcon(alertState.type)}</span>
            {alertState.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left whitespace-pre-line">
            {alertState.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onConfirm}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 