import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { SatelliteLink } from '../types';

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
};

type ViewMode = 'observer' | 'satellite' | 'globe';

const SATELLITE_TILES = `${window.location.origin}/api/imagery/{z}/{x}/{y}`;
const BASE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const TERRAIN_TILEJSON = 'https://tiles.mapterhorn.com/tilejson.json';

function formatLat(value: number) {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? 'N' : 'S'}`;
}

function formatLon(value: number) {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? 'E' : 'W'}`;
}

function makeMarker(kind: 'observer' | 'satellite', label: string) {
  const root = document.createElement('div');
  root.className = `earth-map-marker ${kind}`;

  const dot = document.createElement('i');
  const text = document.createElement('span');
  text.textContent = label;

  root.append(dot, text);
  return root;
}

function setMarkerLabel(marker: maplibregl.Marker | null, label: string) {
  const element = marker?.getElement();
  const labelNode = element?.querySelector('span');
  if (labelNode) labelNode.textContent = label;
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
  const features = splitTrack(track).map((segment, index) => ({
    type: 'Feature',
    properties: {
      kind: segment.some(point => point.offsetMin > 0) ? 'future' : 'past',
      id: index,
    },
    geometry: {
      type: 'LineString',
      coordinates: segment.map(point => [point.lonDeg, point.latDeg]),
    },
  }));

  return {
    type: 'FeatureCollection',
    features,
  };
}

