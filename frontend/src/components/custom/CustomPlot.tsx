
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useDataTableStore, useSettingFormStore } from "@/store/settingFormStore";
import { useTheme } from "@/hooks/useTheme";
import { getChartColors } from "@/lib/colorPalette";
import { CsemData } from '@/types';
import { wheelZoomPlugin } from '@/components/custom/uplot-wheel-zoom-plugin';

export function CustomPlot() {
    const plotRef = useRef<HTMLDivElement>(null);
    const uPlotRef = useRef<uPlot | null>(null);

    const { filteredData } = useDataTableStore();
    const { xAxisColumn, yAxisColumn, splitByColumn } = useSettingFormStore();

    const { theme, systemTheme } = useTheme();
    const resolvedTheme = theme === "system" ? systemTheme : theme;
    const isDarkMode = resolvedTheme === "dark";

    useEffect(() => {
        if (!plotRef.current || filteredData.length === 0) return;

        const xKey = xAxisColumn || 'Y_rx';
        const yKey = yAxisColumn || 'Data';
        // Show errors only if Y is 'Data'
        const showErrors = yKey === 'Data';

        // Group Data first
        const groups = new Map<string, CsemData[]>();
        if (splitByColumn) {
            filteredData.forEach(d => {
                const groupKey = String(d[splitByColumn as keyof CsemData]);
                if (!groups.has(groupKey)) groups.set(groupKey, []);
                groups.get(groupKey)?.push(d);
            });
        } else {
            groups.set('All', filteredData);
        }

        // Sort keys for stable coloring
        const sortedGroupKeys = Array.from(groups.keys()).sort();

        // Prepare uPlot Data and Series
        // Prepare uPlot Data and Series
        // Prepare uPlot Data and Series
        // Prepare uPlot Data and Series
        // Mode 2: data is [ null, [xSeries1, ySeries1], [xSeries2, ySeries2], ... ]
        // Index 0 is a placeholder (dummy series) as per uPlot Mode 2 convention.
        const data: unknown[] = [null];
        const seriesConfig: uPlot.Series[] = [{}];

        // Helper to get formatted X value
        const getX = (d: CsemData) => {
            let val = Number(d[xKey as keyof CsemData]);
            if (!xAxisColumn && xKey === 'Y_rx') val = val / 1e3;
            return val;
        };

        const pxRatio = window.devicePixelRatio;

        // Custom Path Builder (Adapted from PositionPlot.tsx)
        const drawPoints: uPlot.Series.PathBuilder = (u, seriesIdx, idx0, idx1) => {
            uPlot.orient(u, seriesIdx, (series, _dataX, _dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, _lineTo, _rect, arc) => {
                const d = u.data[seriesIdx] as unknown as any;
                if (!d) return;

                const xValues = d[0];
                const yValues = d[1];

                const pointSize = (series.points as any)?.size || 4;
                const size = pointSize * pxRatio;
                const strokeWidth = 1; // Fixed stroke width

                u.ctx.save();
                u.ctx.beginPath();
                u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
                u.ctx.clip();

                const fill = typeof series.fill === 'function' ? series.fill(u, seriesIdx) : series.fill;
                const stroke = typeof series.stroke === 'function' ? series.stroke(u, seriesIdx) : series.stroke;

                u.ctx.fillStyle = fill || 'black';
                u.ctx.strokeStyle = stroke || 'black';
                u.ctx.lineWidth = strokeWidth;

                const deg360 = 2 * Math.PI;
                const p = new Path2D();

                // Calculate visible range (very simplified, assuming linear)
                const sX = u.scales[scaleX.key!];
                const sY = u.scales[scaleY.key!];

                // We iterate all points (or use idx0/idx1 if passed correctly in Mode 2 - uPlot Mode 2 often passes whole range)
                // PositionPlot iterates all. We'll iterate all for safety unless idx0/idx1 are useful.
                // In Mode 2, idx0/idx1 might be for the specific series data.
                const len = xValues.length;
                for (let i = 0; i < len; i++) {
                    const xVal = xValues[i];
                    const yVal = yValues[i];

                    // Simple bounds check
                    if (xVal >= (sX.min!) && xVal <= (sX.max!) && yVal >= (sY.min!) && yVal <= (sY.max!)) {
                        const cx = valToPosX(xVal, scaleX, xDim, xOff);
                        const cy = valToPosY(yVal, scaleY, yDim, yOff);

                        moveTo(p, cx + size / 2, cy);
                        arc(p, cx, cy, size / 2, 0, deg360);
                    }
                }

                u.ctx.fill(p);
                u.ctx.stroke(p);
                u.ctx.restore();
            });

            return null; // Disable default renderer
        };


        // Colors
        const colors = [
            '#2563eb', '#16a34a', '#a16207', '#dc2626', '#9333ea', '#db2777',
            '#14b8a6', '#f59e0b', '#7c3aed', '#be185d'
        ];
        const darkColors = [
            '#60a5fa', '#4ade80', '#facc15', '#f87171', '#c084fc', '#f472b6',
            '#2dd4bf', '#fbbf24', '#a78bfa', '#e879f9'
        ];
        const palette = isDarkMode ? darkColors : colors;

        // Hook configuration
        const errorBarRanges: { seriesIdx: number, upperSeriesIdx: number, lowerSeriesIdx: number, color: string }[] = [];

        sortedGroupKeys.forEach((key, idx) => {
            const raw = groups.get(key)!;

            // Filter invalid points (NaN, Infinity, missing)
            const validPoints = raw.filter(d => {
                const xv = getX(d);
                const yv = Number(d[yKey as keyof CsemData]);
                return Number.isFinite(xv) && Number.isFinite(yv);
            });

            if (validPoints.length === 0) return;

            // Mode 2 requires X to be sorted per series
            validPoints.sort((a, b) => getX(a) - getX(b));

            const xArr: number[] = [];
            const yArr: number[] = [];
            const upperArr: number[] = [];
            const lowerArr: number[] = [];

            validPoints.forEach(d => {
                const xv = getX(d);
                const yv = Number(d[yKey as keyof CsemData]);

                xArr.push(xv);
                yArr.push(yv);

                if (showErrors) {
                    const err = Number(d.StdError);
                    if (Number.isFinite(err)) {
                        upperArr.push(yv + err);
                        lowerArr.push(yv - err);
                    } else {
                        upperArr.push(yv); // Fallback if error is missing
                        lowerArr.push(yv);
                    }
                }
            });

            // Main Series
            const currentSeriesDataIdx = data.length;
            data.push([new Float64Array(xArr), new Float64Array(yArr)]);
            const color = palette[idx % palette.length];

            seriesConfig.push({
                label: key,
                stroke: color,
                width: 0,
                fill: color, // Used by custom path builder
                points: { show: true, size: 4 }, // Used by custom path builder input
                paths: drawPoints
            });

            if (showErrors) {
                const upperSeriesDataIdx = data.length;
                data.push([new Float64Array(xArr), new Float64Array(upperArr)]);
                const lowerSeriesDataIdx = data.length;
                data.push([new Float64Array(xArr), new Float64Array(lowerArr)]);

                seriesConfig.push({
                    show: false,
                    label: `${key} upper`,
                } as any);
                seriesConfig.push({
                    show: false,
                    label: `${key} lower`,
                } as any);

                errorBarRanges.push({
                    seriesIdx: currentSeriesDataIdx,
                    upperSeriesIdx: upperSeriesDataIdx,
                    lowerSeriesIdx: lowerSeriesDataIdx,
                    color: color
                });
            }
        });

        // If no valid data at all (only dummy series exists), do not initialize uPlot
        if (data.length <= 1) {
            if (uPlotRef.current) {
                uPlotRef.current.destroy();
                uPlotRef.current = null;
            }
            return;
        }

        // Error Bar Draw Hook
        const drawHooks = showErrors ? [(u: uPlot) => {
            const ctx = u.ctx;
            const minX = u.scales.x.min as number;
            const maxX = u.scales.x.max as number;

            ctx.save();
            ctx.beginPath();
            ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
            ctx.clip();

            const capWidth = 4; // Slightly wider caps

            errorBarRanges.forEach(range => {
                const { seriesIdx, upperSeriesIdx, lowerSeriesIdx, color } = range;
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5; // Thicker error bars

                // In Mode 2, u.data contains the arrays directly
                // u.data[i] = [xValues, yValues]
                const seriesData = (u.data as unknown as any[])[seriesIdx];
                const upperData = (u.data as unknown as any[])[upperSeriesIdx];
                const lowerData = (u.data as unknown as any[])[lowerSeriesIdx];

                const dataX = seriesData[0]; // X array
                const dataY = seriesData[1];
                const dataUpper = upperData[1]; // Y array of upper
                const dataLower = lowerData[1]; // Y array of lower

                ctx.beginPath();
                for (let i = 0; i < dataX.length; i++) {
                    const x = dataX[i];

                    if (x < minX || x > maxX) continue;

                    const y = dataY[i];
                    if (y === null || y === undefined || Number.isNaN(y)) continue; // Added NaN check

                    const upper = dataUpper[i];
                    const lower = dataLower[i];

                    if (upper == null || lower == null || Number.isNaN(upper) || Number.isNaN(lower)) continue; // Added NaN check

                    const xPos = u.valToPos(x, 'x', true);
                    const topPos = u.valToPos(upper, 'y', true);
                    const botPos = u.valToPos(lower, 'y', true);

                    // Vertical Line
                    ctx.moveTo(xPos, topPos);
                    ctx.lineTo(xPos, botPos);
                    // Caps
                    ctx.moveTo(xPos - capWidth, topPos);
                    ctx.lineTo(xPos + capWidth, topPos);
                    ctx.moveTo(xPos - capWidth, botPos);
                    ctx.lineTo(xPos + capWidth, botPos);
                }
                ctx.stroke();
            });
            ctx.restore();
        }] : [];

        const chartColors = getChartColors(isDarkMode);

        const opts: uPlot.Options = {
            title: splitByColumn ? `${yKey} vs ${xKey} by ${splitByColumn}` : `${yKey} vs ${xKey}`,
            width: plotRef.current.clientWidth,
            height: plotRef.current.clientHeight || 400,
            mode: 2, // High Performance (XY)
            scales: {
                x: { time: false, auto: true },
                y: { auto: true },
            },
            axes: [
                { stroke: chartColors.axis, grid: { stroke: chartColors.grid }, label: xKey },
                { stroke: chartColors.axis, grid: { stroke: chartColors.grid }, label: yKey },
            ],
            legend: {
                show: true,
            },
            series: seriesConfig,
            hooks: {
                draw: drawHooks
            },
            plugins: [
                wheelZoomPlugin({ factor: 0.9, drag: true, scroll: true })
            ]
        };

        if (uPlotRef.current) {
            uPlotRef.current.destroy();
        }

        // TS Cast for data in Mode 2
        uPlotRef.current = new uPlot(opts, data as any, plotRef.current);

        const resizeObserver = new ResizeObserver(() => {
            if (plotRef.current && uPlotRef.current) {
                uPlotRef.current.setSize({
                    width: plotRef.current.clientWidth,
                    height: plotRef.current.clientHeight,
                });
            }
        });
        resizeObserver.observe(plotRef.current);

        return () => {
            resizeObserver.disconnect();
            uPlotRef.current?.destroy();
        };

    }, [filteredData, xAxisColumn, yAxisColumn, splitByColumn, isDarkMode]);

    return <div ref={plotRef} className="w-full h-full" />;
}

