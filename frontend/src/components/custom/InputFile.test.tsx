// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InputFile } from './InputFile';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { useDataTableStore, useSettingFormStore } from '@/store/settingFormStore';

vi.mock('@/components/custom/CustomAlertDialog', () => ({
  CustomAlertDialog: () => null,
}));

vi.mock('@/hooks/useAlertDialog', () => ({
  useAlertDialog: vi.fn(),
}));

vi.mock('@/store/settingFormStore', () => ({
  useDataTableStore: vi.fn(),
  useSettingFormStore: vi.fn(),
}));

vi.mock('react-aria-components', () => ({
  Button: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <button className={className}>{children}</button>,
  DropZone: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="inputfile-dropzone">
      {children}
    </div>
  ),
  FileTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('InputFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useDataTableStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      datasets: new Map(),
      addDataset: vi.fn(),
      setPrimaryDataset: vi.fn(),
      resetAllFilters: vi.fn(),
    });

    (useSettingFormStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setDataFiles: vi.fn(),
    });

    (useAlertDialog as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      alertState: {
        isOpen: false,
        title: '',
        message: '',
        type: 'success',
      },
      showAlert: vi.fn(),
      hideAlert: vi.fn(),
      handleConfirm: vi.fn(),
    });
  });

  it('uses full-width dropzone classes to match setting form sections', () => {
    render(<InputFile />);

    const dropzone = screen.getByTestId('inputfile-dropzone');
    expect(dropzone).toHaveClass('w-full');
    expect(dropzone).toHaveClass('min-w-0');
  });
});
