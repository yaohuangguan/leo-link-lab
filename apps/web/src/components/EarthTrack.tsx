import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { SatelliteLink } from '../types';
import { useI18n } from '../i18n';

type TrackPoint = {
  latDeg: number;
  lonDeg: number;
  offsetMin: number;
};

type Props = {
  current?: SatelliteLink;
  station: { latDeg: number; lonDeg: number };
  stationLabel: string;
  track: TrackPoint[];
  visible: SatelliteLink[];
  onSelectSatellite: (noradId: string) => void;
  apiBase: string;
};

type ViewMode = 'observer' | 'satellite' | 'globe';
type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

const TERRAIN_TILEJSON = 'https://tiles.mapterhorn.com/tilejson.json';
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

function formatLat(value: number) {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? 'N' : 'S'}`;
}

function formatLon(value: number) {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? 'E' : 'W'}`;
}

function makeMarker(kind: 'observer' | 'satellite', label: string) {
  const root = document.createElement('div');
  root.className = `earth-map-marker ${kind}`;

  const anchor = document.createElement('div');
  anchor.className = 'earth-marker-anchor';

  if (kind === 'satellite') {
    const spacecraft = document.createElement('div');
    spacecraft.className = 'satellite-spacecraft';
    spacecraft.innerHTML = '<i class="sat-panel"></i><i class="sat-body"></i><i class="sat-direction"></i>';
    anchor.append(spacecraft);
  } else {
    const dot = document.createElement('i');
    anchor.append(dot);
  }

  const text = document.createElement('span');
  text.textContent = label;
  anchor.append(text);
  root.append(anchor);
  return root;
}

function setMarkerLabel(marker: maplibregl.Marker | null, label: string) {
  const labelNode = marker?.getElement().querySelector('span');
  if (labelNode) labelNode.textContent = label;
}

function setSatelliteHeading(marker: maplibregl.Marker | null, headingDeg: number) {
  const spacecraft = marker?.getElement().querySelector<HTMLElement>('.satellite-spacecraft');
  if (spacecraft) spacecraft.style.transform = `rotate(${headingDeg}deg)`;
}

function bearingDeg(from: TrackPoint, to: TrackPoint) {
  const lat1 = from.latDeg * Math.PI / 180;
  const lat2 = to.latDeg * Math.PI / 180;
  const dLon = (to.lonDeg - from.lonDeg) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function linkGeoJson(
  satellite: { latDeg: number; lonDeg: number } | null,
  observer: { latDeg: number; lonDeg: number },
) {
  if (!satellite) return EMPTY_GEOJSON;

  const start = satellite;
  let targetLon = observer.lonDeg;
  const delta = targetLon - start.lonDeg;

  if (delta > 180) targetLon -= 360;
  if (delta < -180) targetLon += 360;

  const adjustedDelta = targetLon - start.lonDeg;
  if (targetLon >= -180 && targetLon <= 180) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { kind: 'observer-link' },
        geometry: {
          type: 'LineString',
          coordinates: [[start.lonDeg, start.latDeg], [observer.lonDeg, observer.latDeg]],
        },
      }],
    };
  }

  const boundary = targetLon > 180 ? 180 : -180;
  const t = (boundary - start.lonDeg) / adjustedDelta;
  const boundaryLat = start.latDeg + (observer.latDeg - start.latDeg) * t;
  const wrappedBoundary = boundary === 180 ? -180 : 180;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'observer-link' },
        geometry: {
          type: 'LineString',
          coordinates: [[start.lonDeg, start.latDeg], [boundary, boundaryLat]],
        },
      },
      {
        type: 'Feature',
        properties: { kind: 'observer-link' },
        geometry: {
          type: 'LineString',
          coordinates: [[wrappedBoundary, boundaryLat], [observer.lonDeg, observer.latDeg]],
        },
      },
    ],
  };
}

function splitTrack(points: TrackPoint[]) {
  const segments: TrackPoint[][] = [];
  let current: TrackPoint[] = [];

  for (const point of points) {
    const previous = current.at(-1);
    if (previous && (Math.abs(point.lonDeg - previous.lonDeg) > 180 || Math.sign(point.offsetMin) !== Math.sign(previous.offsetMin))) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push(point);
  }

  if (current.length > 1) segments.push(current);
  return segments;
}

