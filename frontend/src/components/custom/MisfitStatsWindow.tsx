import { useEffect, useRef, useState, useMemo } from "react";
import { SimpleBarChart, BarSeries } from "./SimpleBarChart";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useDataTableStore } from "@/store/settingFormStore";
import { useTheme } from "@/hooks/useTheme";
import { wheelZoomPlugin } from "@/components/custom/uplot-wheel-zoom-plugin";
import { generateMisfitStatsMockData } from "@/mocks/misfitStatsMock";
import { Loader2, Info } from "lucide-react";
import type { CsemData } from "@/types";


type RMSDataPoint = {
    Y_rx_km?: number;
    Y_tx_km?: number;
    Y_range_km?: number;
    Freq_id?: number;
    RMS: number;
};

type MisfitStatsData = {
    byRx: {
        amplitude: RMSDataPoint[];
        phase: RMSDataPoint[];
    };
    byTx: {
        amplitude: RMSDataPoint[];
        phase: RMSDataPoint[];
    };
    byRange: {
        amplitude: RMSDataPoint[];
        phase: RMSDataPoint[];
    };
    byFreq: {
        amplitude: RMSDataPoint[];
        phase: RMSDataPoint[];
    };
};

type DatasetStat = {
    id: string;
    name: string;
    color: string;
    stats: MisfitStatsData;
};

