// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTableCtrl } from './DataTableCtrl';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { useDataTableStore, useSettingFormStore } from '@/store/settingFormStore';

vi.mock('@/components/custom/CustomAlertDialog', () => ({
  CustomAlertDialog: () => null,
}));

vi.mock('@/hooks/useAlertDialog', () => ({
  useAlertDialog: vi.fn(),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    systemTheme: 'light',
  }),
}));

vi.mock('@/store/settingFormStore', () => ({
  useDataTableStore: vi.fn(),
  useSettingFormStore: vi.fn(),
}));

vi.mock('@/components/custom/ListBox', () => ({
  ListBox: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ListBoxItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      aria-label={id}
      type="button"
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? 'on' : 'off'}
    </button>
  ),
}));

vi.mock('@adobe/react-spectrum', () => ({
  Provider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ListBox: ({
    items = [],
    children,
  }: {
    items?: unknown[];
    children: ReactNode | ((item: unknown) => ReactNode);
  }) => (
    <div>
      {typeof children === 'function'
        ? items.map((item, index) => <div key={index}>{children(item)}</div>)
        : children}
    </div>
  ),
  Item: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  lightTheme: {},
  darkTheme: {},
}));

describe('DataTableCtrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    (useSettingFormStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      freqSelected: 'all',
      txSelected: 'all',
      rxSelected: 'all',
      applyQuickFiltersGlobally: false,
      setFreqSelected: vi.fn(),
      setTxSelected: vi.fn(),
      setRxSelected: vi.fn(),
      setApplyQuickFiltersGlobally: vi.fn(),
      resetColumnFilters: false,
      setResetColumnFilters: vi.fn(),
    });

    (useDataTableStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      txData: [],
      rxData: [],
      datasets: new Map(),
      syncQuickFiltersAcrossDatasets: vi.fn(),
      colDefs: [],
      visibleColumns: new Set<string>(),
      setVisibleColumns: vi.fn(),
    });

    (useAlertDialog as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      alertState: {
        isOpen: false,
        title: '',
        description: '',
        type: 'info',
      },
      showAlert: vi.fn(),
      hideAlert: vi.fn(),
      handleConfirm: vi.fn(),
    });
  });

  it('shows a warning when enabling shared quick filter mode', async () => {
    const user = userEvent.setup();
    const showAlert = vi.fn();

    (useAlertDialog as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      alertState: {
        isOpen: false,
        title: '',
        description: '',
        type: 'info',
      },
      showAlert,
      hideAlert: vi.fn(),
      handleConfirm: vi.fn(),
    });

    render(<DataTableCtrl />);

    await user.click(screen.getByLabelText('global-quick-filters'));

    expect(showAlert).toHaveBeenCalledWith(
      'Shared Quick Filter Mode',
      'Please ensure datasets share consistent ID indexing; otherwise, consistency between the selected filters and visualization results is not guaranteed.',
      'warning',
    );
  });

  it('hides the shared quick filter toggle in demo mode', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');

    render(<DataTableCtrl />);

    expect(screen.queryByText('Apply To All Datasets')).not.toBeInTheDocument();
  });
});
