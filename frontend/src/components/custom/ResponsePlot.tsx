// src/components/UplotChartWithErrorBars.tsx
import { useCallback, useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import type { CsemData, Dataset } from "@/types";
import { useDataTableStore, useSettingFormStore } from "@/store/settingFormStore";
import { useUPlotStore } from '@/store/plotCanvasStore';
import { useTheme } from "@/hooks/useTheme";
import { wheelZoomPlugin } from '@/components/custom/uplot-wheel-zoom-plugin';
import { dataVizPalette, getChartColors } from "@/lib/colorPalette";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRadioGroupStore } from '@/store/plotCanvasStore';
import { debounce } from 'lodash';
import { useComparisonStore } from '@/store/comparisonStore';
import { computeDifferenceData } from "@/services/extractComparisonData";
import { computeStatistics, StatisticalMetrics } from "@/services/statisticalAnalysis";

export function ResponsesWithErrorBars() {
  const ampChartRef = useRef<HTMLDivElement>(null);
  const phiChartRef = useRef<HTMLDivElement>(null);
  const ampResidualRef = useRef<HTMLDivElement>(null); // New ref for Amp Residual
  const phiResidualRef = useRef<HTMLDivElement>(null); // New ref for Phi Residual
  const sideBySideAmpRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sideBySidePhiRefs = useRef<(HTMLDivElement | null)[]>([]);
  const {
    filteredData,
    data: rawData, // Destructure raw data
    datasets,
    activeDatasetIds,
    comparisonMode
  } = useDataTableStore();
  const { showLegend, dragEnabled, scrollEnabled, legendLiveEnabled, wrapPhase,
    setShowLegend, setDragEnabled, setScrollEnabled, setlegendLiveEnabled, setWrapPhase,
    showModel, setShowModel,
    showResidual, setShowResidual,
    showData, setShowData,
  } = useUPlotStore();
  const { selectedValue, setSelectedValue } = useRadioGroupStore();
  const { referenceDatasetId } = useComparisonStore();
  const { freqSelected, txSelected, rxSelected } = useSettingFormStore();
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const isDarkMode = resolvedTheme === "dark";

  type LegendInfo = {
    freqId: string;
    RxId: number;
    type: string;
    datasetId?: string;
    datasetName?: string;
    datasetColor?: string;
  };

  const normalizePhase = useCallback(
    (value: number) => {
      if (!wrapPhase) {
        return value;
      }
      const normalized = ((value + 180) % 360 + 360) % 360 - 180;
      return normalized === -180 ? 180 : normalized;
    },
    [wrapPhase]
  );

  const extractPlotData = useCallback(
    (data: CsemData[], type: string): [Float64Array[][][][], number, LegendInfo[]] => {
      // Get unique Tx_id (actual rcv id) values
      const uniqueRxIds = Array.from(new Set(data.map((item) => item.Tx_id)));

      // Get unique Freq_id values
      const uniqueFreqIds = Array.from(new Set(data.map((item) => item.Freq_id)));

      const comb_info: LegendInfo[] = [];

      // Prepare series data for each Freq_id
      const plotData: Float64Array[][][][] = uniqueFreqIds.map((freqId) => {
        // Filter data for the current Tx_id
        const filteredDataByFreqID = data.filter((item) => item.Freq_id === freqId);
        // Prepare series data for each Tx_id
        const dataByRxID: Float64Array[][][] = uniqueRxIds.map((RxId) => {
          let filteredData: CsemData[] = [];
          if (type === 'phi') {
            // Filter data for the current Tx_id
            filteredData = filteredDataByFreqID.filter((item) => item.Tx_id === RxId && item.Type === '24');
          } else if (type === 'amp') {
            filteredData = filteredDataByFreqID.filter((item) => item.Tx_id === RxId && item.Type === '28');
          } else {
            return [];
          }

          if (!filteredData.length) return [];


          // Extracting the necessary data for the current subset
          const YdistSeries = filteredData.map((item) => item.Y_rx / 1e3);
          let dataSeries: number[];
          let stdErrSeries: number[];
          let rawDataSeries: number[] | undefined; // For errors in phi
          let modelSeries: number[] = [];
          let residualSeries: number[] = [];

          if (type === 'phi') {
            rawDataSeries = filteredData.map((item) => item.Data);
            dataSeries = rawDataSeries.map((value) => normalizePhase(value));
            stdErrSeries = filteredData.map((item) => item.StdError);

            if (showModel) {
              modelSeries = filteredData.map(d => d.Response !== undefined ? normalizePhase(d.Response) : NaN);
            }
            if (showResidual) {
              // Use pre-computed Residual from data file
              residualSeries = filteredData.map(d => d.Residual !== undefined ? d.Residual : NaN);
            }
          } else { // amp
            dataSeries = filteredData.map((item) => 10 ** item.Data);
            stdErrSeries = filteredData.map((item) => item.StdError * Math.log(10) * 10 ** item.Data);

            if (showModel) {
              modelSeries = filteredData.map(d => d.Response !== undefined ? 10 ** d.Response : NaN);
            }
            if (showResidual) {
              // Use pre-computed Residual from data file
              residualSeries = filteredData.map(d => d.Residual !== undefined ? d.Residual : NaN);
            }
          }

          comb_info.push({ freqId, RxId, type });

          const result: Float64Array[][] = [
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(dataSeries),   // y-values (Data)
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(stdErrSeries)  // y-values (StdError)
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              (type === 'phi' && rawDataSeries)
                ? new Float64Array(rawDataSeries).map((v, idx) => normalizePhase(v + new Float64Array(stdErrSeries)[idx]))
                : new Float64Array(dataSeries).map((v, idx) => v + new Float64Array(stdErrSeries)[idx])
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              (type === 'phi' && rawDataSeries)
                ? new Float64Array(rawDataSeries).map((v, idx) => normalizePhase(v - new Float64Array(stdErrSeries)[idx]))
                : new Float64Array(dataSeries).map((v, idx) => v - new Float64Array(stdErrSeries)[idx])
            ]
          ];

          if (showModel) {
            result.push([new Float64Array(YdistSeries), new Float64Array(modelSeries)]);
          }
          if (showResidual) {
            result.push([new Float64Array(YdistSeries), new Float64Array(residualSeries)]);
          }

          return result;
        });
        return dataByRxID;
      });

      // Bug: if uniqueRxIds.length is different for each RxId, plotting will be wrong
      return [plotData, uniqueRxIds.length * uniqueFreqIds.length, comb_info];
    },
    [normalizePhase, showModel, showResidual]
  );

  const activeDatasets = useMemo(() => {
    return activeDatasetIds
      .map((id) => datasets.get(id))
      .filter((dataset): dataset is Dataset => Boolean(dataset && dataset.visible));
  }, [activeDatasetIds, datasets]);

  const referenceDataset = useMemo(() => {
    if (!activeDatasets.length) {
      return null;
    }
    if (referenceDatasetId) {
      return activeDatasets.find((dataset) => dataset.id === referenceDatasetId) ?? activeDatasets[0];
    }
    return activeDatasets[0];
  }, [activeDatasets, referenceDatasetId]);

  const overlayDatasets = useMemo(() => {
    if (comparisonMode === 'difference' && referenceDataset) {
      return activeDatasets
        .filter((dataset) => dataset.id !== referenceDataset.id)
        .map((dataset) => ({
          ...dataset,
          name: `Delta: ${referenceDataset.name} - ${dataset.name}`,
          data: computeDifferenceData(referenceDataset.data, dataset.data),
        }));
    }
    if (comparisonMode === 'statistical' || comparisonMode === 'overlay') {
      return activeDatasets;
    }
    return [];
  }, [activeDatasets, comparisonMode, referenceDataset]);

  const statistics = useMemo<Record<string, StatisticalMetrics>>(() => {
    if (!referenceDataset || comparisonMode !== 'statistical') {
      return {};
    }
    const results: Record<string, StatisticalMetrics> = {};
    activeDatasets.forEach((dataset) => {
      if (dataset.id === referenceDataset.id) {
        return;
      }
      results[dataset.id] = computeStatistics(referenceDataset.data, dataset.data);
    });
    return results;
  }, [activeDatasets, comparisonMode, referenceDataset]);

  useEffect(() => {
    const data = filteredData;
    console.log("ResponsePlot useEffect:");
    console.log("filteredData len:", filteredData.length);
    console.log("data len:", data.length);
    console.log("comparisonMode:", comparisonMode);
    // console.log("useOverlay:", useOverlay); // useOverlay is defined later, can't log here easily without moving it.

    // Check if useOverlay is effectively true
    const overlayEffective = (comparisonMode === 'overlay' || comparisonMode === 'difference' || comparisonMode === 'statistical') && overlayDatasets.length > 0;
    console.log("overlayEffective:", overlayEffective);
    console.log("activeDatasets len:", activeDatasets.length);


    const buildSeriesData = (
      data: CsemData[],
      type: string,
    ): {
      mainDataSeries: Float64Array[][];
      upperSeries: Float64Array[][];
      lowerSeries: Float64Array[][];
      modelSeries: Float64Array[][];
      residualSeries: Float64Array[][];
      seriesNum: number;
      legendInfo: LegendInfo[]
    } => {
      const [plotData0, , comb_info] = extractPlotData(data, type); // RxId/Freq/Data
      if (!plotData0.length) {
        return { mainDataSeries: [], upperSeries: [], lowerSeries: [], modelSeries: [], residualSeries: [], seriesNum: 0, legendInfo: [] };
      }

      const flattenedMainSeries: Float64Array[][] = [];
      const flattenedUpperSeries: Float64Array[][] = [];
      const flattenedLowerSeries: Float64Array[][] = [];
      const flattenedModelSeries: Float64Array[][] = [];
      const flattenedResidualSeries: Float64Array[][] = [];

      // Let's rely on the linear arrays, assuming consistency.
      // Let's rely on the linear arrays, assuming consistency.
      plotData0.forEach((freqData) => {
        freqData.forEach((rxData) => {
          if (rxData.length === 0) return;

          // Main Data (Index 0)
          flattenedMainSeries.push(rxData[0]);
          // Upper (Index 2)
          flattenedUpperSeries.push(rxData[2]);
          // Lower (Index 3)
          flattenedLowerSeries.push(rxData[3]);

          let nextIdx = 4;
          if (showModel && rxData.length > nextIdx) {
            flattenedModelSeries.push(rxData[nextIdx]);
            nextIdx++;
          } else if (showModel) {
            // Should not happen if consistent, but push empty/dummy?
            // uPlot.join might fail if lengths inconsistent?
            // Better to push a dummy empty series with shared X?
            // Or just allow misalignment. uPlot.join handles it.
          }

          if (showResidual && rxData.length > nextIdx) {
            flattenedResidualSeries.push(rxData[nextIdx]);
          }
        });
      });
      // The sort logic in original code:
      // const sortedArray = comb_info.sort((a, b) => a.RxId - b.RxId);
      // This implies we need to reorder the series arrays to match the sorted legend.

      // Pair them up
      const combined = comb_info.map((info, idx) => ({
        info,
        main: flattenedMainSeries[idx],
        upper: flattenedUpperSeries[idx],
        lower: flattenedLowerSeries[idx],
        model: showModel ? flattenedModelSeries[idx] : null,
        residual: showResidual ? flattenedResidualSeries[idx] : null
      }));

      combined.sort((a, b) => a.info.RxId - b.info.RxId);

      return {
        mainDataSeries: combined.map(c => c.main),
        upperSeries: combined.map(c => c.upper),
        lowerSeries: combined.map(c => c.lower),
        modelSeries: showModel ? combined.map(c => c.model!) : [],
        residualSeries: showResidual ? combined.map(c => c.residual!) : [],
        seriesNum: combined.length,
        legendInfo: combined.map(c => c.info)
      };
    };

    const preparePlotData = (
      data: CsemData[],
      type: string,
    ): {
      mainData: uPlot.AlignedData | null,
      residualData: uPlot.AlignedData | null,
      seriesNum: number,
      legendInfo: LegendInfo[]
    } => {
      const {
        mainDataSeries,
        upperSeries,
        lowerSeries,
        modelSeries,
        residualSeries,
        seriesNum,
        legendInfo
      } = buildSeriesData(data, type);

      if (seriesNum === 0) return { mainData: null, residualData: null, seriesNum: 0, legendInfo: [] };

      // Main Plot: Data, Model, Upper, Lower
      // Order: [Data0...DataN, Model0...ModelN, Upper0...UpperN, Lower0...LowerN] (to keep bands logic somewhat sane? No, bands need fixed index offsets)
      // Existing Band Logic: Upper is +seriesNum, Lower is +2*seriesNum.
      // So structure MUST be: [Data..., Upper..., Lower..., ...others]
      // We can append Model at the end: [Data..., Upper..., Lower..., Model...]
      // This preserves existing indices for bands.

      const mainRaw: Float64Array[][] = [
        ...mainDataSeries,
        ...upperSeries,
        ...lowerSeries,
        ...(showModel ? modelSeries : [])
      ];

      const residualRaw: Float64Array[][] = showResidual ? [...residualSeries] : [];

      return {
        mainData: mainRaw.length ? uPlot.join(mainRaw) : null,
        residualData: residualRaw.length ? uPlot.join(residualRaw) : null,
        seriesNum,
        legendInfo
      };
    };

    const preparePlotDataForDatasets = (
      datasetsToPlot: Dataset[],
      type: string,
    ): {
      mainData: uPlot.AlignedData | null,
      residualData: uPlot.AlignedData | null,
      seriesNum: number,
      legendInfo: LegendInfo[]
    } => {
      const seriesGroups = datasetsToPlot.map((dataset) => {
        const series = buildSeriesData(dataset.data, type);
        return {
          ...series,
          legendInfo: series.legendInfo.map((info) => ({
            ...info,
            datasetId: dataset.id,
            datasetName: dataset.name,
            datasetColor: dataset.color,
          })),
        };
      });

      let combinedSeriesNum = 0;
      const combinedLegendInfo: LegendInfo[] = [];

      const mainRaw: Float64Array[][] = [];
      const residualRaw: Float64Array[][] = [];

      // We need to structure it: [AllData... AllUpper... AllLower... AllModel...]
      // But "AllData" means Data from D1, then Data from D2?
      // uPlot series index logic for bands depends on specific offsets.
      // If we mix datasets, the offsets become complex.
      // Current Logic:
      // dataSeries.push(...dataChunk);
      // upperSeries.push(...upperChunk);
      // lowerSeries.push(...lowerChunk);
      // combinedSeriesNum += group.seriesNum;
      //
      // So it creates: Data(D1)...Data(D2)..., Upper(D1)...Upper(D2)...
      // The band logic:
      // for (let idx = 0; idx < seriesNum; idx++)
      //   series[idx] connects to series[idx + seriesNum]
      // This works IF total seriesNum matches the count of ALL data series.
      // Yes, it does.

      const allMain: Float64Array[][] = [];
      const allUpper: Float64Array[][] = [];
      const allLower: Float64Array[][] = [];
      const allModel: Float64Array[][] = [];
      const allResidual: Float64Array[][] = [];


      seriesGroups.forEach(group => {
        if (!group.seriesNum) return;
        allMain.push(...group.mainDataSeries);
        allUpper.push(...group.upperSeries);
        allLower.push(...group.lowerSeries);
        if (showModel) allModel.push(...group.modelSeries);
        if (showResidual) allResidual.push(...group.residualSeries);
        combinedLegendInfo.push(...group.legendInfo);
        combinedSeriesNum += group.seriesNum;
      });

      // Construct Main: Data, Upper, Lower, Model
      mainRaw.push(...allMain, ...allUpper, ...allLower, ...allModel);
      residualRaw.push(...allResidual);

      // Warning: Model indices will be at offset 3 * seriesNum? No.
      // Data is 0..N-1
      // Upper is N..2N-1
      // Lower is 2N..3N-1
      // Model is 3N..4N-1

      return {
        mainData: mainRaw.length ? uPlot.join(mainRaw) : null,
        residualData: residualRaw.length ? uPlot.join(residualRaw) : null,
        seriesNum: combinedSeriesNum,
        legendInfo: combinedLegendInfo
      };
    };

    const parseHslColor = (color: string) => {
      const match = color.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
      if (!match) {
        return null;
      }
      return {
        h: Number.parseInt(match[1], 10),
        s: Number.parseInt(match[2], 10),
        l: Number.parseInt(match[3], 10),
      };
    };

    const hexToHsl = (hex: string) => {
      const cleaned = hex.replace('#', '');
      if (cleaned.length !== 6) {
        return null;
      }
      const r = Number.parseInt(cleaned.slice(0, 2), 16) / 255;
      const g = Number.parseInt(cleaned.slice(2, 4), 16) / 255;
      const b = Number.parseInt(cleaned.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / d + 2;
            break;
          default:
            h = (r - g) / d + 4;
            break;
        }
        h *= 60;
      }

      return {
        h: Math.round(h),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
      };
    };

    const normalizeColorToHsl = (color: string) => {
      if (color.startsWith("#")) {
        return hexToHsl(color);
      }
      if (color.startsWith("hsl")) {
        return parseHslColor(color);
      }
      return null;
    };

    const updateLightness = (color: string, newLightness: number) => {
      const hsl = normalizeColorToHsl(color);
      if (!hsl) {
        return color;
      }
      return `hsl(${hsl.h}, ${hsl.s}%, ${newLightness}%)`;
    };

    const useOverlay =
      (comparisonMode === 'overlay' ||
        comparisonMode === 'difference' ||
        comparisonMode === 'statistical') &&
      overlayDatasets.length > 0;

    const initialPlotOptions = (seriesNum: number, type: string, legendInfo: LegendInfo[]): uPlot.Options => {
      // Define colors and labels for each dataset
      // console.log('seriesNum: ', seriesNum);
      // console.log('legendInfo: ', legendInfo);
      // CVD-friendly color palette for data visualization
      const basicColors = isDarkMode
        ? dataVizPalette.categorical.dark
        : dataVizPalette.categorical.light;
      // const SeriesColors = (seriesIdx: number): string => {
      //   return basicColors[(legendInfo[seriesIdx - 1].RxId - (legendInfo[0].RxId)) % basicColors.length]
      // }
      // if RxId is the same, for different freqId, use the monochromatic colors centered at 50% of corresponding basicColor based on freqId

      const datasetIds = legendInfo
        .map((item) => item.datasetId)
        .filter((id): id is string => Boolean(id));
      const useDefaultColors = new Set(datasetIds).size <= 1;

      const seriesColors = legendInfo.map((item) => {
        const fallbackColor =
          basicColors[Math.abs(item.RxId - (legendInfo[0]?.RxId ?? 0)) % basicColors.length];
        const baseColor = useDefaultColors ? fallbackColor : (item.datasetColor ?? fallbackColor);
        const lightnessShift = (parseInt(item.freqId) - 1) * 15;
        const normalized = normalizeColorToHsl(baseColor);
        if (!normalized) {
          return baseColor;
        }
        const newLightness = (normalized.l + lightnessShift) % 100;
        return updateLightness(baseColor, newLightness);
      });

      const chartColors = getChartColors(isDarkMode);
      const axisColor = chartColors.axis;
      const gridColor = chartColors.grid;

      // Dynamic series configuration
      const series: uPlot.Series[] = [
        { label: 'Distance (km)' },  // X-axis label
      ];
      // 1. Data Series
      for (let idx = 0; idx < seriesNum; idx++) {
        const datasetLabel = legendInfo[idx]?.datasetName
          ? `${legendInfo[idx].datasetName} - `
          : "";
        series.push({
          show: showData, // Toggle based on showData
          label: `${datasetLabel}rcv${legendInfo[idx].RxId} - freq${legendInfo[idx].freqId}`,
          stroke: seriesColors[idx],
          // width: 3,
          paths: () => null,
          points: {
            show: true,
            size: 3,
            space: 0,
          },
          value: (_, val) => {
            if (type === 'amp' && val !== null) {
              // Convert the value to exponential form
              const expValue = val.toExponential();
              // Find the 'e' part and apply toFixed to the coefficient
              const [coefficient, exponent] = expValue.split('e');
              const fixedCoefficient = parseFloat(coefficient).toFixed(3);
              // Combine the formatted coefficient with the exponent
              return `${fixedCoefficient}e${exponent}`;
            }
            else if (type === 'phi' && val !== null) {
              return val.toFixed(3)
            }
            else {
              return val;
            }
          },
        });
      }
      // console.log('series: ', series);

      // Data is 1..N
      // Upper is N+1 .. 2N
      // Lower is 2N+1 .. 3N
      // Model is 3N+1 .. 4N

      const bands: uPlot.Band[] = [];
      // console.log('seriesNum: ', seriesNum);
      for (let idx = 0; idx < seriesNum; idx++) {
        bands.push({
          series: [idx + seriesNum + 1, idx + 1],
          fill: updateLightness(seriesColors[idx], 90),
        });
        bands.push({
          series: [idx + seriesNum * 2 + 1, idx + 1],
          fill: updateLightness(seriesColors[idx], 90),
          dir: 1,
        });
      }
      // console.log('bands: ', bands);

      // Add Series definitions for invisible Upper/Lower bands (so uPlot knows they exist)
      // Upper Series
      for (let idx = 0; idx < seriesNum; idx++) {
        series.push({
          show: false,
          label: `Upper Bound`,
        });
      }
      // Lower Series
      for (let idx = 0; idx < seriesNum; idx++) {
        series.push({
          show: false,
          label: `Lower Bound`,
        });
      }

      // Model Series
      if (showModel) {
        for (let idx = 0; idx < seriesNum; idx++) {
          series.push({
            show: true,
            label: `Model`,
            stroke: seriesColors[idx],
            width: 2, // Line
            points: { show: false }
          });
        }
      }

      // Cursor sync
      const matchScaleKeys = (own: string | null, ext: string | null) => own == ext;
      const syncedUpDown = true;
      function upDownFilter(type: string) {
        return syncedUpDown || (type != "mouseup" && type != "mousedown");
      }
      const mooSync = uPlot.sync("responsePlot");
      const cursorOpts: uPlot.Cursor = {
        drag: { x: true, y: true, uni: 1, dist: 30 },
        lock: true,
        // focus: {
        //   prox: 16, // 1e6
        //   bias: 1,
        // },
        sync: {
          key: mooSync.key,
          setSeries: true,
          scales: ["x", null],
          match: [matchScaleKeys, matchScaleKeys],
          filters: {
            pub: upDownFilter,
          }
        },
      };
      const optsShared: uPlot.Options = {
        mode: 1,
        width: 950,
        height: 350,
        cursor: cursorOpts,
        plugins: [
          wheelZoomPlugin({
            factor: 0.9,
            drag: dragEnabled,
            scroll: scrollEnabled,
          }),
        ],
        series: [],
        legend: { show: false },
      }

      if (selectedValue === 'High-Low Bands') {
        optsShared.bands = bands;
        const seriesWithBands: uPlot.Series[] = [
          { label: 'Distance (km)' },  // X-axis label
        ];
        // 1. Data
        for (let idx = 0; idx < seriesNum; idx++) {
          const datasetLabel = legendInfo[idx]?.datasetName
            ? `${legendInfo[idx].datasetName} - `
            : "";
          seriesWithBands.push({
            show: showData,
            label: `${datasetLabel}rcv${legendInfo[idx].RxId} - freq${legendInfo[idx].freqId}`,
            stroke: seriesColors[idx],
            dash: [10, 10],
            // paths: () => null,
            points: {
              show: true,
              size: 3,
              space: 0,
            },
            value: (_, val) => {
              if (type === 'amp' && val !== null) {
                // Convert the value to exponential form
                const expValue = val.toExponential();
                // Find the 'e' part and apply toFixed to the coefficient
                const [coefficient, exponent] = expValue.split('e');
                const fixedCoefficient = parseFloat(coefficient).toFixed(3);
                // Combine the formatted coefficient with the exponent
                return `${fixedCoefficient}e${exponent}`;
              }
              else if (type === 'phi' && val !== null) {
                return val.toFixed(3)
              }
              else {
                return val;
              }
            },
          });
        }
        // 2. Upper
        for (let idx = seriesNum; idx < seriesNum * 2; idx++) {
          seriesWithBands.push({
            show: false,
            stroke: seriesColors[idx - seriesNum],
            points: {
              show: true,
              size: 3,
              space: 0,
            },
            label: " ",
          });
        }
        // 3. Lower
        for (let idx = seriesNum * 2; idx < seriesNum * 3; idx++) {
          seriesWithBands.push({
            show: false,
            stroke: seriesColors[idx - 2 * seriesNum],
            points: {
              show: true,
              size: 3,
              space: 0,
            },
            label: " ",
          });
        }
        // 4. Model
        if (showModel) {
          for (let idx = 0; idx < seriesNum; idx++) {
            seriesWithBands.push({
              show: true,
              label: `Model`,
              stroke: seriesColors[idx],
              width: 2,
              points: { show: false }
            });
          }
        }
        optsShared.series = seriesWithBands;
        if (showLegend) {
          optsShared.legend = {
            show: true,
            live: legendLiveEnabled,
            markers: {
              fill: (_, seriesIdx: number) => {
                return seriesColors[seriesIdx - 1]
              }
            }
          };
        }
      } else if (selectedValue === 'Error Bars') {
        optsShared.bands = [];
        optsShared.series = series;
        if (showLegend) {
          optsShared.legend = {
            show: true,
            live: legendLiveEnabled,
            markers: {
              fill: (_, seriesIdx: number) => {
                return seriesColors[seriesIdx - 1]
              }
            }
          };
        }
        optsShared.plugins?.push(
          {
            hooks: {
              draw: (u) => {
                requestAnimationFrame(() => {
                  const ctx = u.ctx;
                  // console.log('u.data: ', u.data);
                  // console.log('u.scales: ', u.scales);

                  const minX = u.scales.x.min as number;
                  const maxX = u.scales.x.max as number;

                  // Draw in the u-over layer
                  ctx.save();
                  ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
                  ctx.clip();

                  const dataX = u.data[0];

                  const drawErrorBars = (seriesIdx: number, color: string) => {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    const capWidth = 3; // Width of the caps at the ends of the error bars

                    ctx.beginPath();

                    for (let i = 0; i < dataX.length; i++) {
                      const x = dataX[i];
                      const y = u.data[seriesIdx][i];
                      const upperLimit = u.data[seriesIdx + seriesNum][i] as number;
                      const lowerLimit = u.data[seriesIdx + seriesNum * 2][i] as number;

                      if (y !== null && y !== undefined && x >= minX && x <= maxX && y >= lowerLimit && y <= upperLimit) {
                        const xPos = u.valToPos(x, 'x', true);

                        const errTopPos = u.valToPos(upperLimit, 'y', true);
                        const errBottomPos = u.valToPos(lowerLimit, 'y', true);

                        // Vertical line
                        ctx.moveTo(xPos, errTopPos);
                        ctx.lineTo(xPos, errBottomPos);

                        // Top cap
                        ctx.moveTo(xPos - capWidth, errTopPos);
                        ctx.lineTo(xPos + capWidth, errTopPos);

                        // Bottom cap
                        ctx.moveTo(xPos - capWidth, errBottomPos);
                        ctx.lineTo(xPos + capWidth, errBottomPos);
                      }
                    }
                    ctx.stroke();
                  }

                  // Loop through each series to draw elements
                  if (showData) {
                    for (let i = 0; i < seriesNum; i++) {
                      drawErrorBars(i + 1, seriesColors[i]);
                    }
                  }

                  ctx.restore();
                });
              },
            },
          },
        )
      } else {
        optsShared.bands = [];
        optsShared.series = series;
        if (showLegend) {
          optsShared.legend = {
            show: true,
            live: legendLiveEnabled,
            markers: {
              fill: (_, seriesIdx: number) => {
                return seriesColors[seriesIdx - 1]
              }
            }
          };
        }
      }

      if (type === 'amp') {
        const options: uPlot.Options = {
          ...optsShared,
          title: "Amplitude",
          scales: {
            x: {
              time: false,
              auto: true,
            },
            y: {
              auto: true,
              distr: 3,
              log: 10,
              range: (u, min, max) => {
                // console.log(u.data);
                let minV = min;
                let maxV = max;
                // console.log('min/max0: ',  minV, maxV)
                if (showData) {
                  for (let i = 1; i < seriesNum + 1; i++) {
                    const ub = u.data[i + seriesNum] as number[];
                    const lb = u.data[i + seriesNum * 2] as number[];
                    // Filter positive for log scale
                    const validLb = lb.filter(v => Number.isFinite(v) && v > 0);
                    const validUb = ub.filter(v => Number.isFinite(v) && v > 0);
                    if (validLb.length) minV = Math.min(minV, ...validLb);
                    if (validUb.length) maxV = Math.max(maxV, ...validUb);
                    // console.log('min/max: ',  minV, maxV)
                  }
                }
                const logMin = 10 ** Math.floor(Math.log10(minV));
                const logMax = 10 ** Math.ceil(Math.log10(maxV));
                // console.log('log min/max: ',  Math.log10(logMin), Math.log10(logMax))

                return [logMin, logMax];
              }
            }
          },
          //   focus: {
          //     alpha: 0.03,
          // },
          axes: [
            {
              stroke: axisColor,
              grid: { stroke: gridColor, width: 1 },
              ticks: { stroke: axisColor, width: 1 },
            },
            {
              stroke: axisColor,
              grid: { stroke: gridColor, width: 1 },
              ticks: { stroke: axisColor, width: 1 },
              size: 80,
              values: (_, splits) => splits.map(v => v == null ? null : v.toExponential())
            }
          ],
        };
        return options;
      } else {
        const options: uPlot.Options = {
          ...optsShared,
          title: "Phase",
          scales: {
            x: {
              time: false,
              auto: true,
            },
            y: {
              auto: true,
              range: (u, min, max) => {
                let minV = min;
                let maxV = max;
                if (showData) {
                  for (let i = 1; i < seriesNum + 1; i++) {
                    const ub = u.data[i + seriesNum] as number[];
                    const lb = u.data[i + seriesNum * 2] as number[];
                    minV = Math.min(minV, ...lb.filter(Number.isFinite));
                    maxV = Math.max(maxV, ...ub.filter(Number.isFinite));
                  }
                }

                return [Math.floor(minV), Math.ceil(maxV)];
              }
            },
          },
          axes: [
            {
              stroke: axisColor,
              grid: { stroke: gridColor, width: 1 },
              ticks: { stroke: axisColor, width: 1 },
            },
            {
              stroke: axisColor,
              grid: { stroke: gridColor, width: 1 },
              ticks: { stroke: axisColor, width: 1 },
            }
          ],
        };
        return options;
      }
    }

    if (comparisonMode === 'sidebyside') {
      if (activeDatasets.length === 0) {
        return;
      }
      const plots: uPlot[] = [];
      const resizeObservers: ResizeObserver[] = [];
      const debouncedResizers: (() => void)[] = [];

      activeDatasets.forEach((dataset, index) => {
        const ampEl = sideBySideAmpRefs.current[index];
        const phiEl = sideBySidePhiRefs.current[index];
        if (!ampEl || !phiEl) {
          return;
        }

        const ampRes = preparePlotData(dataset.data, 'amp');
        const phiRes = preparePlotData(dataset.data, 'phi');

        // Check if data is valid to prevent uPlot crash
        if (!ampRes.mainData || !phiRes.mainData) return;

        const options_amp = initialPlotOptions(ampRes.seriesNum, 'amp', ampRes.legendInfo);
        const options_phi = initialPlotOptions(phiRes.seriesNum, 'phi', phiRes.legendInfo);
        options_amp.title = `${dataset.name} - Amplitude`;
        options_phi.title = `${dataset.name} - Phase`;

        const plotAmpInstance = new uPlot(options_amp, ampRes.mainData, ampEl);
        const plotPhiInstance = new uPlot(options_phi, phiRes.mainData, phiEl);
        plots.push(plotAmpInstance, plotPhiInstance);

        const handleResizeAmp = debounce(() => {
          if (!ampEl.isConnected) return;
          try {
            plotAmpInstance.setSize({
              width: ampEl.offsetWidth,
              height: 350,
            });
          } catch (e) {
            console.warn("Resize Error (Amp):", e);
          }
        }, 100);

        const handleResizePhi = debounce(() => {
          if (!phiEl.isConnected) return;
          try {
            plotPhiInstance.setSize({
              width: phiEl.offsetWidth,
              height: 350,
            });
          } catch (e) {
            console.warn("Resize Error (Phi):", e);
          }
        }, 100);

        debouncedResizers.push(handleResizeAmp.cancel, handleResizePhi.cancel);

        const resizeObserverAmp = new ResizeObserver(handleResizeAmp);
        const resizeObserverPhi = new ResizeObserver(handleResizePhi);

        resizeObserverAmp.observe(ampEl);
        resizeObserverPhi.observe(phiEl);
        resizeObservers.push(resizeObserverAmp, resizeObserverPhi);
      });

      return () => {
        debouncedResizers.forEach(cancel => cancel());
        resizeObservers.forEach((observer) => observer.disconnect());
        plots.forEach((plot) => plot.destroy());
      };
    }

    if (!ampChartRef.current || !phiChartRef.current || (data.length === 0 && !useOverlay)) {
      return;
    }

    const filterDatasets = (datasets: typeof overlayDatasets) => {
      return datasets.map(d => {
        // If this dataset is the one currently displayed in the table (raw data matches),
        // we use the store's filteredData which includes AG-Grid filters + Sidebar filters.
        if (d.data === rawData) {
          return {
            ...d,
            data: filteredData
          };
        }
        // For other datasets, use Sidebar filters only
        return {
          ...d,
          data: d.data.filter(row => {
            const freqMatch = freqSelected === 'all' || (freqSelected as Set<string>).has(String(row.Freq_id));
            const txMatch = txSelected === 'all' || (txSelected as Set<string>).has(String(row.Tx_id));
            const rxMatch = rxSelected === 'all' || (rxSelected as Set<string>).has(String(row.Rx_id));
            return freqMatch && txMatch && rxMatch;
          })
        }
      });
    };

    const filteredOverlayDatasets = useOverlay ? filterDatasets(overlayDatasets) : [];

    // Extract Data
    const ampRes = useOverlay
      ? preparePlotDataForDatasets(filteredOverlayDatasets, 'amp')
      : preparePlotData(data, 'amp');
    const phiRes = useOverlay
      ? preparePlotDataForDatasets(filteredOverlayDatasets, 'phi')
      : preparePlotData(data, 'phi');

    if (!ampRes.mainData || !phiRes.mainData) {
      return;
    }

    // Main Plot Options
    const options_amp = initialPlotOptions(ampRes.seriesNum, 'amp', ampRes.legendInfo);
    const options_phi = initialPlotOptions(phiRes.seriesNum, 'phi', phiRes.legendInfo);

    const plotAmpInstance = new uPlot(options_amp, ampRes.mainData, ampChartRef.current!)
    const plotPhiInstance = new uPlot(options_phi, phiRes.mainData, phiChartRef.current!)

    // Initial plots list
    // Initial plots list
    const plots: uPlot[] = [plotAmpInstance, plotPhiInstance];
    let plotAmpResInstance: uPlot | null = null;
    let plotPhiResInstance: uPlot | null = null;

    // Residual Plots
    // Residual Plot Options Generator
    // Residual Plot Options Generator
    const residualPlotOptions = (numSeries: number, _: string, legendInfo: LegendInfo[]): uPlot.Options => {
      // Replicate exact color logic from initialPlotOptions to match Data/Model
      const basicColors = isDarkMode
        ? dataVizPalette.categorical.dark
        : dataVizPalette.categorical.light;

      const datasetIds = legendInfo
        .map((item) => item.datasetId)
        .filter((id): id is string => Boolean(id));
      const useDefaultColors = new Set(datasetIds).size <= 1;

      const seriesColors = legendInfo.map((item) => {
        const fallbackColor =
          basicColors[Math.abs(item.RxId - (legendInfo[0]?.RxId ?? 0)) % basicColors.length];
        const baseColor = useDefaultColors ? fallbackColor : (item.datasetColor ?? fallbackColor); // Use dataset color if available
        const lightnessShift = (parseInt(item.freqId) - 1) * 15;
        const normalized = normalizeColorToHsl(baseColor);
        if (!normalized) {
          return baseColor;
        }
        const newLightness = (normalized.l + lightnessShift) % 100;
        return updateLightness(baseColor, newLightness);
      });

      const series: uPlot.Series[] = [
        { label: 'Distance (km)' },
      ];

      for (let idx = 0; idx < numSeries; idx++) {
        const datasetLabel = legendInfo[idx]?.datasetName
          ? `${legendInfo[idx].datasetName} - `
          : "";
        const strokeColor = seriesColors[idx];
        series.push({
          show: true,
          label: `${datasetLabel}Residual`,
          stroke: strokeColor,
          width: 0,
          points: { show: true, size: 4, fill: strokeColor }
        });
      }

      return {
        mode: 1,
        width: 950,
        height: 200,
        cursor: {
          drag: { x: true, y: true, uni: 1, dist: 30 },
          lock: true,
          sync: {
            key: uPlot.sync("responsePlot").key,
            setSeries: true,
            scales: ["x", null],
          }
        },
        scales: {
          x: { time: false, auto: true },
          y: { auto: true } // Linear scale default
        },
        axes: [
          {
            stroke: isDarkMode ? "#94a3b8" : "#475569",
            grid: { stroke: isDarkMode ? "#334155" : "#e2e8f0", width: 1 },
            ticks: { stroke: isDarkMode ? "#94a3b8" : "#475569", width: 1 },
          },
          {
            stroke: isDarkMode ? "#94a3b8" : "#475569",
            grid: { stroke: isDarkMode ? "#334155" : "#e2e8f0", width: 1 },
            ticks: { stroke: isDarkMode ? "#94a3b8" : "#475569", width: 1 },
            size: 60,
          }
        ],
        series,
        legend: { show: false }
      };
    };

    // Residual Plots
    if (showResidual && ampRes.residualData && ampResidualRef.current) {
      const res_opt_amp = residualPlotOptions(ampRes.seriesNum, 'amp', ampRes.legendInfo);
      res_opt_amp.title = "Amplitude Residuals";
      plotAmpResInstance = new uPlot(res_opt_amp, ampRes.residualData, ampResidualRef.current);
      plots.push(plotAmpResInstance);
    }

    if (showResidual && phiRes.residualData && phiResidualRef.current) {
      const res_opt_phi = residualPlotOptions(phiRes.seriesNum, 'phi', phiRes.legendInfo);
      res_opt_phi.title = "Phase Residuals";
      plotPhiResInstance = new uPlot(res_opt_phi, phiRes.residualData, phiResidualRef.current);
      plots.push(plotPhiResInstance);
    }


    // Add resize observer to handle resizing of charts
    const handleResize = debounce(() => {
      // Amp Main
      if (ampChartRef.current && plotAmpInstance) {
        try {
          plotAmpInstance.setSize({
            width: ampChartRef.current.offsetWidth,
            height: 350,
          });
        } catch (e) { console.warn("Resize Amp:", e); }
      }
      // Phi Main
      if (phiChartRef.current && plotPhiInstance) {
        try {
          plotPhiInstance.setSize({
            width: phiChartRef.current.offsetWidth,
            height: 350,
          });
        } catch (e) { console.warn("Resize Phi:", e); }
      }
      // Amp Residual
      if (ampResidualRef.current && plotAmpResInstance) {
        try {
          plotAmpResInstance.setSize({
            width: ampResidualRef.current.offsetWidth,
            height: 200,
          });
        } catch (e) { console.warn("Resize Amp Res:", e); }
      }
      // Phi Residual
      if (phiResidualRef.current && plotPhiResInstance) {
        try {
          plotPhiResInstance.setSize({
            width: phiResidualRef.current.offsetWidth,
            height: 200,
          });
        } catch (e) { console.warn("Resize Phi Res:", e); }
      }
    }, 100);

    const resizeObserver = new ResizeObserver(handleResize);
    if (ampChartRef.current) resizeObserver.observe(ampChartRef.current);
    if (phiChartRef.current) resizeObserver.observe(phiChartRef.current);
    if (ampResidualRef.current && showResidual) resizeObserver.observe(ampResidualRef.current);
    if (phiResidualRef.current && showResidual) resizeObserver.observe(phiResidualRef.current);

    // Cleanup function to destroy plot instances on unmount
    return () => {
      handleResize.cancel();
      resizeObserver.disconnect();
      plots.forEach((plot) => plot.destroy());
    };
  }, [
    activeDatasets,
    overlayDatasets,
    comparisonMode,
    filteredData,
    dragEnabled,
    scrollEnabled,
    legendLiveEnabled,
    wrapPhase,
    selectedValue,
    showLegend,
    extractPlotData,
    freqSelected,
    txSelected,
    rxSelected,
    isDarkMode, // Add theme dependency to trigger re-render on theme change
  ]);

  const handleToggleDrag = () => {
    setDragEnabled(!dragEnabled);
    // console.log('dragEnabled: ', dragEnabled);
  };

  const handleToggleScroll = () => {
    setScrollEnabled(!scrollEnabled);
  };

  const handleToggleLegendLive = () => {
    setlegendLiveEnabled(!legendLiveEnabled);
  }

  const handleToggleLegendShow = () => {
    setShowLegend(!showLegend);
  }

  const handleTogglePhaseWrap = () => {
    setWrapPhase(!wrapPhase);
  }

  return (
    <div className="grid">
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {/* Popular Options */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox id="show-model" checked={showModel} onCheckedChange={(val) => setShowModel(val as boolean)} />
              <Label htmlFor="show-model" className="text-sm">Model</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="show-residual" checked={showResidual} onCheckedChange={(val) => setShowResidual(val as boolean)} />
              <Label htmlFor="show-residual" className="text-sm">Residual</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="show-data" checked={showData} onCheckedChange={(val) => setShowData(val as boolean)} />
              <Label htmlFor="show-data" className="text-sm">Data</Label>
            </div>
          </div>

          <Separator orientation="vertical" className="hidden sm:block h-6" />

          {/* View Config */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Label className='text-sm font-medium'>Error Style</Label>
              <Select value={selectedValue} onValueChange={setSelectedValue}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Error Bars">Error Bars</SelectItem>
                  <SelectItem value="High-Low Bands">High-Low Bands</SelectItem>
                  <SelectItem value="No Error Bars">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="phase-wrap" checked={wrapPhase} onCheckedChange={handleTogglePhaseWrap} />
              <Label htmlFor="phase-wrap" className='text-sm'>Wrap Phase</Label>
            </div>
          </div>

          <Separator orientation="vertical" className="hidden sm:block h-6" />

          {/* Interaction Config */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch id="drag-mode" checked={dragEnabled} onCheckedChange={handleToggleDrag} />
              <Label htmlFor="drag-mode" className='text-sm'>Wheel Drag</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="scroll-mode" checked={scrollEnabled} onCheckedChange={handleToggleScroll} />
              <Label htmlFor="scroll-mode" className='text-sm'>Wheel Scroll</Label>
            </div>
          </div>

          <Separator orientation="vertical" className="hidden sm:block h-6" />

          {/* Legend Config */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch id="legend-show" checked={showLegend} onCheckedChange={handleToggleLegendShow} />
              <Label htmlFor="legend-show" className='text-sm'>Legend</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="legend-live" checked={legendLiveEnabled} onCheckedChange={handleToggleLegendLive} disabled={!showLegend} />
              <Label htmlFor="legend-live" className={`text-sm ${!showLegend ? 'text-muted-foreground' : ''}`}>Live Values</Label>
            </div>
          </div>
        </div>
      </div>

      <Separator className="mb-4" />
      {comparisonMode === 'statistical' && referenceDataset && (
        <div className="grid gap-2 rounded-lg border p-3 text-sm">
          <div className="font-medium">
            Statistical summary (reference: {referenceDataset.name})
          </div>
          {Object.entries(statistics).length === 0 ? (
            <div className="text-muted-foreground">No comparison datasets selected.</div>
          ) : (
            Object.entries(statistics).map(([datasetId, metrics]) => {
              const datasetName = activeDatasets.find((dataset) => dataset.id === datasetId)?.name ?? datasetId;
              return (
                <div key={datasetId} className="flex flex-wrap gap-3">
                  <span className="font-medium">{datasetName}</span>
                  <span>Pairs: {metrics.count}</span>
                  <span>RMSE: {metrics.rmse?.toFixed(4) ?? 'N/A'}</span>
                  <span>MAE: {metrics.mae?.toFixed(4) ?? 'N/A'}</span>
                  <span>Corr: {metrics.correlation?.toFixed(3) ?? 'N/A'}</span>
                </div>
              );
            })
          )}
        </div>
      )}
      {comparisonMode === 'sidebyside' ? (
        <div className="grid gap-6">
          {activeDatasets.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No datasets selected for side-by-side comparison.
            </div>
          ) : (
            activeDatasets.map((dataset, index) => (
              <div key={dataset.id} className="grid gap-2">
                <div className="text-sm font-medium">{dataset.name}</div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <div
                      id={`amp-chart-${dataset.id}`}
                      className="overflow-auto"
                      ref={(el) => {
                        sideBySideAmpRefs.current[index] = el;
                      }}
                    />
                    {/* Residual placeholder for side-by-side - functionality not fully requested but good structure */}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div
                      id={`phi-chart-${dataset.id}`}
                      className="overflow-auto"
                      ref={(el) => {
                        sideBySidePhiRefs.current[index] = el;
                      }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        (!showData && !showModel && !showResidual) ?
          <div className="h-[400px] flex items-center justify-center border rounded-lg bg-muted/10 text-muted-foreground">
            Select an option (Model, Residual, or Data) to view plots
          </div>
          :
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <div id="amp-chart" className="overflow-auto" ref={ampChartRef} ></div>
              {showResidual && <div id="amp-residual-chart" className="h-[200px] overflow-auto" ref={ampResidualRef} ></div>}
            </div>
            <div className="flex flex-col gap-2">
              <div id="phi-chart" className="overflow-auto" ref={phiChartRef} ></div>
              {showResidual && <div id="phi-residual-chart" className="h-[200px] overflow-auto" ref={phiResidualRef} ></div>}
            </div>
          </div>
      )}
    </div>

  )
}
