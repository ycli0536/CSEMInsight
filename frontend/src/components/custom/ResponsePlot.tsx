// src/components/UplotChartWithErrorBars.tsx
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label"
import { useDataTableStore, CsemData } from '@/store/settingFormStore';
import { useUPlotStore } from '@/store/plotCanvasStore';
import { wheelZoomPlugin } from '@/components/custom/uplot-wheel-zoom-plugin';
import { RadioGroupExample } from '@/components/custom/errRadioGroup';
import { useRadioGroupStore } from '@/store/plotCanvasStore';

export function ResponsesWithErrorBars() {
  const ampChartRef = useRef<HTMLDivElement>(null);
  const phiChartRef = useRef<HTMLDivElement>(null);
  const { filteredData } = useDataTableStore();
  const { showLegend, dragEnabled, scrollEnabled, legendLiveEnabled, 
          setShowLegend, setDragEnabled, setScrollEnabled, setlegendLiveEnabled,
        } = useUPlotStore();
  const { selectedValue } = useRadioGroupStore();

  const extractPlotData = (data: CsemData[], type: string): [Float64Array[][][][], number, { freqId: string; RxId: number; type: string; }[]] => {
    // Get unique Tx_id (actual rcv id) values
    const uniqueRxIds = Array.from(new Set(data.map((item) => item.Tx_id)));
    // console.log('uniqueRxIds: ', uniqueRxIds);

    // Get unique Freq_id values
    const uniqueFreqIds = Array.from(new Set(data.map((item) => item.Freq_id)));
    // console.log('uniqueFreqIds: ', uniqueFreqIds);

    const comb_info: { freqId: string; RxId: number; type: string; }[] = [];

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
          const dataSeries = filteredData.map((item) => item.Data);
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
              new Float64Array(dataSeries).map((v, idx) => v + new Float64Array(stdErrSeries)[idx]), // upper limit
            ],
            [
              new Float64Array(YdistSeries),  // x-values (dist)
              new Float64Array(dataSeries).map((v, idx) => v - new Float64Array(stdErrSeries)[idx]), // lower limit
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

  useEffect(() => {
    const data = filteredData;
    
    if (ampChartRef.current && phiChartRef.current && data.length > 0) {

      const preparePlotData = (data: CsemData[], type: string): [uPlot.AlignedData, number, { freqId: string; RxId: number; type: string; }[]] => {
        const [plotData0, seriesNum, comb_info] = extractPlotData(data, type); // RxId/Freq/Data
        // console.log('plotData0: ', plotData0);
    
        // Data flattened and grouped by frequency [Data][FreqId]
        const parsedDataByFreq = plotData0.map((item) => // RxId
          {
            const dataPerFreq = item.map((subItem) => subItem[0]).concat(
              item.map((subItem) => subItem[2]).concat(
                item.map((subItem) => subItem[3]))
            )
            // console.log('item1: ', item);
          return dataPerFreq;
        }
        );

        // console.log('parsedDataByFreq: ', parsedDataByFreq);

        const parsedData = parsedDataByFreq[0].map((_, index) => 
          parsedDataByFreq.map((item) => item[index])
        );
        // console.log('parsedData: ', parsedData);
    
        // Function to flatten the array in the first dimension
        function flattenFirstDim(arr: Float64Array[][][]) {
          return arr.reduce((acc, current) => acc.concat(current), []);
        }
    
        // plotData0 = [RxId][FreqId][DataSeries: Data/StdErr/UpperLimit/LowerLimit]
        const plotData = flattenFirstDim(parsedData);
    
        // console.log('plotData0: ', plotData0);
        // console.log('plotData: ', plotData);

        //update/reorder the legend info
        const sortedArray = comb_info.sort((a, b) => a.RxId - b.RxId);
    
        return [uPlot.join(plotData), seriesNum, sortedArray];
      };

      const initialPlotOptions = (seriesNum: number, type: string, legendInfo: { freqId: string; RxId: number; type: string; }[]): uPlot.Options => {
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

        const changeLightness = (color: string, newLightness: number): string => {
          const baseHue = parseInt(color.match(/\d+/)![0], 10);
          const baseSaturation = parseInt(color.match(/(?<=\s)\d+(?=%)/)![0], 10);
          return `hsl(${baseHue}, ${baseSaturation}%, ${newLightness}%)`;
        }

        const seriesColors = legendInfo.map((item) => {
          const colorRxId = basicColors[(item.RxId - (legendInfo[0].RxId)) % basicColors.length];
          // Extract the hue from the base color
          const baseHue = parseInt(colorRxId.match(/\d+/)![0], 10);
          // Extract the saturation from the base color
          const baseSaturation = parseInt(colorRxId.match(/(?<=\s)\d+(?=%)/)![0], 10);
          // Extract the lightness from the base color
          const baseLightness = parseInt(colorRxId.match(/(?<=%\s*,\s*)\d+(?=%)/)![0], 10);

          // // Calculate the hue shift based on the freqId
          // const hueShift = (parseInt(item.freqId) - 1) * 10;
          // // Calculate the new hue
          // const newHue = (baseHue + hueShift) % 360;

          // Calculate the lightness shift based on the freqId
          const lightnessShift = (parseInt(item.freqId) - 1) * 15;
          // Calculate the new lightness
          // const newLightness = Math.min(100, baseLightness + lightnessShift);
          const newLightness = (baseLightness + lightnessShift) % 100;

          // Construct the new color
          const newColor = `hsl(${baseHue}, ${baseSaturation}%, ${newLightness}%)`;
          return newColor;
        });
        // console.log('seriesColors: ', seriesColors);

        // Dynamic series configuration
        const series: uPlot.Series[] = [
          { label: 'Distance (km)' },  // X-axis label
        ];
        for (let idx = 0; idx < seriesNum; idx++) {
          series.push({
            label: `rcv${legendInfo[idx].RxId} - freq${legendInfo[idx].freqId}`,
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
            fill: changeLightness(seriesColors[idx], 90),
          });
          bands.push({
            series: [idx + seriesNum * 2 + 1, idx + 1],
            fill: changeLightness(seriesColors[idx], 90),
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
            seriesWithBands.push({
              label: `rcv${legendInfo[idx].RxId} - freq${legendInfo[idx].freqId}`,
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

      const [ampDataWithBand, ampDataSize, ampLegendInfo] = preparePlotData(data, 'amp');
      const [phiDataWithBand, phiDataSize, phiLegendInfo] = preparePlotData(data, 'phi');

      const options_amp = initialPlotOptions(ampDataSize, 'amp', ampLegendInfo);
      const options_phi = initialPlotOptions(phiDataSize, 'phi', phiLegendInfo);
      // console.log('ampDataWithBand: ', ampDataWithBand);
      // console.log('phiDataWithBand: ', phiDataWithBand);

      // console.log('options_phi: ', options_phi);
      // Initialize uPlot with ref
      const plotAmpInstance = new uPlot(options_amp, ampDataWithBand, ampChartRef.current!)
      const plotPhiInstance = new uPlot(options_phi, phiDataWithBand, phiChartRef.current!)

      // Cleanup function to destroy plot instances on unmount
      return () => {
        plotAmpInstance.destroy();
        plotPhiInstance.destroy();
      };
    }
  }, [filteredData, dragEnabled, scrollEnabled, legendLiveEnabled, selectedValue, showLegend]);

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
      </div>
      {/* <RadioGroupDemo /> */}
      <RadioGroupExample />
      <div className="grid grid-cols-1 xl:grid-cols-2">
        <div id="amp-chart" className="overflow-auto" ref={ampChartRef} ></div>
        <div id="phi-chart" className="overflow-auto" ref={phiChartRef} ></div>
      </div>
    </div>

  )
}
