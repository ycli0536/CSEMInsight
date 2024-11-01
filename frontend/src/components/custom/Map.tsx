import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useDataTableStore } from '@/store/settingFormStore';
import { Label } from '@/components/ui/label';

const MapComponent = () => {
    const MapViewRef = useRef<HTMLDivElement>(null);
    const { geometryInfo, txData, rxData } = useDataTableStore();

    const [txLoc, setTxLoc] = useState<[number, number][]>([]);
    const [rxLoc, setRxLoc] = useState<[number, number][]>([]);
    const [txSite, setTxSite] = useState<string[]>([]);

    useEffect(() => {
        const newTxLoc: [number, number][] = txData.map((tx) => [tx.Lat_tx, tx.Lon_tx] as [number, number]);
        const newRxLoc: [number, number][] = rxData.map((rx) => [rx.Lat_rx, rx.Lon_rx] as [number, number]);
        const newTxSite = txData.map((tx) => tx.Name_tx);
        setRxLoc(newRxLoc);
        setTxLoc(newTxLoc);
        setTxSite(newTxSite);
    }, [txData, rxData]);

    const txPosition = useMemo(() => {
        const defaultPosition: [number, number] = [0, 0];
        return txLoc.length > 0 
            ? [txLoc[Math.floor(txLoc.length / 2)][0], txLoc[Math.floor(txLoc.length / 2)][1]] as [number, number]
            : defaultPosition;
    }, [txLoc]);

    return (
        <div className="grid gap-2">
            <Label className="flex items-center justify-center space-x-2">
                <span>UTM_zone: {geometryInfo.UTM_zone}</span>
                <span>Hemisphere: {geometryInfo.Hemisphere}</span>
                <span>North: {geometryInfo.North}</span>
                <span>East: {geometryInfo.East}</span>
                <span>Strike: {geometryInfo.Strike}</span>
            </Label>
            <div className="z-0" ref={MapViewRef}>
                <MapContainer center={txPosition} zoom={7} style={{ height: '600px', width: '100%' }}>
                    <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='&copy; <a href="https://www.esri.com/">Esri</a>, USGS, NOAA'
                    />
                    <MapUpdater position={txPosition} />
                    {rxLoc.length > 0 && rxLoc.map((loc, index) => (
                        <CircleMarker key={index} center={loc} radius={0.5} color="blue" fillOpacity={0.5}>
                            <Popup>
                                Rx Location: {loc[0].toFixed(2)}, {loc[1].toFixed(2)}
                            </Popup>
                        </CircleMarker>
                    ))}
                    {txLoc.length > 0 && txLoc.map((loc, index) => (
                        <CircleMarker key={index} center={loc} radius={2} color="red" fillColor="red" fillOpacity={1}>
                            <Popup>
                                Tx Site: {txSite[index]}, Tx Location: {loc[0].toFixed(2)}, {loc[1].toFixed(2)}
                            </Popup>
                        </CircleMarker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
};

const MapUpdater = ({ position }: { position: [number, number] }) => {
    const map = useMap();

    useEffect(() => {
        map.setView(position);
    }, [position, map]);

    return null;
};

export default MapComponent;