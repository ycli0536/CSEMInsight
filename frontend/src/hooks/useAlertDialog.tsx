import { useState } from 'react';

export interface AlertDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  type: 'success' | 'error' | 'warning' | 'info';
  onConfirm?: () => void;
}

export function useAlertDialog() {
  const [alertState, setAlertState] = useState<AlertDialogState>({
    isOpen: false,
    title: '',
    description: '',
    type: 'info'
  });

  const showAlert = (
    title: string, 
    description: string, 
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
    onConfirm?: () => void
  ) => {
    setAlertState({
      isOpen: true,
      title,
      description,
      type,
      onConfirm
    });
  };

  const hideAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  const handleConfirm = () => {
    if (alertState.onConfirm) {
      alertState.onConfirm();
    }
    hideAlert();
  };

  return {
    alertState,
    showAlert,
    hideAlert,
    handleConfirm
  };
} 