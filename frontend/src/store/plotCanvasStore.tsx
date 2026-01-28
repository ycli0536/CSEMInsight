import { create } from 'zustand'

interface RadioGroupState {
  selectedValue: string;
  setSelectedValue: (value: string) => void;
}

export const useRadioGroupStore = create<RadioGroupState>((set) => ({
  selectedValue: "Error Bars",
  setSelectedValue: (value: string) => set({ selectedValue: value }),
}));

interface UPlotState {
  showLegend: boolean;
  dragEnabled: boolean;
  scrollEnabled: boolean;
  legendLiveEnabled: boolean;
  wrapPhase: boolean;
  showErrorBars: boolean;
  showHighLowBands: boolean;
  showNoErrorBars: boolean;
  showModel: boolean;
  showResidual: boolean;
  showData: boolean;
  setShowLegend: (showLegend: boolean) => void;
  setDragEnabled: (dragEnabled: boolean) => void;
  setScrollEnabled: (scrollEnabled: boolean) => void;
  setlegendLiveEnabled: (legendLiveEnabled: boolean) => void;
  setWrapPhase: (wrapPhase: boolean) => void;
  setShowErrorBars: (showErrorBars: boolean) => void;
  setShowHighLowBands: (showHighLowBands: boolean) => void;
  setShowNoErrorBars: (showNoErrorBars: boolean) => void;
  setShowModel: (showModel: boolean) => void;
  setShowResidual: (showResidual: boolean) => void;
  setShowData: (showData: boolean) => void;
}

export const useUPlotStore = create<UPlotState>((set) => ({
  showLegend: false,
  dragEnabled: false,
  scrollEnabled: false,
  legendLiveEnabled: false,
  wrapPhase: true,
  showErrorBars: true,
  showHighLowBands: false,
  showNoErrorBars: false,
  showModel: false,
  showResidual: false,
  showData: true,
  setShowLegend: (showLegend: boolean) => set({ showLegend }),
  setDragEnabled: (dragEnabled: boolean) => set({ dragEnabled }),
  setScrollEnabled: (scrollEnabled: boolean) => set({ scrollEnabled }),
  setlegendLiveEnabled: (legendLiveEnabled: boolean) => set({ legendLiveEnabled }),
  setWrapPhase: (wrapPhase: boolean) => set({ wrapPhase }),
  setShowErrorBars: (showErrorBars: boolean) => set({ showErrorBars }),
  setShowHighLowBands: (showHighLowBands: boolean) => set({ showHighLowBands }),
  setShowNoErrorBars: (showNoErrorBars: boolean) => set({ showNoErrorBars }),
  setShowModel: (showModel: boolean) => set({ showModel }),
  setShowResidual: (showResidual: boolean) => set({ showResidual }),
  setShowData: (showData: boolean) => set({ showData }),
}));