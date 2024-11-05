import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useDataTableStore, TxData, RxData } from '@/store/settingFormStore';
import { wheelZoomPlugin } from '@/components/custom/uplot-wheel-zoom-plugin';
import { getTxRxData } from '@/utils/extractTxRxPlotData';

declare module "uplot" {
    interface Series {
      _hide?: boolean;
    }
  }

export function TxRxPosPlot() {
    const XYChartRef = useRef<HTMLDivElement>(null);
    const { data } = useDataTableStore();
    const { setTxData, setRxData } = useDataTableStore();

    useEffect(() => {
        if (XYChartRef.current && data.length > 0) {

            const {TxData, RxData} = getTxRxData(data);
            setTxData(TxData);
            setRxData(RxData);
            
            const prepareTxRxPlotData = (TxData: TxData[], RxData: RxData[]): [uPlot.AlignedData, { [key: string]: number }] => {
                
                // Convert the data to uPlot format
                const uplotTxData = [
                    TxData.map(d => d.Y_tx),      // x-series: Y_tx
                    TxData.map(d => d.X_tx),      // y-series: X_tx
                    TxData.map(d => d.Z_tx),      // y-series: Z_tx
                    TxData.map(d => d.Tx_id),     // y-series: Tx_id
                    TxData.map(d => d.Azimuth),   // y-series: Azimuth
                    TxData.map(d => d.Dip),       // y-series: Dip
                    TxData.map(d => d.Length_tx), // y-series: Length_tx (optional)
                    TxData.map(d => d.Type_tx),   // y-series: Type_tx (optional)
                    TxData.map(d => d.Name_tx)    // y-series: Name_tx (optional)
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

            const [uplotTxRxData, nameToIndexMap] = prepareTxRxPlotData(TxData, RxData);

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

            const uplotTxRxData_yz: uPlot.AlignedData = [
                uplotTxRxData[nameToIndexMap['Y_tx']], // Keep the x-axis (Y distance)
                uplotTxRxData[nameToIndexMap['Z_tx']],
                uplotTxRxData[nameToIndexMap['Z_rx']],
                uplotTxRxData[nameToIndexMap['Dip']],
                uplotTxRxData[nameToIndexMap['Name_tx']],
            ];

            // uPlot options
            const series_xy: uPlot.Series[] = [
                { label: "Inline distance (m)" },
                { 
                    label: "Tx crossline distance (m)",
                    stroke: "red",
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
                    stroke: "blue",
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

            const series_yz: uPlot.Series[] = [
                { label: "Y (inline) distance (m)" },
                { 
                    label: "Tx depth (m)",
                    stroke: "red",
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
                    stroke: "blue",
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
                    stroke: 'black',
                    // size: 10,
                    grid: {stroke: 'black', show: true, dash: [2, 2]},
                    ticks: {stroke: 'black', show: true, dash: []}
                },
                
                {
                    label: 'Crossline (X) distance (m)',
                    labelFont: 'bold 20px Helvetica',
                    // font: "14px Arial",
                    stroke: 'black',
                    grid: {stroke: 'black', show: true, dash: [2, 2]},
                    ticks: {stroke: 'black', show: true, dash: [], size: 10}
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
                    stroke: 'black',
                    size: 40,
                    grid: {stroke: 'black', show: true, dash: [2, 2]},
                    ticks: {stroke: 'black', show: true, dash: []}
                },
                
                {
                    label: 'Depth (m)',
                    labelFont: 'bold 20px Helvetica',
                    // font: "14px Arial",
                    stroke: 'black',
                    grid: {stroke: 'black', show: true, dash: [2, 2]},
                    ticks: {stroke: 'black', show: true, dash: [], size: 10}
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
    }, [data, setRxData, setTxData]);

    return (
        <div ref={XYChartRef} className="overflow-auto"></div>
    );
}