function trackGeoJson(track: TrackPoint[]) {
  return {
    type: 'FeatureCollection',
    features: splitTrack(track).map((segment, index) => ({
      type: 'Feature',
      properties: {
        kind: segment.some(point => point.offsetMin > 0) ? 'future' : 'past',
        id: index,
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.map(point => [point.lonDeg, point.latDeg]),
      },
    })),
  };
}

function createMapStyle(): maplibregl.StyleSpecification {
  const origin = window.location.origin;
  return {
    version: 8,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [`${origin}/api/imagery/{z}/{x}/{y}`],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community',
      },
      labels: {
        type: 'raster',
        tiles: [`${origin}/api/labels/{z}/{x}/{y}`],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Reference labels © Esri',
      },
    },
    layers: [
      {
        id: 'ocean-background',
        type: 'background',
        paint: { 'background-color': '#08385c' },
      },
      {
        id: 'world-imagery',
        type: 'raster',
        source: 'imagery',
        paint: {
          'raster-opacity': 1,
          'raster-saturation': 0.12,
          'raster-contrast': 0.06,
          'raster-brightness-min': 0,
          'raster-brightness-max': 0.93,
        },
      },
      {
        id: 'place-labels',
        type: 'raster',
        source: 'labels',
        paint: { 'raster-opacity': 0.9 },
      },
    ],
  };
}