export default function EarthTrack({ current, station, stationLabel, track }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const observerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const satelliteMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('observer');
  const [mapReady, setMapReady] = useState(false);

  const observerName = useMemo(() => stationLabel.split(',').slice(0, 2).join(', '), [stationLabel]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [station.lonDeg, station.latDeg],
      zoom: 1.7,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.GlobeControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    observerMarkerRef.current = new maplibregl.Marker({
      element: makeMarker('observer', observerName),
      anchor: 'bottom',
    }).setLngLat([station.lonDeg, station.latDeg]).addTo(map);

    if (current) {
      satelliteMarkerRef.current = new maplibregl.Marker({
        element: makeMarker('satellite', current.name),
        anchor: 'bottom',
      }).setLngLat([current.subLonDeg, current.subLatDeg]).addTo(map);
    }

    map.on('load', () => {
      map.setProjection({ type: 'globe' });

      if (!map.getSource('satellite-imagery')) {
        map.addSource('satellite-imagery', {
          type: 'raster',
          tiles: [SATELLITE_TILES],
          tileSize: 256,
          attribution: 'Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community · proxied by LEO Link Lab',
          maxzoom: 18,
        });

        const layers = map.getStyle().layers || [];
        const firstSymbol = layers.find(layer => layer.type === 'symbol')?.id;
        map.addLayer({
          id: 'satellite-imagery-layer',
          type: 'raster',
          source: 'satellite-imagery',
          paint: {
            'raster-opacity': 1,
            'raster-saturation': 0,
            'raster-contrast': 0,
            'raster-brightness-min': 0,
            'raster-brightness-max': 1,
          },
        }, firstSymbol);
      }

      if (!map.getSource('terrain-source')) {
        map.addSource('terrain-source', {
          type: 'raster-dem',
          url: TERRAIN_TILEJSON,
        });
        map.setTerrain({ source: 'terrain-source', exaggeration: 1 });
        map.addControl(new maplibregl.TerrainControl({ source: 'terrain-source', exaggeration: 1 }), 'top-right');
      }

      if (!map.getSource('ground-track')) {
        map.addSource('ground-track', {
          type: 'geojson',
          data: trackGeoJson(track) as any,
        });
        map.addLayer({
          id: 'ground-track-line',
          type: 'line',
          source: 'ground-track',
          paint: {
            'line-color': [
              'match',
              ['get', 'kind'],
              'future', '#63e8ff',
              '#91a0a8',
            ],
            'line-width': [
              'match',
              ['get', 'kind'],
              'future', 4,
              2,
            ],
            'line-opacity': [
              'match',
              ['get', 'kind'],
              'future', 0.95,
              0.65,
            ],
            'line-dasharray': [2, 1.5],
          },
        });
      }

      setMapReady(true);
      map.flyTo({
        center: [station.lonDeg, station.latDeg],
        zoom: 9,
        pitch: 58,
        bearing: 0,
        duration: 1500,
        essential: true,
      });
    });

    return () => {
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

    setViewMode('observer');
    if (mapReady) {
      map.flyTo({
        center: [station.lonDeg, station.latDeg],
        zoom: 9,
        pitch: 58,
        bearing: 0,
        duration: 1400,
        essential: true,
      });
    }
  }, [station.latDeg, station.lonDeg, observerName, mapReady]);

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
        anchor: 'bottom',
      }).setLngLat([current.subLonDeg, current.subLatDeg]).addTo(map);
    } else {
      satelliteMarkerRef.current.setLngLat([current.subLonDeg, current.subLatDeg]);
      setMarkerLabel(satelliteMarkerRef.current, current.name);
    }
  }, [current?.name, current?.subLatDeg, current?.subLonDeg]);

  useEffect(() => {
    const source = mapRef.current?.getSource('ground-track') as maplibregl.GeoJSONSource | undefined;
    source?.setData(trackGeoJson(track) as any);
  }, [track]);

  const flyObserver = () => {
    const map = mapRef.current;
    if (!map) return;
    setViewMode('observer');
    map.flyTo({
      center: [station.lonDeg, station.latDeg],
      zoom: 10.5,
      pitch: 62,
      bearing: 0,
      duration: 1500,
      essential: true,
    });
  };

  const flySatellite = () => {
    const map = mapRef.current;
    if (!map || !current) return;
    setViewMode('satellite');
    map.flyTo({
      center: [current.subLonDeg, current.subLatDeg],
      zoom: 7.2,
      pitch: 50,
      bearing: 0,
      duration: 1500,
      essential: true,
    });
  };

  const flyGlobe = () => {
    const map = mapRef.current;
    if (!map) return;
    setViewMode('globe');
    map.flyTo({
      center: current ? [current.subLonDeg, current.subLatDeg] : [station.lonDeg, station.latDeg],
      zoom: 1.55,
      pitch: 0,
      bearing: 0,
      duration: 1500,
      essential: true,
    });
  };

  return (
    <section className="panel earth-view-panel">
      <div className="panel-title-row earth-view-header">
        <div>
          <p className="eyebrow">EARTH VIEW / GROUND TRACK</p>
          <h2>Real geography, live satellite position</h2>
          <p className="earth-view-copy">
            Zoom from the globe down to the selected observer or the satellite's ground point.
          </p>
        </div>

        <div className="earth-view-actions">
          <button className={viewMode === 'observer' ? 'active' : ''} type="button" onClick={flyObserver}>
            Observer
          </button>
          <button className={viewMode === 'satellite' ? 'active' : ''} type="button" onClick={flySatellite} disabled={!current}>
            Satellite
          </button>
          <button className={viewMode === 'globe' ? 'active' : ''} type="button" onClick={flyGlobe}>
            Globe
          </button>
        </div>
      </div>

      <div className="real-earth-map" ref={containerRef} />

      <div className="earth-view-readout">
        <div>
          <span>OBSERVER</span>
          <strong>{observerName}</strong>
          <small>{formatLat(station.latDeg)} · {formatLon(station.lonDeg)}</small>
        </div>
        <div>
          <span>SATELLITE SUBPOINT</span>
          <strong>{current ? `${formatLat(current.subLatDeg)} · ${formatLon(current.subLonDeg)}` : '—'}</strong>
          <small>{current ? `${current.altitudeKm.toFixed(1)} km orbital altitude` : 'No tracked satellite'}</small>
        </div>
        <div>
          <span>GROUND TRACK</span>
          <strong>Past + future path</strong>
          <small>Grey = past · cyan = future</small>
        </div>
      </div>

      <div className="earth-view-note">
        World Imagery is a geographic basemap, not live photography. Observer position, satellite subpoint
        and ground track are the live layers.
      </div>
    </section>
  );
}
