import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Dataset, RxData, TxData } from "@/types";
import { useBathymetryStore, useDataTableStore } from "@/store/settingFormStore";
import { wheelZoomPlugin } from '@/components/custom/uplot-wheel-zoom-plugin';
import { getTxRxData } from "@/services/extractTxRxPlotData";
import { useTheme } from "@/hooks/useTheme";
import { getTxRxColors, getChartColors, dataVizPalette } from "@/lib/colorPalette";
import { orderIdsByPrimaryLast } from '@/lib/datasetOrdering';

declare module "uplot" {
    interface Series {
        _hide?: boolean;
    }
}

export function TxRxPosPlot() {
    const XYChartRef = useRef<HTMLDivElement>(null);
    const { data, txData, rxData, originalTxData, isTxDepthAdjusted, datasets, activeDatasetIds, comparisonMode, primaryDatasetId } = useDataTableStore();
    const { setTxData, setRxData, setOriginalTxData } = useDataTableStore();
    const { bathymetryData } = useBathymetryStore();
    const { theme, systemTheme } = useTheme();
    const resolvedTheme = theme === 'system' ? systemTheme : theme;
    const isDark = resolvedTheme === 'dark';

    // CVD-friendly color palette
    const txRxColors = getTxRxColors(isDark);
    const chartColors = getChartColors(isDark);
    const axisStroke = chartColors.axis;
    const gridStroke = chartColors.grid;

    const orderedDatasetIds = useMemo(
        () => orderIdsByPrimaryLast(activeDatasetIds, primaryDatasetId),
        [activeDatasetIds, primaryDatasetId],
    );

    const activeDatasets = useMemo(() => {
        return orderedDatasetIds
            .map((id) => datasets.get(id))
            .filter((dataset): dataset is Dataset => Boolean(dataset && dataset.visible));
    }, [orderedDatasetIds, datasets]);

    // Data Synchronization Effect
    useEffect(() => {
        if (data.length > 0) {
            const { TxData: freshTxData, RxData: freshRxData } = getTxRxData(data);

            if (!isTxDepthAdjusted) {
                setTxData(freshTxData);
                // console.log('Updated TxData with fresh data:', freshTxData);
            }

            setRxData(freshRxData);

            if (originalTxData.length === 0 && freshTxData.length > 0) {
                // console.log('Storing original Tx data from CSEM file:', freshTxData);
                setOriginalTxData([...freshTxData]);
            }
        }
    }, [data, isTxDepthAdjusted, setTxData, setRxData, setOriginalTxData, originalTxData.length]);

    useEffect(() => {
        const useOverlay = comparisonMode === 'overlay' && activeDatasets.length > 0;
        const useDefaultColors = activeDatasets.length === 1;
        if (!XYChartRef.current) {
            return;
        }

        if (useOverlay) {
            const xySeriesData: Float64Array[][] = [];
            const yzSeriesData: Float64Array[][] = [];
            const xySeries: uPlot.Series[] = [{ label: "Inline distance (m)" }];
            const yzSeries: uPlot.Series[] = [{ label: "Inline distance (m)" }];

            activeDatasets.forEach((dataset) => {
                const { TxData, RxData } = dataset.txData.length && dataset.rxData.length
                    ? { TxData: dataset.txData, RxData: dataset.rxData }
                    : getTxRxData(dataset.data);
                const txColor = useDefaultColors ? txRxColors.tx : dataset.color;
                const rxColor = useDefaultColors ? txRxColors.rx : dataset.color;
                const isPrimary = dataset.id === primaryDatasetId;

                if (TxData.length > 0) {
                    xySeriesData.push([
                        new Float64Array(TxData.map((item) => item.Y_tx)),
                        new Float64Array(TxData.map((item) => item.X_tx)),
                    ]);
                    xySeries.push({
                        label: isPrimary && isTxDepthAdjusted ? `${dataset.name} Tx (adjusted)` : `${dataset.name} Tx`,
                        stroke: txColor,
                        paths: () => null,
                        points: { show: true, size: 8, width: 2, space: 0 },
                    });

                    yzSeriesData.push([
                        new Float64Array(TxData.map((item) => item.Y_tx)),
                        new Float64Array(TxData.map((item) => item.Z_tx)),
                    ]);
                    yzSeries.push({
                        label: isPrimary && isTxDepthAdjusted ? `${dataset.name} Tx (adjusted)` : `${dataset.name} Tx`,
                        stroke: txColor,
                        paths: () => null,
                        points: { show: true, size: 8, width: 2, space: 0 },
                    });
                }

                if (isPrimary && isTxDepthAdjusted && originalTxData.length > 0) {
                    yzSeriesData.push([
                        new Float64Array(originalTxData.map((item) => item.Y_tx)),
                        new Float64Array(originalTxData.map((item) => item.Z_tx)),
                    ]);
                    yzSeries.push({
                        label: `${dataset.name} Tx (original)`,
                        stroke: txRxColors.txOriginal,
                        paths: () => null,
                        points: { show: true, size: 6, width: 1, space: 0 },
                    });
                }

                if (RxData.length > 0) {
                    xySeriesData.push([
                        new Float64Array(RxData.map((item) => item.Y_rx)),
                        new Float64Array(RxData.map((item) => item.X_rx)),
                    ]);
                    xySeries.push({
                        label: `${dataset.name} Rx`,
                        stroke: rxColor,
                        points: { show: true, size: 4, space: 0 },
                    });

                    yzSeriesData.push([
                        new Float64Array(RxData.map((item) => item.Y_rx)),
                        new Float64Array(RxData.map((item) => item.Z_rx)),
                    ]);
                    yzSeries.push({
                        label: `${dataset.name} Rx`,
                        stroke: rxColor,
                        points: { show: true, size: 4, space: 0 },
                    });
                }
            });

            if (bathymetryData) {
                yzSeriesData.push([
                    new Float64Array(bathymetryData.inline_distance),
                    new Float64Array(bathymetryData.depth),
                ]);
                yzSeries.push({
                    label: "Bathymetry",
                    stroke: isDark ? dataVizPalette.bathymetry.dark : dataVizPalette.bathymetry.light,
                    width: 2,
                    points: { show: false },
                });
            }

            const options_xy: uPlot.Options = {
                mode: 1,
                width: 900,
                height: 300,
                title: 'Tx and Rx positions',
                series: xySeries,
                scales: {
                    x: { time: false },
                    y: { time: false },
                },
                cursor: {
                    show: true,
                    drag: { x: true, y: true, uni: 1, dist: 30 },
                    sync: {
                        key: 'txrx',
                        scales: ["x", null],
                    },
                },
                plugins: [
                    wheelZoomPlugin({
                        factor: 0.9,
                        drag: true,
                        scroll: true,
                    }),
                ],
                axes: [
                    {
                        labelFont: 'bold 20px Helvetica',
                        stroke: axisStroke,
                        grid: { stroke: gridStroke, show: true, dash: [2, 2] },
                        ticks: { stroke: axisStroke, show: true, dash: [] },
                    },
                    {
                        label: 'Crossline (X) distance (m)',
                        labelFont: 'bold 20px Helvetica',
                        stroke: axisStroke,
                        grid: { stroke: gridStroke, show: true, dash: [2, 2] },
                        ticks: { stroke: axisStroke, show: true, dash: [], size: 10 },
                    },
                ],
                legend: {
                    show: true,
                },
            };

            const options_yz: uPlot.Options = {
                mode: 1,
                width: 900,
                height: 400,
                title: 'Depth profile',
                series: yzSeries,
                scales: {
                    x: { time: false },
                    y: { time: false, dir: -1 },
                },
                cursor: {
                    show: true,
                    drag: { x: true, y: true, uni: 1, dist: 30 },
                    sync: {
                        key: 'txrx',
                        scales: ["x", null],
                    },
                },
                plugins: [
                    wheelZoomPlugin({
                        factor: 0.9,
                        drag: true,
                        scroll: true,
                    }),
                ],
                axes: [
                    {
                        label: 'Inline (Y) distance (m)',
                        labelFont: 'bold 20px Helvetica',
                        stroke: axisStroke,
                        size: 40,
                        grid: { stroke: gridStroke, show: true, dash: [2, 2] },
                        ticks: { stroke: axisStroke, show: true, dash: [] },
                    },
                    {
                        label: 'Depth (m)',
                        labelFont: 'bold 20px Helvetica',
                        stroke: axisStroke,
                        grid: { stroke: gridStroke, show: true, dash: [2, 2] },
                        ticks: { stroke: axisStroke, show: true, dash: [], size: 10 },
                    },
                ],
                legend: {
                    show: true,
                },
            };

            const plotTxRx2Instance = new uPlot(options_yz, uPlot.join(yzSeriesData), XYChartRef.current!);
            const plotTxRx1Instance = new uPlot(options_xy, uPlot.join(xySeriesData), XYChartRef.current!);

            return () => {
                plotTxRx1Instance.destroy();
                plotTxRx2Instance.destroy();
            };
        }

        if (data.length > 0) {

            const prepareTxRxPlotData = (TxDataInput: TxData[], RxData: RxData[]): [uPlot.AlignedData, { [key: string]: number }] => {

                // Convert the data to uPlot format
                const uplotTxData = [
                    TxDataInput.map(d => d.Y_tx),      // x-series: Y_tx
                    TxDataInput.map(d => d.X_tx),      // y-series: X_tx
                    TxDataInput.map(d => d.Z_tx),      // y-series: Z_tx
                    TxDataInput.map(d => d.Tx_id),     // y-series: Tx_id
                    TxDataInput.map(d => d.Azimuth),   // y-series: Azimuth
                    TxDataInput.map(d => d.Dip),       // y-series: Dip
                    TxDataInput.map(d => d.Length_tx), // y-series: Length_tx (optional)
                    TxDataInput.map(d => d.Type_tx),   // y-series: Type_tx (optional)
                    TxDataInput.map(d => d.Name_tx)    // y-series: Name_tx (optional)
                ];


                // Create a mapping of names to indices
                const txNameToIndexMap = {
                    'Y_tx': 0,
                    'X_tx': 1,
                    'Z_tx': 2,
                    'Tx_id': 3,
                    'Azimuth': 4,
                    'Dip': 5,
                    'Length_tx': 6,
                    'Type_tx': 7,
                    'Name_tx': 8,
                };

                // Convert the data to uPlot format
                const uplotRxData = [
                    RxData.map(d => d.Y_rx),      // x-series: Y_rx
                    RxData.map(d => d.X_rx),      // y-series: X_rx
                    RxData.map(d => d.Z_rx),      // y-series: Z_rx
                    RxData.map(d => d.Rx_id),     // y-series: Rx_id
                    RxData.map(d => d.Theta),     // y-series: Theta
                    RxData.map(d => d.Alpha),     // y-series: Alpha
                    RxData.map(d => d.Beta),      // y-series: Beta
                    RxData.map(d => d.Length_rx), // y-series: Length_rx (optional)
                    RxData.map(d => d.Name_rx)    // y-series: Name_rx (optional)
                ];

                // Create a mapping of names to indices
                const rxNameToIndexMap = ({
                    'Y_rx': 0,
                    'X_rx': uplotTxData.length + 0,
                    'Z_rx': uplotTxData.length + 1,
                    'Rx_id': uplotTxData.length + 2,
                    'Theta': uplotTxData.length + 3,
                    'Alpha': uplotTxData.length + 4,
                    'Beta': uplotTxData.length + 5,
                    'Length_rx': uplotTxData.length + 6,
                    'Name_rx': uplotTxData.length + 7,
                });

                // Combine Tx and Rx indices
                const nameToIndexMap = { ...rxNameToIndexMap, ...txNameToIndexMap };

                // Merge Tx and Rx data
                const uplotTxRxData = uPlot.join([uplotTxData, uplotRxData] as uPlot.AlignedData[]);

                return [uplotTxRxData, nameToIndexMap];
            }

            const [uplotTxRxData, nameToIndexMap] = prepareTxRxPlotData(txData, rxData);

            console.log('nameToIndexMap["Y_tx"]:', nameToIndexMap['Y_tx']);

            // Select xy plan view series
            const uplotTxRxData_xy: uPlot.AlignedData = [
                uplotTxRxData[nameToIndexMap['Y_tx']], // Keep the x-axis (Y distance)
                uplotTxRxData[nameToIndexMap['X_tx']],
                uplotTxRxData[nameToIndexMap['X_rx']],
                uplotTxRxData[nameToIndexMap['Name_tx']],
                uplotTxRxData[nameToIndexMap['Theta']],
                uplotTxRxData[nameToIndexMap['Length_tx']],
            ];

            // Prepare Tx/Rx data - start with basic data
            const txRxData_yz: uPlot.AlignedData = [
                uplotTxRxData[nameToIndexMap['Y_tx']], // x-axis (Y distance)
                uplotTxRxData[nameToIndexMap['Z_tx']],  // Tx depths
                uplotTxRxData[nameToIndexMap['Z_rx']],  // Rx depths
                uplotTxRxData[nameToIndexMap['Dip']],
                uplotTxRxData[nameToIndexMap['Name_tx']],
            ];

            // Prepare bathymetry data if available and join with Tx/Rx data
            let uplotTxRxData_yz: uPlot.AlignedData;
            if (bathymetryData) {
                // Create bathymetry dataset
                const bathyData: uPlot.AlignedData = [
                    new Float64Array(bathymetryData.inline_distance), // x-axis for bathymetry
                    new Float64Array(bathymetryData.depth),           // bathymetry depths
                ];

                // Join the Tx/Rx data with bathymetry data using uPlot.join
                uplotTxRxData_yz = uPlot.join([txRxData_yz, bathyData]);

                // If Tx depths have been adjusted, add original Tx positions after bathymetry join
                if (isTxDepthAdjusted && originalTxData.length > 0) {
                    const originalTxY = originalTxData.map(tx => tx.Y_tx);
                    const originalTxDepths = originalTxData.map(tx => tx.Z_tx);

                    // Create original Tx dataset
                    const originalTxData_yz: uPlot.AlignedData = [
                        originalTxY,     // x-axis for original Tx
                        originalTxDepths // depths for original Tx
                    ];

                    // Join with original Tx data
                    uplotTxRxData_yz = uPlot.join([uplotTxRxData_yz, originalTxData_yz]);
                }

                console.log('After uPlot.join():');
                console.log('- Original Tx/Rx data length:', txRxData_yz[0].length);
                console.log('- Final joined data length:', uplotTxRxData_yz[0].length);
                console.log('- Number of series after join:', uplotTxRxData_yz.length);
            } else {
                uplotTxRxData_yz = txRxData_yz;
            }

            // uPlot options
            const series_xy: uPlot.Series[] = [
                { label: "Inline distance (m)" },
                {
                    label: "Tx crossline distance (m)",
                    stroke: txRxColors.tx,
                    paths: () => null,
                    points: {
                        show: true,
                        size: 10,
                        width: 2,
                        space: 0,
                    },
                },
                {
                    label: "Rx crossline distance (m)",
                    stroke: txRxColors.rx,
                    points: {
                        show: true,
                        space: 0,
                    },
                },
                {
                    label: "Tx Site",
                    show: false, // Do not plot this series
                    value: (_self, _rawValue, _seriesIdx, idx) => `${uplotTxRxData[nameToIndexMap['Name_tx']][idx]}` // Display string in legend
                },
                {
                    label: "Rx Theta",
                    show: false,
                },
                {
                    label: "Tx Length (m)",
                    show: false,
                    _hide: true,
                },
            ];

            // Create series configuration - only 3 valid cases since Tx adjustment requires bathymetry
            let series_yz: uPlot.Series[];
            const hasAdjustedTx = isTxDepthAdjusted && originalTxData.length > 0 && bathymetryData;

            if (bathymetryData) {
                if (hasAdjustedTx) {
                    // Case: Bathymetry + Adjusted Tx
                    // Data structure after joins: [0] merged x-axis, [1] Z_tx_adjusted, [2] Z_rx, [3] Dip, [4] Name, [5] Bathymetry, [6] Z_tx_original
                    series_yz = [
                        { label: "Y (inline) distance (m)" }, // x-axis
                        {
                            label: "Tx depth (adjusted)",
                            stroke: txRxColors.tx,
                            paths: () => null,
                            points: {
                                show: true,
                                size: 10,
                                width: 2,
                                space: 0,
                            },
                        },
                        {
                            label: "Rx depth (m)",
                            stroke: txRxColors.rx,
                            points: {
                                show: true,
                                space: 0,
                            },
                        },
                        {
                            label: "Dip",
                            show: false,
                        },
                        {
                            label: "Rx Site",
                            show: false,
                            _hide: true,
                        },
                        {
                            label: "Bathymetry",
                            stroke: isDark ? dataVizPalette.bathymetry.dark : dataVizPalette.bathymetry.light,
                            width: 2,
                            points: {
                                show: false,
                            },
                        },
                        {
                            label: "Tx depth (original)",
                            stroke: txRxColors.txOriginal,
                            paths: () => null,
                            points: {
                                show: true,
                                size: 8,
                                width: 1,
                                space: 0,
                            },
                        },
                    ];
                } else {
                    // Case: Bathymetry Only
                    // Data structure: [0] merged x-axis, [1] Z_tx, [2] Z_rx, [3] Dip, [4] Name, [5] Bathymetry
                    series_yz = [
                        { label: "Y (inline) distance (m)" }, // x-axis
                        {
                            label: "Tx depth (m)",
                            stroke: txRxColors.tx,
                            paths: () => null,
                            points: {
                                show: true,
                                size: 10,
                                width: 2,
                                space: 0,
                            },
                        },
                        {
                            label: "Rx depth (m)",
                            stroke: txRxColors.rx,
                            points: {
                                show: true,
                                space: 0,
                            },
                        },
                        {
                            label: "Dip",
                            show: false,
                        },
                        {
                            label: "Rx Site",
                            show: false,
                            _hide: true,
                        },
                        {
                            label: "Bathymetry",
                            stroke: isDark ? dataVizPalette.bathymetry.dark : dataVizPalette.bathymetry.light,
                            width: 2,
                            points: {
                                show: false,
                            },
                        },
                    ];
                }
            } else {
                // Case: Standard (No bathymetry, no adjustment possible)
                // Data structure: [0] Y_tx, [1] Z_tx, [2] Z_rx, [3] Dip, [4] Name
                series_yz = [
                    { label: "Y (inline) distance (m)" },
                    {
                        label: "Tx depth (m)",
                        stroke: txRxColors.tx,
                        paths: () => null,
                        points: {
                            show: true,
                            size: 10,
                            width: 2,
                            space: 0,
                        },
                    },
                    {
                        label: "Rx depth (m)",
                        stroke: txRxColors.rx,
                        points: {
                            show: true,
                            space: 0,
                        },
                    },
                    {
                        label: "Dip",
                        show: false,
                    },
                    {
                        label: "Rx Site",
                        show: false,
                        _hide: true,
                    },
                ];
            }
            const options_xy: uPlot.Options = {
                mode: 1,
                width: 900,
                height: 300,
                title: 'Tx and Rx positions (MARE2DEM coordinate system)',
                series: series_xy,
                scales: {
                    x: {
                        time: false
                    },
                    y: {
                        time: false
                    }
                },
                cursor: {
                    show: true,
                    drag: { x: true, y: true, uni: 1, dist: 30 },
                    sync: {
                        key: 'txrx',
                        scales: ["x", null],
                    },
                },
                plugins: [
                    wheelZoomPlugin({
                        factor: 0.9,
                        drag: true,
                        scroll: true,
                    }),
                ],
                axes: [
                    {
                        labelFont: 'bold 20px Helvetica',
                        stroke: axisStroke,
                        // size: 10,
                        grid: { stroke: gridStroke, show: true, dash: [2, 2] },
                        ticks: { stroke: axisStroke, show: true, dash: [] }
                    },

                    {
                        label: 'Crossline (X) distance (m)',
                        labelFont: 'bold 20px Helvetica',
                        // font: "14px Arial",
                        stroke: axisStroke,
                        grid: { stroke: gridStroke, show: true, dash: [2, 2] },
                        ticks: { stroke: axisStroke, show: true, dash: [], size: 10 }
                    }
                ],
                hooks: {
                    init: [
                        u => {
                            [...u.root.querySelectorAll('.u-legend .u-series')].forEach((el, i) => {
                                if (u.series[i]._hide) {
                                    (el as HTMLElement).style.display = 'none';
                                }
                            });
                        }
                    ]
                }
            };

            const options_yz: uPlot.Options = {
                mode: 1,
                width: 900,
                height: 400,
                series: series_yz,
                scales: {
                    x: {
                        time: false,
                    },
                    y: {
                        time: false,
                        dir: -1,
                    }
                },
                cursor: {
                    show: true,
                    drag: { x: true, y: true, uni: 1, dist: 30 },
                    sync: {
                        key: 'txrx',
                        scales: ["x", null],
                    },
                },
                plugins: [
                    wheelZoomPlugin({
                        factor: 0.9,
                        drag: true,
                        scroll: true,
                    }),
                ],
                axes: [
                    {
                        label: 'Inline (Y) distance (m)',
                        labelFont: 'bold 20px Helvetica',
                        stroke: axisStroke,
                        size: 40,
                        grid: { stroke: gridStroke, show: true, dash: [2, 2] },
                        ticks: { stroke: axisStroke, show: true, dash: [] }
                    },

                    {
                        label: 'Depth (m)',
                        labelFont: 'bold 20px Helvetica',
                        // font: "14px Arial",
                        stroke: axisStroke,
                        grid: { stroke: gridStroke, show: true, dash: [2, 2] },
                        ticks: { stroke: axisStroke, show: true, dash: [], size: 10 }
                    }
                ],
                legend: {
                    show: true,
                }
            };


            // Initialize uPlot with ref
            const plotTxRx1Instance = new uPlot(options_xy, uplotTxRxData_xy, XYChartRef.current!)
            const plotTxRx2Instance = new uPlot(options_yz, uplotTxRxData_yz, XYChartRef.current!)

            // Cleanup function to destroy plot instances on unmount
            return () => {
                plotTxRx1Instance.destroy();
                plotTxRx2Instance.destroy();
            };
        }
    }, [
        data,
        txData,
        rxData,
        bathymetryData,
        isTxDepthAdjusted,
        originalTxData,
        activeDatasets,
        comparisonMode,
        isDark,
        axisStroke,
        gridStroke,
        txRxColors,
    ]);

    return (
        <div ref={XYChartRef} className="overflow-auto"></div>
    );
}
