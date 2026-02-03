export function getPlotLabelParts(
    xAxisColumn: string,
    yAxisColumn: string,
    splitByColumn: string,
) {
    const xKey = xAxisColumn || 'Lon_tx';
    const yKey = yAxisColumn || 'Lat_rx';
    const splitLabel = splitByColumn ? splitByColumn : 'Freq';

    return {
        xLabel: xKey,
        yLabel: yKey,
        splitLabel,
    };
}
