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
    showErrorBars: boolean;
    showHighLowBands: boolean;
    showNoErrorBars: boolean;
    setShowLegend: (showLegend: boolean) => void;
    setDragEnabled: (dragEnabled: boolean) => void;
    setScrollEnabled: (scrollEnabled: boolean) => void;
    setlegendLiveEnabled: (legendLiveEnabled: boolean) => void;
    setShowErrorBars: (showErrorBars: boolean) => void;
    setShowHighLowBands: (showHighLowBands: boolean) => void;
    setShowNoErrorBars: (showNoErrorBars: boolean) => void;
  }


export const useUPlotStore = create<UPlotState>((set) => ({
    showLegend: false,
    dragEnabled: false,
    scrollEnabled: false,
    legendLiveEnabled: false,
    showErrorBars: true,
    showHighLowBands: false,
    showNoErrorBars: false,
    setShowLegend: (showLegend: boolean) => set({ showLegend }),
    setDragEnabled: (dragEnabled: boolean) => set({ dragEnabled }),
    setScrollEnabled: (scrollEnabled: boolean) => set({ scrollEnabled }),
    setlegendLiveEnabled: (legendLiveEnabled: boolean) => set({ legendLiveEnabled }),
    setShowErrorBars: (showErrorBars: boolean) => set({ showErrorBars }),
    setShowHighLowBands: (showHighLowBands: boolean) => set({ showHighLowBands }),
    setShowNoErrorBars: (showNoErrorBars: boolean) => set({ showNoErrorBars }),
  }));