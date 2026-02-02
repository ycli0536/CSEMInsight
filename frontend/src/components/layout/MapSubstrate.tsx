import React, { Fragment, useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, AttributionControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { getTxRxData } from "@/services/extractTxRxPlotData";
import { mapLayers } from "@/lib/mapLayers";
import type { Dataset } from "@/types";
import { useDataTableStore, useSettingFormStore } from "@/store/settingFormStore";
import { MapLayerControl } from "../custom/MapLayerControl";
import { SurveyGeometryInfo } from "../custom/SurveyGeometryInfo";
import { dataVizPalette } from "@/lib/colorPalette";

const MapSubstrate = React.memo(() => {
  const { txData, rxData, datasets, activeDatasetIds, comparisonMode } =
    useDataTableStore();
  const { mapLayer } = useSettingFormStore();

  const activeDatasets = useMemo(() => {
    return activeDatasetIds
      .map((id) => datasets.get(id))
      .filter((dataset): dataset is Dataset => Boolean(dataset && dataset.visible));
  }, [activeDatasetIds, datasets]);

  const useOverlay = comparisonMode === "overlay" && activeDatasets.length > 0;
  const useDefaultColors = activeDatasets.length === 1;

  const overlayMarkers = useMemo(() => {
    if (!useOverlay) {
      return [];
    }
    return activeDatasets.map((dataset) => {
      const { TxData, RxData } =
        dataset.txData.length && dataset.rxData.length
          ? { TxData: dataset.txData, RxData: dataset.rxData }
          : getTxRxData(dataset.data);

      return {
        dataset,
        txColor: useDefaultColors ? dataVizPalette.txRx.light.tx : dataset.color,
        rxColor: useDefaultColors ? dataVizPalette.txRx.light.rx : dataset.color,
        txLoc: TxData.map((tx) => [tx.Lat_tx, tx.Lon_tx] as [number, number]),
        rxLoc: RxData.map((rx) => [rx.Lat_rx, rx.Lon_rx] as [number, number]),
        txSite: TxData.map((tx) => tx.Name_tx),
      };
    });
  }, [activeDatasets, useDefaultColors, useOverlay]);

  const txLoc = useMemo(() => txData.map((tx) => [tx.Lat_tx, tx.Lon_tx] as [number, number]), [txData]);
  const rxLoc = useMemo(() => rxData.map((rx) => [rx.Lat_rx, rx.Lon_rx] as [number, number]), [rxData]);
  const txSite = useMemo(() => txData.map((tx) => tx.Name_tx), [txData]);

  const txPosition = useMemo(() => {
    const defaultPosition: [number, number] = [0, 0];
    if (useOverlay) {
      const first = overlayMarkers[0]?.txLoc ?? [];
      return first.length > 0
        ? ([
          first[Math.floor(first.length / 2)][0],
          first[Math.floor(first.length / 2)][1],
        ] as [number, number])
        : defaultPosition;
    }
    return txLoc.length > 0
      ? ([
        txLoc[Math.floor(txLoc.length / 2)][0],
        txLoc[Math.floor(txLoc.length / 2)][1],
      ] as [number, number])
      : defaultPosition;
  }, [txLoc, useOverlay, overlayMarkers]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={txPosition}
        zoom={7}
        className="absolute inset-0 z-0 h-full w-full"
        style={{ height: "100vh", width: "100vw" }}
        zoomControl={false}
        attributionControl={false}
      >
        <AttributionControl position="bottomleft" />
        <TileLayer
          url={mapLayers[mapLayer].url}
          attribution={mapLayers[mapLayer].attribution}
          {...(mapLayers[mapLayer].subdomains
            ? { subdomains: mapLayers[mapLayer].subdomains }
            : {})}
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
                  color={group.rxColor}
                  fillOpacity={0.5}
                >
                  <Popup>
                    {group.dataset.name} Rx Location: {loc[0].toFixed(2)},{" "}
                    {loc[1].toFixed(2)}
                  </Popup>
                </CircleMarker>
              ))}
              {group.txLoc.map((loc, index) => (
                <CircleMarker
                  key={`${group.dataset.id}-tx-${index}`}
                  center={loc}
                  radius={2}
                  color={group.txColor}
                  fillColor={group.txColor}
                  fillOpacity={1}
                >
                  <Popup>
                    {group.dataset.name} Tx Site: {group.txSite[index]}, Tx
                    Location: {loc[0].toFixed(2)}, {loc[1].toFixed(2)}
                  </Popup>
                </CircleMarker>
              ))}
            </Fragment>
          ))
        ) : (
          <>
            {rxLoc.length > 0 &&
              rxLoc.map((loc, index) => (
                <CircleMarker
                  key={index}
                  center={loc}
                  radius={0.5}
                  color={dataVizPalette.txRx.light.rx}
                  fillOpacity={0.5}
                >
                  <Popup>
                    Rx Location: {loc[0].toFixed(2)}, {loc[1].toFixed(2)}
                  </Popup>
                </CircleMarker>
              ))}
            {txLoc.length > 0 &&
              txLoc.map((loc, index) => (
                <CircleMarker
                  key={index}
                  center={loc}
                  radius={2}
                  color={dataVizPalette.txRx.light.tx}
                  fillColor={dataVizPalette.txRx.light.tx}
                  fillOpacity={1}
                >
                  <Popup>
                    Tx Site: {txSite[index]}, Tx Location: {loc[0].toFixed(2)},{" "}
                    {loc[1].toFixed(2)}
                  </Popup>
                </CircleMarker>
              ))}
          </>
        )}

      </MapContainer>
      <MapLayerControl />
      <SurveyGeometryInfo />
    </div>
  );
});

const MapUpdater = ({ position }: { position: [number, number] }) => {
  const map = useMap();
  const { recenterTimestamp } = useSettingFormStore();

  useEffect(() => {
    map.setView(position);
  }, [position, map, recenterTimestamp]);

  // Handle custom zoom events from MapLayerControl
  useEffect(() => {
    const handleZoom = (event: Event) => {
      const customEvent = event as CustomEvent<{ direction: 'in' | 'out' }>;
      if (customEvent.detail.direction === 'in') {
        map.zoomIn();
      } else {
        map.zoomOut();
      }
    };

    window.addEventListener('map-zoom', handleZoom);
    return () => window.removeEventListener('map-zoom', handleZoom);
  }, [map]);

  return null;
};



export default MapSubstrate;
