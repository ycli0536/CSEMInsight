// src/components/UplotChartWithErrorBars.tsx
import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label"
import { useDataTableStore, CsemData, Dataset } from '@/store/settingFormStore';
import { useUPlotStore } from '@/store/plotCanvasStore';
import { wheelZoomPlugin } from '@/components/custom/uplot-wheel-zoom-plugin';
import { RadioGroupExample } from '@/components/custom/errRadioGroup';
import { useRadioGroupStore } from '@/store/plotCanvasStore';
import { debounce } from 'lodash';
import { useComparisonStore } from '@/store/comparisonStore';
import { computeDifferenceData } from '@/utils/extractComparisonData';
import { computeStatistics, StatisticalMetrics } from '@/utils/statisticalAnalysis';

export function ResponsesWithErrorBars() {
  const ampChartRef = useRef<HTMLDivElement>(null);
  const phiChartRef = useRef<HTMLDivElement>(null);
  const sideBySideAmpRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sideBySidePhiRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { filteredData, datasets, activeDatasetIds, comparisonMode } = useDataTableStore();
  const { showLegend, dragEnabled, scrollEnabled, legendLiveEnabled, wrapPhase,
          setShowLegend, setDragEnabled, setScrollEnabled, setlegendLiveEnabled, setWrapPhase,
        } = useUPlotStore();
  const { selectedValue } = useRadioGroupStore();
  const { referenceDatasetId } = useComparisonStore();

  type LegendInfo = {
    freqId: string;
    RxId: number;
    type: string;
    datasetId?: string;
    datasetName?: string;
    datasetColor?: string;
  };

  const normalizePhase = (value: number) => {
    if (!wrapPhase) {
      return value;
    }
    const normalized = ((value + 180) % 360 + 360) % 360 - 180;
    return normalized === -180 ? 180 : normalized;
  };

  const extractPlotData = (data: CsemData[], type: string): [Float64Array[][][][], number, LegendInfo[]] => {
    // Get unique Tx_id (actual rcv id) values
    const uniqueRxIds = Array.from(new Set(data.map((item) => item.Tx_id)));
    // console.log('uniqueRxIds: ', uniqueRxIds);

    // Get unique Freq_id values
    const uniqueFreqIds = Array.from(new Set(data.map((item) => item.Freq_id)));
    // console.log('uniqueFreqIds: ', uniqueFreqIds);

    const comb_info: LegendInfo[] = [];

    // Prepare series data for each Freq_id
    const plotData: Float64Array[][][][] = uniqueFreqIds.map((freqId) => {
      // Filter data for the current Tx_id
      const filteredDataByFreqID = data.filter((item) => item.Freq_id === freqId);
      // Prepare series data for each Tx_id
      const dataByRxID: Float64Array[][][] = uniqueRxIds.map((RxId) => {
        if (type === 'phi') {
          // Filter data for the current Tx_id
          const filteredData = filteredDataByFreqID.filter((item) => item.Tx_id === RxId && item.Type === '24');
      
          // Extracting the necessary data for the current subset
          const YdistSeries = filteredData.map((item) => item.Y_rx / 1e3);
          const rawDataSeries = filteredData.map((item) => item.Data);
          const dataSeries = rawDataSeries.map((value) => normalizePhase(value));
          const stdErrSeries = filteredData.map((item) => item.StdErr);

          comb_info.push({freqId, RxId, type});

          // Create uPlot data array for the current Tx_id
          return [
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(dataSeries),   // y-values (Data)
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(stdErrSeries)  // y-values (StdErr)
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(rawDataSeries).map((v, idx) => normalizePhase(v + new Float64Array(stdErrSeries)[idx])), // upper limit
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(rawDataSeries).map((v, idx) => normalizePhase(v - new Float64Array(stdErrSeries)[idx])), // lower limit
            ]
          ];
        } else if (type === 'amp') {
          // Filter data for the current Tx_id
          const filteredData = filteredDataByFreqID.filter((item) => item.Tx_id === RxId && item.Type === '28');
      
          // Extracting the necessary data for the current subset
          const YdistSeries = filteredData.map((item) => item.Y_rx / 1e3);
          const dataSeries = filteredData.map((item) => 10 ** item.Data);
          const stdErrSeries = filteredData.map((item) => item.StdErr * Math.log(10) * 10 ** item.Data);
  
          comb_info.push({freqId, RxId, type});

          // Create uPlot data array for the current Freq_id
          return [
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(dataSeries),   // y-values (Data)
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(stdErrSeries)  // y-values (StdErr)
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(dataSeries).map((v, idx) => v + new Float64Array(stdErrSeries)[idx]), // upper limit
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(dataSeries).map((v, idx) => v - new Float64Array(stdErrSeries)[idx]), // lower limit
            ]
          ];
        }
        else {
          return [];
        }
      });
      return dataByRxID;
    });

    // Bug: if uniqueRxIds.length is different for each RxId, plotting will be wrong
    return [plotData, uniqueRxIds.length * uniqueFreqIds.length, comb_info];
  };

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

    const buildSeriesData = (
      data: CsemData[],
      type: string,
    ): { plotData: Float64Array[][]; seriesNum: number; legendInfo: LegendInfo[] } => {
      const [plotData0, seriesNum, comb_info] = extractPlotData(data, type); // RxId/Freq/Data
      if (!plotData0.length) {
        return { plotData: [], seriesNum: 0, legendInfo: [] };
      }

      // Data flattened and grouped by frequency [Data][FreqId]
      const parsedDataByFreq = plotData0.map((item) => // RxId
        {
          const dataPerFreq = item.map((subItem) => subItem[0]).concat(
            item.map((subItem) => subItem[2]).concat(
              item.map((subItem) => subItem[3]))
          )
        return dataPerFreq;
      }
      );

      if (!parsedDataByFreq.length) {
        return { plotData: [], seriesNum: 0, legendInfo: [] };
      }

      const parsedData = parsedDataByFreq[0].map((_, index) =>
        parsedDataByFreq.map((item) => item[index])
      );

      // Function to flatten the array in the first dimension
      function flattenFirstDim(arr: Float64Array[][][]) {
        return arr.reduce((acc, current) => acc.concat(current), []);
      }

      // plotData0 = [RxId][FreqId][DataSeries: Data/StdErr/UpperLimit/LowerLimit]
      const plotData = flattenFirstDim(parsedData);

      // update/reorder the legend info
      const sortedArray = comb_info.sort((a, b) => a.RxId - b.RxId);

      return { plotData, seriesNum, legendInfo: sortedArray };
    };

    const preparePlotData = (
      data: CsemData[],
      type: string,
    ): [uPlot.AlignedData, number, LegendInfo[]] => {
      const { plotData, seriesNum, legendInfo } = buildSeriesData(data, type);
      return [uPlot.join(plotData), seriesNum, legendInfo];
    };

    const preparePlotDataForDatasets = (
      datasetsToPlot: Dataset[],
      type: string,
    ): [uPlot.AlignedData, number, LegendInfo[]] => {
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

      const combinedLegendInfo: LegendInfo[] = [];
      const dataSeries: Float64Array[][] = [];
      const upperSeries: Float64Array[][] = [];
      const lowerSeries: Float64Array[][] = [];
      let combinedSeriesNum = 0;

      seriesGroups.forEach((group) => {
        if (!group.seriesNum) {
          return;
        }
        const dataChunk = group.plotData.slice(0, group.seriesNum);
        const upperChunk = group.plotData.slice(group.seriesNum, group.seriesNum * 2);
        const lowerChunk = group.plotData.slice(group.seriesNum * 2, group.seriesNum * 3);
        dataSeries.push(...dataChunk);
        upperSeries.push(...upperChunk);
        lowerSeries.push(...lowerChunk);
        combinedLegendInfo.push(...group.legendInfo);
        combinedSeriesNum += group.seriesNum;
      });

      const combinedPlotData = [...dataSeries, ...upperSeries, ...lowerSeries];

      return [uPlot.join(combinedPlotData), combinedSeriesNum, combinedLegendInfo];
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

    if (ampChartRef.current && phiChartRef.current && (data.length > 0 || useOverlay)) {

      const initialPlotOptions = (seriesNum: number, type: string, legendInfo: LegendInfo[]): uPlot.Options => {
        // Define colors and labels for each dataset
        // console.log('seriesNum: ', seriesNum);
        // console.log('legendInfo: ', legendInfo);
        const basicColors = [
          "hsl(240, 100%, 50%)", //"blue", 
          "hsl(  0, 100%, 50%)", //"red", 
          "hsl(120, 100%, 25%)", //"green", 
          "hsl( 39, 100%, 50%)", //"orange", 
          "hsl(271,  76%, 53%)", //"blueviolet"
          "hsl(  0,  59%, 41%)", //"brown", 
          "hsl(270, 100%, 50%)", //"blue-magenta", 
          "hsl( 34,  44%, 69%)", //"tan", 
          "hsl(300, 100%, 25%)", //"purple", 
          "hsl( 60, 100%, 25%)", //"olive", 
          "hsl(180, 100%, 25%)", //"teal"
          "hsl(328, 100%, 54%)", //"deep pink",
          ];
        // const SeriesColors = (seriesIdx: number): string => {
        //   return basicColors[(legendInfo[seriesIdx - 1].RxId - (legendInfo[0].RxId)) % basicColors.length]
        // }
        // if RxId is the same, for different freqId, use the monochromatic colors centered at 50% of corresponding basicColor based on freqId

        const seriesColors = legendInfo.map((item, idx) => {
          const fallbackColor =
            basicColors[Math.abs(item.RxId - (legendInfo[0]?.RxId ?? 0)) % basicColors.length];
          const baseColor = item.datasetColor ?? fallbackColor;
          const lightnessShift = (parseInt(item.freqId) - 1) * 15;
          const normalized = normalizeColorToHsl(baseColor);
          if (!normalized) {
            return baseColor;
          }
          const newLightness = (normalized.l + lightnessShift) % 100;
          return updateLightness(baseColor, newLightness);
        });
        // console.log('seriesColors: ', seriesColors);

        // Dynamic series configuration
        const series: uPlot.Series[] = [
          { label: 'Distance (km)' },  // X-axis label
        ];
        for (let idx = 0; idx < seriesNum; idx++) {
          const datasetLabel = legendInfo[idx]?.datasetName
            ? `${legendInfo[idx].datasetName} - `
            : "";
          series.push({
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
          for (let idx = 0; idx < seriesNum; idx++) {
            const datasetLabel = legendInfo[idx]?.datasetName
              ? `${legendInfo[idx].datasetName} - `
              : "";
            seriesWithBands.push({
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
          for (let idx = seriesNum; idx < seriesNum*2; idx++) {
            seriesWithBands.push({
              stroke: seriesColors[idx - seriesNum],
              points: {
                show: true,
                size: 3,
                space: 0,
              },
              label: " ",
            });
          }
          for (let idx = seriesNum * 2; idx < seriesNum * 3; idx++) {
            seriesWithBands.push({
              stroke: seriesColors[idx - 2 * seriesNum],
              points: {
                show: true,
                size: 3,
                space: 0,
              },
              label: " ",
            });
          }
          optsShared.series = seriesWithBands;
          if (showLegend) {
            optsShared.legend = { 
              show: true,
              live: legendLiveEnabled,
              markers: {
                fill: (_, seriesIdx: number) => {
                  return seriesColors[seriesIdx - 1]}
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
                  return seriesColors[seriesIdx - 1]}
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
      
                      for (let i = 0; i < dataX.length; i++) {
                        const x = dataX[i];
                        const y = u.data[seriesIdx][i];
                        const upperLimit = u.data[seriesIdx + seriesNum][i] as number;
                        const lowerLimit = u.data[seriesIdx + seriesNum * 2][i] as number;
      
                        if (y !== null && y !== undefined && x >= minX && x <= maxX && y >= lowerLimit && y <= upperLimit) {
                        const xPos = u.valToPos(x, 'x', true);
      
                        const errTopPos = u.valToPos(upperLimit, 'y', true);
                        const errBottomPos = u.valToPos(lowerLimit, 'y', true);
      
                        // const yLow = Math.max(u.bbox.top, lowerLimit);
                        // const yHigh = Math.min(u.bbox.top + u.bbox.height, upperLimit);
                        // console.log('yLow, yHigh: ', yLow, yHigh);
                        
                        // if (yLow > yHigh) { // for amp yLow > yHigh
                          ctx.beginPath();
                          ctx.moveTo(xPos, errTopPos);
                          ctx.lineTo(xPos, errBottomPos);
                          ctx.stroke();
      
                          // Draw the top cap
                          ctx.beginPath();
                          ctx.moveTo(xPos - capWidth, errTopPos);
                          ctx.lineTo(xPos + capWidth, errTopPos);
                          ctx.stroke();
      
                          // Draw the bottom cap
                          ctx.beginPath();
                          ctx.moveTo(xPos - capWidth, errBottomPos);
                          ctx.lineTo(xPos + capWidth, errBottomPos);
                          ctx.stroke();
                        // }
                        }
                      }
                    }
      
                    // Loop through each series to draw elements
                    for (let i = 0; i < seriesNum; i++) {
                      drawErrorBars(i + 1, seriesColors[i]);
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
                  return seriesColors[seriesIdx - 1]}
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
                  for (let i = 1; i < seriesNum + 1; i++) {
                    const ub = u.data[i + seriesNum] as number[];
                    const lb = u.data[i + seriesNum * 2] as number[];
                    minV = Math.min(minV, ...lb.filter(Number.isFinite));
                    maxV = Math.max(maxV, ...ub.filter(Number.isFinite));
                    // console.log('min/max: ',  minV, maxV)
                  }
                  const logMin = 10**Math.floor(Math.log10(minV));
                  const logMax = 10**Math.ceil(Math.log10(maxV));
                  // console.log('log min/max: ',  Math.log10(logMin), Math.log10(logMax))
    
                  return [logMin, logMax];
                }
              }},
          //   focus: {
          //     alpha: 0.03,
          // },
            axes: [
              {},
              {
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
                auto: true,},
              y: { 
                auto: true,
                range: (u, min, max) => {
                  let minV = min;
                  let maxV = max;
                  for (let i = 1; i < seriesNum + 1; i++) {
                    const ub = u.data[i + seriesNum] as number[];
                    const lb = u.data[i + seriesNum * 2] as number[];
                    minV = Math.min(minV, ...lb.filter(Number.isFinite));
                    maxV = Math.max(maxV, ...ub.filter(Number.isFinite));
                  }
      
                  return [Math.floor(minV), Math.ceil(maxV)];
                }
              },
              
            }
        }
        return options;
        }
      }

      if (comparisonMode === 'sidebyside') {
        const plots: uPlot[] = [];
        const resizeObservers: ResizeObserver[] = [];

        activeDatasets.forEach((dataset, index) => {
          const ampEl = sideBySideAmpRefs.current[index];
          const phiEl = sideBySidePhiRefs.current[index];
          if (!ampEl || !phiEl) {
            return;
          }

          const [ampDataWithBand, ampDataSize, ampLegendInfo] = preparePlotData(dataset.data, 'amp');
          const [phiDataWithBand, phiDataSize, phiLegendInfo] = preparePlotData(dataset.data, 'phi');

          const options_amp = initialPlotOptions(ampDataSize, 'amp', ampLegendInfo);
          const options_phi = initialPlotOptions(phiDataSize, 'phi', phiLegendInfo);
          options_amp.title = `${dataset.name} - Amplitude`;
          options_phi.title = `${dataset.name} - Phase`;

          const plotAmpInstance = new uPlot(options_amp, ampDataWithBand, ampEl);
          const plotPhiInstance = new uPlot(options_phi, phiDataWithBand, phiEl);
          plots.push(plotAmpInstance, plotPhiInstance);

          const resizeObserverAmp = new ResizeObserver(
            debounce(() => {
              plotAmpInstance.setSize({
                width: ampEl.offsetWidth,
                height: 350,
              });
            }, 100)
          );
          const resizeObserverPhi = new ResizeObserver(
            debounce(() => {
              plotPhiInstance.setSize({
                width: phiEl.offsetWidth,
                height: 350,
              });
            }, 100)
          );
          resizeObserverAmp.observe(ampEl);
          resizeObserverPhi.observe(phiEl);
          resizeObservers.push(resizeObserverAmp, resizeObserverPhi);
        });

        return () => {
          plots.forEach((plot) => plot.destroy());
          resizeObservers.forEach((observer) => observer.disconnect());
        };
      }

      const [ampDataWithBand, ampDataSize, ampLegendInfo] = useOverlay
        ? preparePlotDataForDatasets(overlayDatasets, 'amp')
        : preparePlotData(data, 'amp');
      const [phiDataWithBand, phiDataSize, phiLegendInfo] = useOverlay
        ? preparePlotDataForDatasets(overlayDatasets, 'phi')
        : preparePlotData(data, 'phi');

      const options_amp = initialPlotOptions(ampDataSize, 'amp', ampLegendInfo);
      const options_phi = initialPlotOptions(phiDataSize, 'phi', phiLegendInfo);
      // console.log('ampDataWithBand: ', ampDataWithBand);
      // console.log('phiDataWithBand: ', phiDataWithBand);

      // console.log('options_phi: ', options_phi);
      // Initialize uPlot with ref
      const plotAmpInstance = new uPlot(options_amp, ampDataWithBand, ampChartRef.current!)
      const plotPhiInstance = new uPlot(options_phi, phiDataWithBand, phiChartRef.current!)

      // Add resize observer to handle resizing of charts
      const resizeObserverAmp = new ResizeObserver(
        debounce(() => {
          if (ampChartRef.current) {
            plotAmpInstance.setSize({
              width: ampChartRef.current.offsetWidth,
              height: 350, // Set a fixed height to prevent uncontrolled growth
            });
          }
        }, 100)
      );

      const resizeObserverPhi = new ResizeObserver(
        debounce(() => {
          if (phiChartRef.current) {
            plotPhiInstance.setSize({
              width: phiChartRef.current.offsetWidth,
              height: 350, // Set a fixed height to prevent uncontrolled growth
            });
          }
        }, 100)
      );

      resizeObserverAmp.observe(ampChartRef.current);
      resizeObserverPhi.observe(phiChartRef.current);

      // Cleanup function to destroy plot instances on unmount
      return () => {
        plotAmpInstance.destroy();
        plotPhiInstance.destroy();
        resizeObserverAmp.disconnect();
        resizeObserverPhi.disconnect();
      };
    }
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
      <div className="flex gap-2 py-3 space-x-1">
        <div className="flex items-center space-x-2">
          <Switch 
            id="drag-mode"
            checked={dragEnabled}
            onCheckedChange={handleToggleDrag}
            // disabled
            // aria-readonly
          />
          <Label htmlFor="drag-mode" className='text-lg'>Toggle Wheel Drag</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch 
            id="scroll-mode"
            checked={scrollEnabled}
            onCheckedChange={handleToggleScroll}
            // disabled
            // aria-readonly
          />
          <Label htmlFor="scroll-mode" className='text-lg'>Toggle Wheel Scroll</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch 
            id="legend-live"
            checked={legendLiveEnabled}
            onCheckedChange={handleToggleLegendLive}
            // disabled
            // aria-readonly
          />
          <Label htmlFor="legend-live" className='text-lg'>Legend Values</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch 
            id="legend-show"
            checked={showLegend}
            onCheckedChange={handleToggleLegendShow}
            // disabled
            // aria-readonly
          />
          <Label htmlFor="legend-show" className='text-lg'>Show Legend</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="phase-wrap"
            checked={wrapPhase}
            onCheckedChange={handleTogglePhaseWrap}
          />
          <Label htmlFor="phase-wrap" className='text-lg'>Wrap Phase</Label>
        </div>
      </div>
      {/* <RadioGroupDemo /> */}
      <RadioGroupExample />
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
                  <div
                    id={`amp-chart-${dataset.id}`}
                    className="overflow-auto"
                    ref={(el) => {
                      sideBySideAmpRefs.current[index] = el;
                    }}
                  />
                  <div
                    id={`phi-chart-${dataset.id}`}
                    className="overflow-auto"
                    ref={(el) => {
                      sideBySidePhiRefs.current[index] = el;
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2">
          <div id="amp-chart" className="overflow-auto" ref={ampChartRef} ></div>
          <div id="phi-chart" className="overflow-auto" ref={phiChartRef} ></div>
        </div>
      )}
    </div>

  )
}