export const MisfitStatsWindow = () => {
    // uPlot container refs
    const scatterRef = useRef<HTMLDivElement>(null);

    // uPlot instance refs
    const scatterPlotRef = useRef<uPlot | null>(null);

    const { filteredData, datasets, activeDatasetIds } = useDataTableStore();
    const [datasetStats, setDatasetStats] = useState<DatasetStat[]>([]);
    const [loading, setLoading] = useState(false);
    const [missingResidual, setMissingResidual] = useState(false);

    const { theme, systemTheme } = useTheme();
    const resolvedTheme = theme === "system" ? systemTheme : theme;
    const isDarkMode = resolvedTheme === "dark";
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

    // --- SERIES CONFIGURATION ---
    const freqSeries = useMemo(() => {
        const series: BarSeries[] = [];
        datasetStats.forEach(ds => {
            series.push({ key: `Amp_${ds.id}`, label: `${ds.name} Amp`, color: ds.color });
            // Phase with 50% opacity
            const phiColor = ds.color.startsWith('#') && ds.color.length === 7 ? ds.color + '80' : ds.color;
            series.push({ key: `Phi_${ds.id}`, label: `${ds.name} Phi`, color: phiColor });
        });
        return series;
    }, [datasetStats]);

    // Reuse same series logic for Tx and Range as colors are dataset-based
    const txSeries = freqSeries;
    const rangeSeries = freqSeries;

    // --- DATA TRANSFORMATION ---

    const d3FreqData = useMemo(() => {
        if (datasetStats.length === 0) return [];

        // Union of all Freq IDs
        const freqs = new Set<number>();
        datasetStats.forEach(ds => {
            ds.stats.byFreq.amplitude.forEach(d => d.Freq_id !== undefined && freqs.add(d.Freq_id));
            ds.stats.byFreq.phase.forEach(d => d.Freq_id !== undefined && freqs.add(d.Freq_id));
        });
        const sortedFreqs = Array.from(freqs).sort((a, b) => a - b);

        return sortedFreqs.map(f => {
            const row: Record<string, string | number> = { name: f };
            datasetStats.forEach(ds => {
                const amp = ds.stats.byFreq.amplitude.find(d => d.Freq_id === f)?.RMS ?? 0;
                const phi = ds.stats.byFreq.phase.find(d => d.Freq_id === f)?.RMS ?? 0;
                row[`Amp_${ds.id}`] = amp;
                row[`Phi_${ds.id}`] = phi;
            });
            return row;
        });
    }, [datasetStats]);

    const rechartsTxData = useMemo(() => {
        if (datasetStats.length === 0) return [];

        const positions = new Set<number>();
        datasetStats.forEach(ds => {
            ds.stats.byTx.amplitude.forEach(d => d.Y_tx_km !== undefined && positions.add(d.Y_tx_km));
            ds.stats.byTx.phase.forEach(d => d.Y_tx_km !== undefined && positions.add(d.Y_tx_km));
        });
        const sortedPos = Array.from(positions).sort((a, b) => a - b);

        return sortedPos.map(pos => {
            const row: Record<string, string | number> = { name: pos.toFixed(2) };
            datasetStats.forEach(ds => {
                const amp = ds.stats.byTx.amplitude.find(d => d.Y_tx_km === pos)?.RMS ?? 0;
                const phi = ds.stats.byTx.phase.find(d => d.Y_tx_km === pos)?.RMS ?? 0;
                row[`Amp_${ds.id}`] = amp;
                row[`Phi_${ds.id}`] = phi;
            });
            return row;
        });
    }, [datasetStats]);

    const rechartsRangeData = useMemo(() => {
        if (datasetStats.length === 0) return [];

        // 1. Find Global Range Extents
        let globalMin = Infinity;
        let globalMax = -Infinity;
        datasetStats.forEach(ds => {
            ds.stats.byRange.amplitude.forEach(d => {
                if (d.Y_range_km !== undefined) {
                    if (d.Y_range_km < globalMin) globalMin = d.Y_range_km;
                    if (d.Y_range_km > globalMax) globalMax = d.Y_range_km;
                }
            });
            ds.stats.byRange.phase.forEach(d => {
                if (d.Y_range_km !== undefined) {
                    if (d.Y_range_km < globalMin) globalMin = d.Y_range_km;
                    if (d.Y_range_km > globalMax) globalMax = d.Y_range_km;
                }
            });
        });

        if (globalMin === Infinity) return [];

        const binCount = 20;
        const binWidth = (globalMax - globalMin) / binCount || 1; // Handle single point case?

        // Single point check
        if (globalMax - globalMin < 1e-6) {
            const row: Record<string, string | number> = { name: globalMin.toFixed(2) };
            datasetStats.forEach(ds => {
                // Avg of all
                let ampSum = 0, ampCount = 0;
                let phiSum = 0, phiCount = 0;
                ds.stats.byRange.amplitude.forEach(d => { if (d.RMS !== undefined) { ampSum += d.RMS; ampCount++ } });
                ds.stats.byRange.phase.forEach(d => { if (d.RMS !== undefined) { phiSum += d.RMS; phiCount++ } });
                row[`Amp_${ds.id}`] = ampCount > 0 ? ampSum / ampCount : 0;
                row[`Phi_${ds.id}`] = phiCount > 0 ? phiSum / phiCount : 0;
            });
            return [row];
        }

        // Initialize bins for result
        // We want array of { name: 'center', Amp_ID1: ..., Phi_ID1: ... }

        // Pre-calculate bin centers
        const rows = Array.from({ length: binCount }).map((_, i) => ({
            center: globalMin + (i + 0.5) * binWidth,
            name: (globalMin + (i + 0.5) * binWidth).toFixed(1),
            data: {} as Record<string, { sum: number, count: number }>
        }));

        // Accumulate
        datasetStats.forEach(ds => {
            // Init accumulators for this dataset in each bin
            rows.forEach(r => {
                r.data[`Amp_${ds.id}`] = { sum: 0, count: 0 };
                r.data[`Phi_${ds.id}`] = { sum: 0, count: 0 };
            });

            ds.stats.byRange.amplitude.forEach(d => {
                if (d.Y_range_km !== undefined && Number.isFinite(d.RMS)) {
                    let idx = Math.floor((d.Y_range_km - globalMin) / binWidth);
                    if (idx >= binCount) idx = binCount - 1;
                    if (idx < 0) idx = 0;
                    const key = `Amp_${ds.id}`;
                    rows[idx].data[key].sum += d.RMS;
                    rows[idx].data[key].count++;
                }
            });
            ds.stats.byRange.phase.forEach(d => {
                if (d.Y_range_km !== undefined && Number.isFinite(d.RMS)) {
                    let idx = Math.floor((d.Y_range_km - globalMin) / binWidth);
                    if (idx >= binCount) idx = binCount - 1;
                    if (idx < 0) idx = 0;
                    const key = `Phi_${ds.id}`;
                    rows[idx].data[key].sum += d.RMS;
                    rows[idx].data[key].count++;
                }
            });
        });

        // Flatten
        return rows.map(r => {
            const finalRow: Record<string, string | number> = { name: r.name };
            datasetStats.forEach(ds => {
                const ampAcc = r.data[`Amp_${ds.id}`];
                const phiAcc = r.data[`Phi_${ds.id}`];
                finalRow[`Amp_${ds.id}`] = ampAcc.count > 0 ? ampAcc.sum / ampAcc.count : 0;
                finalRow[`Phi_${ds.id}`] = phiAcc.count > 0 ? phiAcc.sum / phiAcc.count : 0;
            });
            return finalRow;
        });
    }, [datasetStats]);

    // Fetch misfit statistics from backend
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const fetchMisfitStats = async () => {
            // Check datasets
            const targets: { id: string; name: string; color: string; data: CsemData[] }[] = [];

            if (activeDatasetIds.length > 0) {
                // Use active datasets
                activeDatasetIds.forEach(id => {
                    const ds = datasets.get(id);
                    if (ds && ds.visible) {
                        targets.push({ id: ds.id, name: ds.name, color: ds.color, data: ds.data });
                    }
                });
            } else if (filteredData && filteredData.length > 0) {
                // Fallback to filteredData
                targets.push({ id: 'filtered', name: 'Analysis Data', color: '#3b82f6', data: filteredData });
            }

            if (targets.length === 0) {
                if (!signal.aborted) setDatasetStats([]);
                return;
            }

            if (!signal.aborted) {
                setLoading(true);
                setMissingResidual(false);
            }

            if (isDemoMode) {
                const validTargets = targets.filter(target =>
                    target.data.some((d: CsemData) =>
                        d.Residual !== undefined && isFinite(d.Residual)
                    )
                );

                if (!signal.aborted) {
                    if (validTargets.length === 0) {
                        setDatasetStats([]);
                        setMissingResidual(true);
                        setLoading(false);
                        return;
                    }

                    const demoStats = generateMisfitStatsMockData();
                    setDatasetStats(
                        validTargets.map(target => ({
                            id: target.id,
                            name: target.name,
                            color: target.color,
                            stats: demoStats,
                        }))
                    );
                    setLoading(false);
                }
                return;
            }

            const results: DatasetStat[] = [];

            try {
                // Fetch sequentially or parallel? Parallel is better.
                await Promise.all(targets.map(async (target) => {
                    if (signal.aborted) return;

                    const valid = target.data.some((d: CsemData) => d.Residual !== undefined && isFinite(d.Residual));
                    if (!valid) return;

                    try {
                        const response = await fetch("http://localhost:3354/api/misfit_stats", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ data: target.data }),
                            signal
                        });
                        if (!response.ok) return;
                        const stats: MisfitStatsData = await response.json();
                        if (!signal.aborted) {
                            results.push({ id: target.id, name: target.name, color: target.color, stats });
                        }
                    } catch (e: unknown) {
                        if (e instanceof Error && e.name !== 'AbortError') {
                            console.error(`Error fetching stats for ${target.name}`, e);
                        }
                    }
                }));

                if (!signal.aborted) {
                    setDatasetStats(results);
                    setLoading(false);

                    if (results.length === 0 && targets.length > 0) {
                        // If we had targets but no results, likely missing residuals
                        // Check if any target *invalid* because of missing residuals
                        const anyMissing = targets.some(t => !t.data.some((d: CsemData) => d.Residual !== undefined));
                        if (anyMissing) {
                            setMissingResidual(true);
                        }
                    }
                }
            } catch (e: unknown) {
                if (!signal.aborted && e instanceof Error && e.name !== 'AbortError') {
                    setLoading(false);
                }
            }
        };

        fetchMisfitStats();

        return () => {
            controller.abort();
        };
    }, [filteredData, activeDatasetIds, datasets]);

    // Initialize and update plots
    // Initialize and update plots (Scatter only, as others are Recharts)
    useEffect(() => {
        if (datasetStats.length === 0 || loading || missingResidual) return;

        // Destroy existing plots
        scatterPlotRef.current?.destroy();
        scatterPlotRef.current = null;

        const axisColor = isDarkMode ? "#666" : "#ccc";
        const gridColor = isDarkMode ? "#333" : "#eee";

        if (scatterRef.current) {
            const series: uPlot.Series[] = [{}];
            const data: uPlot.AlignedData = [null];

            datasetStats.forEach(ds => {
                // Amplitude Series
                series.push({
                    label: `${ds.name} Amp`,
                    stroke: ds.color,
                    fill: ds.color,
                    width: 0,
                    paths: uPlot.paths.points!(),
                    points: { show: true, size: 6, fill: ds.color },
                });

                // Phase Series (Dashed/Lighter)
                const phiColor = ds.color.startsWith('#') && ds.color.length === 7 ? ds.color + '80' : ds.color;
                series.push({
                    label: `${ds.name} Phi`,
                    stroke: phiColor,
                    fill: phiColor,
                    width: 0,
                    paths: uPlot.paths.points!(), // Square?
                    points: { show: true, size: 6, fill: phiColor },
                    dash: [4, 4],
                });

                // Prepare Data
                const xAmp: number[] = [];
                const yAmp: number[] = [];
                ds.stats.byRx.amplitude.forEach(d => {
                    if (d.Y_rx_km !== undefined) { xAmp.push(d.Y_rx_km); yAmp.push(d.RMS); }
                });

                const xPhi: number[] = [];
                const yPhi: number[] = [];
                ds.stats.byRx.phase.forEach(d => {
                    if (d.Y_rx_km !== undefined) { xPhi.push(d.Y_rx_km); yPhi.push(d.RMS); }
                });

                data.push([xAmp, yAmp]); // Amp Data
                data.push([xPhi, yPhi]); // Phi Data
            });

            const opts: uPlot.Options = {
                width: scatterRef.current.offsetWidth || 800,
                height: 300,
                mode: 2, // Scatter
                scales: {
                    x: { time: false, auto: true },
                    y: { auto: true, range: (_self: uPlot, min: number, max: number) => [0, max * 1.1] }
                },
                axes: [
                    {
                        stroke: axisColor,
                        grid: { stroke: gridColor, width: 1 },
                        label: "Receiver Y Position (km)",
                        labelSize: 14,
                    },
                    {
                        stroke: axisColor,
                        grid: { stroke: gridColor, width: 1 },
                        label: "RMS",
                        labelSize: 14,
                    }
                ],
                series: series,
                plugins: [wheelZoomPlugin({ factor: 0.75, drag: true, scroll: true })],
                legend: { show: true }
            };

            scatterPlotRef.current = new uPlot(opts, data, scatterRef.current);
        }

        return () => {
            scatterPlotRef.current?.destroy();
            scatterPlotRef.current = null;
        };
    }, [datasetStats, loading, missingResidual, isDarkMode]);

    // Handle window resize with debounce
    useEffect(() => {
        if (datasetStats.length === 0 || loading || missingResidual) return;

        const handleResize = () => {
            if (!scatterRef.current?.isConnected) return;

            try {
                if (scatterPlotRef.current && scatterRef.current) {
                    scatterPlotRef.current.setSize({
                        width: scatterRef.current.offsetWidth,
                        height: 300,  // Fixed height
                    });
                }
            } catch (e) {
                console.warn('[MisfitStats] Resize error:', e);
            }
        };

        // Debounce resize to avoid too many updates
        let timeoutId: NodeJS.Timeout;
        const debouncedResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(handleResize, 100);
        };

        const observer = new ResizeObserver(debouncedResize);
        if (scatterRef.current) observer.observe(scatterRef.current);

        return () => {
            clearTimeout(timeoutId);
            observer.disconnect();
        };
    }, [datasetStats, loading, missingResidual]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Calculating misfit statistics...</p>
                </div>
            </div>
        );
    }

    if (missingResidual) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="text-center max-w-md">
                    <Info className="mx-auto h-12 w-12 text-blue-500 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Residual Data Required</h3>
                    <p className="text-sm text-muted-foreground">
                        The currently loaded data does not include residual values, which are required
                        to calculate misfit statistics.
                    </p>
                    <div className="mt-4 text-left">
                        <div className="text-sm font-medium mb-2">To view misfit statistics:</div>
                        <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                            <li>Load a response file that includes both Residual and Response columns</li>
                            <li>Ensure your data comes from an inversion process</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    if (datasetStats.length === 0) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <p className="text-sm text-muted-foreground">No misfit statistics available</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full p-4">
            <div className="grid grid-rows-[1fr_1fr_1fr] gap-4 h-full">
                {/* Top: Scatter plot for RMS vs Rx Y Position */}
                <div className="border rounded-lg p-4">
                    <h3 className="text-sm font-semibold mb-2">RMS vs Receiver Y Position</h3>
                    <div ref={scatterRef} className="w-full h-[calc(100%-2rem)]" />
                </div>

                {/* Middle: Combined bar chart for RMS vs Tx Y Position */}
                <div className="border rounded-lg p-4">
                    <h3 className="text-sm font-semibold mb-2">RMS vs Transmitter Y Position</h3>
                    <SimpleBarChart data={rechartsTxData} xLabel="Tx Y Position (km)" yLabel="RMS" series={txSeries} />
                </div>

                {/* Bottom: Two bar charts side-by-side */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4">
                        <h3 className="text-sm font-semibold mb-2">RMS vs Tx-Rx Offset (20 Bins)</h3>
                        <SimpleBarChart data={rechartsRangeData} xLabel="Tx-Rx Offset (km)" yLabel="Avg RMS" series={rangeSeries} />
                    </div>
                    <div className="border rounded-lg p-4">
                        <h3 className="text-sm font-semibold mb-2">RMS vs Frequency</h3>
                        <SimpleBarChart data={d3FreqData} xLabel="Frequency ID" yLabel="RMS" series={freqSeries} />
                    </div>
                </div>
            </div>
        </div>
    );
};