export default function EarthTrack({
  current,
  station,
  stationLabel,
  track,
  visible,
  onSelectSatellite,
  apiBase,
}: Props) {
  const { t, language } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const observerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const satelliteMarkerRef = useRef<maplibregl.Marker | null>(null);
  const constellationWorkerRef = useRef<Worker | null>(null);
  const catalogLoadedRef = useRef(false);
  const showAllRef = useRef(false);
  const hasInitialSatelliteFocusRef = useRef(false);

  const [viewMode, setViewMode] = useState<ViewMode>('satellite');
  const [mapReady, setMapReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [showAllSatellites, setShowAllSatellites] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('idle');
  const [allSatelliteCount, setAllSatelliteCount] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(0);

  const observerName = useMemo(() => {
    const parts = stationLabel.split(/[,，]/).map(part => part.trim()).filter(Boolean);
    return language === 'zh' ? (parts[0] || stationLabel) : parts.slice(0, 2).join(' · ');
  }, [stationLabel, language]);

  const satelliteHeading = useMemo(() => {
    const ordered = [...track].sort((a, b) => a.offsetMin - b.offsetMin);
    const currentIndex = ordered.findIndex(point => point.offsetMin >= 0);
    const from = currentIndex > 0 ? ordered[currentIndex - 1] : ordered[0];
    const to = currentIndex >= 0 && currentIndex < ordered.length - 1
      ? ordered[currentIndex + 1]
      : ordered.at(-1);
    return from && to ? bearingDeg(from, to) : 0;
  }, [track]);

  useEffect(() => {
    showAllRef.current = showAllSatellites;
  }, [showAllSatellites]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapStyle(),
      center: [station.lonDeg, station.latDeg],
      zoom: 1.7,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      attributionControl: false,
      scrollZoom: { around: 'center' },
    });

    mapRef.current = map;
    map.scrollZoom.enable({ around: 'center' });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.GlobeControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    observerMarkerRef.current = new maplibregl.Marker({
      element: makeMarker('observer', observerName),
      anchor: 'center',
    }).setLngLat([station.lonDeg, station.latDeg]).addTo(map);
    observerMarkerRef.current.setSubpixelPositioning(true);

    if (current) {
      satelliteMarkerRef.current = new maplibregl.Marker({
        element: makeMarker('satellite', current.name),
        anchor: 'center',
      }).setLngLat([current.subLonDeg, current.subLatDeg]).addTo(map);
      satelliteMarkerRef.current.setSubpixelPositioning(true);
    }

    map.on('load', () => {
      map.setProjection({ type: 'globe' });

      if (!map.getSource('terrain-source')) {
        map.addSource('terrain-source', {
          type: 'raster-dem',
          url: TERRAIN_TILEJSON,
        });
        map.setTerrain({ source: 'terrain-source', exaggeration: 1 });
        map.addControl(new maplibregl.TerrainControl({ source: 'terrain-source', exaggeration: 1 }), 'top-right');
      }

      map.addSource('all-active-satellites', {
        type: 'geojson',
        data: EMPTY_GEOJSON as any,
      });
      map.addLayer({
        id: 'all-active-satellites-layer',
        type: 'circle',
        source: 'all-active-satellites',
        layout: { visibility: 'none' },
        paint: {
          'circle-color': '#b8f4ff',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 1.15, 2, 1.6, 5, 2.4, 8, 3.2],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.62, 4, 0.74, 8, 0.82],
          'circle-stroke-color': '#164a60',
          'circle-stroke-width': 0.45,
        },
      });

      map.addSource('observer-link', {
        type: 'geojson',
        data: linkGeoJson(
          current ? { latDeg: current.subLatDeg, lonDeg: current.subLonDeg } : null,
          station,
        ) as any,
      });
      map.addLayer({
        id: 'observer-link-glow',
        type: 'line',
        source: 'observer-link',
        paint: {
          'line-color': '#5ee9ff',
          'line-width': 10,
          'line-opacity': 0.16,
        },
      });
      map.addLayer({
        id: 'observer-link-line',
        type: 'line',
        source: 'observer-link',
        paint: {
          'line-color': '#7cf5ff',
          'line-width': 3,
          'line-opacity': 0.95,
          'line-dasharray': [1.4, 1.15],
        },
      });

      map.addSource('ground-track', {
        type: 'geojson',
        data: trackGeoJson(track) as any,
      });
      map.addLayer({
        id: 'ground-track-line',
        type: 'line',
        source: 'ground-track',
        paint: {
          'line-color': ['match', ['get', 'kind'], 'future', '#63e8ff', '#91a0a8'],
          'line-width': ['match', ['get', 'kind'], 'future', 4, 2],
          'line-opacity': ['match', ['get', 'kind'], 'future', 0.95, 0.65],
          'line-dasharray': [2, 1.5],
        },
      });

      setMapReady(true);
      const initialCenter: [number, number] = current
        ? [current.subLonDeg, current.subLatDeg]
        : [station.lonDeg, station.latDeg];
      map.flyTo({
        center: initialCenter,
        zoom: current ? 7.2 : 9,
        pitch: current ? 50 : 58,
        bearing: 0,
        duration: 1200,
        essential: true,
      });
    });

    return () => {
      constellationWorkerRef.current?.terminate();
      constellationWorkerRef.current = null;
      observerMarkerRef.current?.remove();
      satelliteMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    observerMarkerRef.current?.setLngLat([station.lonDeg, station.latDeg]);
    setMarkerLabel(observerMarkerRef.current, observerName);
    hasInitialSatelliteFocusRef.current = false;

    if (mapReady && viewMode === 'observer') {
      map.flyTo({
        center: [station.lonDeg, station.latDeg],
        zoom: 9,
        pitch: 58,
        bearing: 0,
        duration: 1100,
        essential: true,
      });
    }
  }, [station.latDeg, station.lonDeg, observerName, mapReady, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!current) {
      satelliteMarkerRef.current?.remove();
      satelliteMarkerRef.current = null;
      return;
    }

    if (!satelliteMarkerRef.current) {
      satelliteMarkerRef.current = new maplibregl.Marker({
        element: makeMarker('satellite', current.name),
        anchor: 'center',
      }).setLngLat([current.subLonDeg, current.subLatDeg]).addTo(map);
      satelliteMarkerRef.current.setSubpixelPositioning(true);
    } else {
      satelliteMarkerRef.current.setLngLat([current.subLonDeg, current.subLatDeg]);
      setMarkerLabel(satelliteMarkerRef.current, current.name);
    }
    setSatelliteHeading(satelliteMarkerRef.current, satelliteHeading);

    if (mapReady && viewMode === 'satellite' && !hasInitialSatelliteFocusRef.current) {
      hasInitialSatelliteFocusRef.current = true;
      map.flyTo({
        center: [current.subLonDeg, current.subLatDeg],
        zoom: 7.2,
        pitch: 50,
        bearing: 0,
        duration: 900,
        essential: true,
      });
    }
  }, [current?.name, current?.subLatDeg, current?.subLonDeg, mapReady, viewMode, satelliteHeading]);

  useEffect(() => {
    const source = mapRef.current?.getSource('ground-track') as maplibregl.GeoJSONSource | undefined;
    source?.setData(trackGeoJson(track) as any);
  }, [track]);

  useEffect(() => {
    const source = mapRef.current?.getSource('observer-link') as maplibregl.GeoJSONSource | undefined;
    source?.setData(linkGeoJson(
      current ? { latDeg: current.subLatDeg, lonDeg: current.subLonDeg } : null,
      station,
    ) as any);
  }, [current?.subLatDeg, current?.subLonDeg, station.latDeg, station.lonDeg, mapReady]);

  const flyObserver = () => {
    const map = mapRef.current;
    if (!map) return;
    setViewMode('observer');
    map.flyTo({
      center: [station.lonDeg, station.latDeg],
      zoom: 10.5,
      pitch: 62,
      bearing: 0,
      duration: 1200,
      essential: true,
    });
  };

  const flySatellite = () => {
    const map = mapRef.current;
    if (!map || !current) return;
    setViewMode('satellite');
    hasInitialSatelliteFocusRef.current = true;
    map.flyTo({
      center: [current.subLonDeg, current.subLatDeg],
      zoom: 7.2,
      pitch: 50,
      bearing: 0,
      duration: 1200,
      essential: true,
    });
  };

  const flyGlobe = () => {
    const map = mapRef.current;
    if (!map) return;
    setViewMode('globe');
    map.flyTo({
      center: current ? [current.subLonDeg, current.subLatDeg] : [station.lonDeg, station.latDeg],
      zoom: 1.45,
      pitch: 0,
      bearing: 0,
      duration: 1200,
      essential: true,
    });
  };

  const selectVisibleSatellite = (satellite: SatelliteLink) => {
    onSelectSatellite(satellite.noradId);
    setViewMode('satellite');
    hasInitialSatelliteFocusRef.current = true;

    mapRef.current?.flyTo({
      center: [satellite.subLonDeg, satellite.subLatDeg],
      zoom: Math.min(mapRef.current.getZoom(), 6.5),
      pitch: 35,
      bearing: 0,
      duration: 900,
      essential: true,
    });
  };

  const ensureConstellationWorker = () => {
    if (constellationWorkerRef.current) return constellationWorkerRef.current;

    const worker = new Worker(new URL('../workers/constellation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'ready') {
        setCatalogStatus('ready');
        setCatalogTotal(message.count);
        worker.postMessage({ type: 'start', intervalMs: 3000 });
        return;
      }

      if (message.type === 'positions') {
        setAllSatelliteCount(message.count);
        if (!showAllRef.current) return;
        const source = mapRef.current?.getSource('all-active-satellites') as maplibregl.GeoJSONSource | undefined;
        source?.setData(message.geojson);
      }
    };

    constellationWorkerRef.current = worker;
    return worker;
  };

  const toggleAllSatellites = async () => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (showAllSatellites) {
      setShowAllSatellites(false);
      showAllRef.current = false;
      map.setLayoutProperty('all-active-satellites-layer', 'visibility', 'none');
      constellationWorkerRef.current?.postMessage({ type: 'stop' });
      return;
    }

    setShowAllSatellites(true);
    showAllRef.current = true;
    map.setLayoutProperty('all-active-satellites-layer', 'visibility', 'visible');
    flyGlobe();

    const worker = ensureConstellationWorker();

    if (catalogLoadedRef.current) {
      worker.postMessage({ type: 'start', intervalMs: 3000 });
      return;
    }

    setCatalogStatus('loading');
    try {
      const response = await fetch(`${apiBase}/api/active-satellites`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);

      const records = Array.isArray(body) ? body : (body.satellites || []);
      catalogLoadedRef.current = true;
      setCatalogTotal(records.length);
      worker.postMessage({ type: 'init', records });
    } catch {
      setCatalogStatus('error');
      setShowAllSatellites(false);
      showAllRef.current = false;
      map.setLayoutProperty('all-active-satellites-layer', 'visibility', 'none');
    }
  };

  return (
    <section className="panel earth-view-panel">
      <div className="panel-title-row earth-view-header">
        <div>
          <p className="eyebrow">{t('EARTH VIEW / GROUND TRACK')}</p>
          <h2>{t('Real geography, live satellite position')}</h2>
          <p className="earth-view-copy">{t("Zoom from the globe down to the selected observer or the satellite's ground point.")}</p>
        </div>

        <div className="earth-view-actions">
          <button className={viewMode === 'observer' ? 'active' : ''} type="button" onClick={flyObserver}>{t('Observer')}</button>
          <button className={viewMode === 'satellite' ? 'active' : ''} type="button" onClick={flySatellite} disabled={!current}>{t('Satellite')}</button>
          <button className={viewMode === 'globe' ? 'active' : ''} type="button" onClick={flyGlobe}>{t('Globe')}</button>
          <button
            className={showAllSatellites ? 'active constellation-toggle' : 'constellation-toggle'}
            type="button"
            onClick={toggleAllSatellites}
            disabled={catalogStatus === 'loading'}
          >
            {catalogStatus === 'loading'
              ? t('Loading all satellites…')
              : showAllSatellites
                ? t('Hide all active satellites')
                : t('Show all active satellites')}
          </button>
        </div>
      </div>

      <div className="earth-map-shell">
        <div className="real-earth-map" ref={containerRef} />

        <aside className={`visible-satellite-drawer ${drawerOpen ? 'open' : 'collapsed'}`}>
          <div className="visible-satellite-drawer-head">
            <div>
              <span>{t('VISIBLE NOW')}</span>
              <strong>{t('{count} satellites', { count: visible.length })}</strong>
            </div>
            <button type="button" onClick={() => setDrawerOpen(value => !value)} aria-label={drawerOpen ? 'Collapse' : 'Expand'}>
              {drawerOpen ? '‹' : '›'}
            </button>
          </div>

          {drawerOpen && (
            <>
              <div className="visible-satellite-list">
                {visible.map(satellite => {
                  const active = satellite.noradId === current?.noradId;
                  return (
                    <button
                      key={satellite.noradId}
                      type="button"
                      className={active ? 'active' : ''}
                      onClick={() => selectVisibleSatellite(satellite)}
                    >
                      <div>
                        <strong>{satellite.name}</strong>
                        <small>NORAD {satellite.noradId}</small>
                      </div>
                      <div>
                        <b>{satellite.elevationDeg.toFixed(1)}° EL</b>
                        <small>{satellite.snrDb.toFixed(1)} dB SNR</small>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="visible-satellite-drawer-foot">
                <span>{t('Click a satellite to pin it and move the Earth view.')}</span>
              </div>
            </>
          )}
        </aside>

        {showAllSatellites && (
          <div className="constellation-status">
            <i />
            <span>{t('ALL ACTIVE SATELLITES')}</span>
            <strong>{allSatelliteCount || catalogTotal || '…'}</strong>
            <small>{t('CelesTrak ACTIVE catalog · positions update every 3 s')}</small>
          </div>
        )}
      </div>

      <div className="earth-view-readout">
        <div>
          <span>{t('OBSERVER')}</span>
          <strong>{observerName}</strong>
          <small>{formatLat(station.latDeg)} · {formatLon(station.lonDeg)}</small>
        </div>
        <div>
          <span>{t('SATELLITE SUBPOINT')}</span>
          <strong>{current ? `${formatLat(current.subLatDeg)} · ${formatLon(current.subLonDeg)}` : '—'}</strong>
          <small>{current ? t('{altitude} km orbital altitude', { altitude: current.altitudeKm.toFixed(1) }) : t('No tracked satellite')}</small>
        </div>
        <div>
          <span>{t('GROUND TRACK')}</span>
          <strong>{t('Past + future path')}</strong>
          <small>{t('Grey = past · cyan = future')}</small>
        </div>
        <div>
          <span>{t('LINK DIRECTION')}</span>
          <strong>{current ? t('Satellite → {observer}', { observer: observerName }) : '—'}</strong>
          <small>{current ? t('Calculated LOS · Az {az}° · El {el}°', { az: current.azimuthDeg.toFixed(1), el: current.elevationDeg.toFixed(1) }) : t('No tracked satellite')}</small>
        </div>
      </div>

      <div className="earth-view-note">{t('World Imagery is a geographic basemap, not live photography. Observer position, satellite subpoint, ground track and line of sight are calculated live. The satellite icon is a simplified model; its panel is illustrative, while the arrow follows the computed ground-track direction.')}</div>
    </section>
  );
}