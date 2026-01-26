import { useEffect, useRef, useState, useMemo, Fragment } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Dataset, useDataTableStore } from '@/store/settingFormStore';
import { Label } from '@/components/ui/label';
import { getTxRxData } from '@/utils/extractTxRxPlotData';

// Map layer types
type MapLayerType = 'satellite' | 'bathymetry-ocean' | 'bathymetry-reference' | 'topographic' | 'osm-standard' | 'carto-dark';

const mapLayers = {
    satellite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, USGS, NOAA'
    },
    'bathymetry-ocean': {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, GEBCO, NOAA, National Geographic, DeLorme, HERE'
    },
    'bathymetry-reference': {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, GEBCO, NOAA, National Geographic, DeLorme, HERE'
    },
    'topographic': {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), (c) OpenStreetMap contributors, and the GIS User Community'
    },
    'osm-standard': {
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    'carto-dark': {
        url: "https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: ['a', 'b', 'c', 'd']
    }
};

const MapComponent = () => {
    const MapViewRef = useRef<HTMLDivElement>(null);
    const { geometryInfo, txData, rxData, datasets, activeDatasetIds, comparisonMode } = useDataTableStore();

    const [txLoc, setTxLoc] = useState<[number, number][]>([]);
    const [rxLoc, setRxLoc] = useState<[number, number][]>([]);
    const [txSite, setTxSite] = useState<string[]>([]);
    const [currentLayer, setCurrentLayer] = useState<MapLayerType>('satellite');

    const activeDatasets = useMemo(() => {
        return activeDatasetIds
            .map((id) => datasets.get(id))
            .filter((dataset): dataset is Dataset => Boolean(dataset && dataset.visible));
    }, [activeDatasetIds, datasets]);

    const useOverlay = comparisonMode === 'overlay' && activeDatasets.length > 0;

    const overlayMarkers = useMemo(() => {
        if (!useOverlay) {
            return [];
        }
        return activeDatasets.map((dataset) => {
            const { TxData, RxData } = dataset.txData.length && dataset.rxData.length
                ? { TxData: dataset.txData, RxData: dataset.rxData }
                : getTxRxData(dataset.data);

            return {
                dataset,
                txLoc: TxData.map((tx) => [tx.Lat_tx, tx.Lon_tx] as [number, number]),
                rxLoc: RxData.map((rx) => [rx.Lat_rx, rx.Lon_rx] as [number, number]),
                txSite: TxData.map((tx) => tx.Name_tx),
            };
        });
    }, [activeDatasets, useOverlay]);

    useEffect(() => {
        if (useOverlay) {
            return;
        }
        const newTxLoc: [number, number][] = txData.map((tx) => [tx.Lat_tx, tx.Lon_tx] as [number, number]);
        const newRxLoc: [number, number][] = rxData.map((rx) => [rx.Lat_rx, rx.Lon_rx] as [number, number]);
        const newTxSite = txData.map((tx) => tx.Name_tx);
        setRxLoc(newRxLoc);
        setTxLoc(newTxLoc);
        setTxSite(newTxSite);
    }, [txData, rxData, useOverlay]);

    const txPosition = useMemo(() => {
        const defaultPosition: [number, number] = [0, 0];
        if (useOverlay) {
            const first = overlayMarkers[0]?.txLoc ?? [];
            return first.length > 0
                ? [first[Math.floor(first.length / 2)][0], first[Math.floor(first.length / 2)][1]] as [number, number]
                : defaultPosition;
        }
        return txLoc.length > 0 
            ? [txLoc[Math.floor(txLoc.length / 2)][0], txLoc[Math.floor(txLoc.length / 2)][1]] as [number, number]
            : defaultPosition;
    }, [txLoc, useOverlay, overlayMarkers]);

    return (
        <div className="grid gap-2">
            <Label className="flex items-center justify-center space-x-2">
                <span>UTM_zone: {geometryInfo.UTM_zone}</span>
                <span>Hemisphere: {geometryInfo.Hemisphere}</span>
                <span>North: {geometryInfo.North}</span>
                <span>East: {geometryInfo.East}</span>
                <span>Strike: {geometryInfo.Strike}</span>
            </Label>
            
            {/* Layer selector */}
            <div className="flex justify-center space-x-2 mb-2">
                <select 
                    value={currentLayer} 
                    onChange={(e) => setCurrentLayer(e.target.value as MapLayerType)}
                    className="px-3 py-1 border rounded"
                >
                    <option value="satellite">Satellite</option>
                    <option value="bathymetry-ocean">Ocean Bathymetry</option>
                    <option value="bathymetry-reference">Ocean Reference</option>
                    <option value="topographic">Topographic</option>
                    <option value="osm-standard">OpenStreetMap</option>
                    <option value="carto-dark">Dark Theme</option>
                </select>
            </div>

            <div className="z-0" ref={MapViewRef}>
                <MapContainer center={txPosition} zoom={7} style={{ height: '600px', width: '100%' }}>
                    <TileLayer
                        url={mapLayers[currentLayer].url}
                        attribution={mapLayers[currentLayer].attribution}
                    />
                    <MapUpdater position={txPosition} />
                    {useOverlay ? (
                        overlayMarkers.map((group) => (
                            <Fragment key={group.dataset.id}>
                                {group.rxLoc.map((loc, index) => (
                                    <CircleMarker
                                        key={`${group.dataset.id}-rx-${index}`}
                                        center={loc}
                                        radius={0.5}
                                        color={group.dataset.color}
                                        fillOpacity={0.5}
                                    >
                                        <Popup>
                                            {group.dataset.name} Rx Location: {loc[0].toFixed(2)}, {loc[1].toFixed(2)}
                                        </Popup>
                                    </CircleMarker>
                                ))}
                                {group.txLoc.map((loc, index) => (
                                    <CircleMarker
                                        key={`${group.dataset.id}-tx-${index}`}
                                        center={loc}
                                        radius={2}
                                        color={group.dataset.color}
                                        fillColor={group.dataset.color}
                                        fillOpacity={1}
                                    >
                                        <Popup>
                                            {group.dataset.name} Tx Site: {group.txSite[index]}, Tx Location: {loc[0].toFixed(2)}, {loc[1].toFixed(2)}
                                        </Popup>
                                    </CircleMarker>
                                ))}
                            </Fragment>
                        ))
                    ) : (
                        <>
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
                        </>
                    )}
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