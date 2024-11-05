import { CsemData, TxData, RxData } from '@/store/settingFormStore';

export function extractTxPlotData(inputData: CsemData[], columns: string[]) {
    // Get unique Tx_id values but keep its original index and specified columns
    const getTx = (data: CsemData[], columns: string[]) => {
        const uniqueTxIds = new Map<number, { index: number, [key: string]: unknown }>();

        data.forEach((item, index) => {
            if (!uniqueTxIds.has(item.Tx_id)) {
                const additionalData = columns.reduce((acc, col) => {
                    acc[col] = item[col as keyof CsemData];
                    return acc;
                }, {} as { [key: string]: unknown });

                uniqueTxIds.set(item.Tx_id, { index, Tx_id: item.Tx_id, ...additionalData });
            }
        });

        console.log('uniqueTxIds:', uniqueTxIds);

        // Convert the Map to an array of objects if needed
        return Array.from(uniqueTxIds.values());
    };

    const TxData = getTx(inputData, columns);

    return TxData;
}

export function extractRxPlotData(inputData: CsemData[], columns: string[]) {
    // Get unique Rx_id values but keep its original index and specified columns
    const getRx = (data: CsemData[], columns: string[]) => {
        const uniqueRxIds = new Map<number, { index: number, [key: string]: unknown }>();

        data.forEach((item, index) => {
            if (!uniqueRxIds.has(item.Rx_id)) {
                const additionalData = columns.reduce((acc, col) => {
                    acc[col] = item[col as keyof CsemData];
                    return acc;
                }, {} as { [key: string]: unknown });

                uniqueRxIds.set(item.Rx_id, { index, Rx_id: item.Rx_id, ...additionalData });
            }
        });

        console.log('uniqueRxIds:', uniqueRxIds);

        // Convert the Map to an array of objects if needed
        return Array.from(uniqueRxIds.values());
    };

    const RxData = getRx(inputData, columns);

    return RxData;
}

export function getTxRxData(inputData: CsemData[]) {
    const extractedTxData = extractTxPlotData(inputData, ['X_tx', 'Y_tx', 'Z_tx', 'Lat_tx', 'Lon_tx',
        'Azimuth', 'Dip', 'Length_tx', 'Type_tx', 'Name_tx']);
    
    const TxData = extractedTxData.map(d => ({
        Tx_id: d.Tx_id as number,
        X_tx: d.X_tx as number,
        Y_tx: d.Y_tx as number,
        Z_tx: d.Z_tx as number,
        Lat_tx: d.Lat_tx as number,
        Lon_tx: d.Lon_tx as number,
        Azimuth: d.Azimuth as number,
        Dip: d.Dip as number,
        Length_tx: d.Length_tx as number,
        Type_tx: d.Type_tx as string,
        Name_tx: d.Name_tx as string,
        })) as TxData[]

    const extractedRxData = extractRxPlotData(inputData, ['X_rx', 'Y_rx', 'Z_rx', 'Lat_rx', 'Lon_rx',
        'Theta', 'Alpha', 'Beta', 'Length_rx', 'Name_rx']);

    const RxData = extractedRxData.map(d => ({
        Rx_id: d.Rx_id as number,
        X_rx: d.X_rx as number,
        Y_rx: d.Y_rx as number,
        Z_rx: d.Z_rx as number,
        Lat_rx: d.Lat_rx as number,
        Lon_rx: d.Lon_rx as number,
        Theta: d.Theta as number,
        Alpha: d.Alpha as number,
        Beta: d.Beta as number,
        Length_rx: d.Length_rx as number,
        Name_rx: d.Name_rx as string,
        })) as RxData[]

    return { TxData, RxData };
}