[Reading 240 lines from start (total: 561 lines, 18.0 KB)]

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
  const dot = document.createElement('i');
  const text = document.createElement('span');
  text.textContent = label;
  root.append(dot, text);
  return root;
}

function setMarkerLabel(marker: maplibregl.Marker | null, label: string) {
  const labelNode = marker?.getElement().querySelector('span');
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

      map.addSource('ground-track', {
        type: 'geojson',
        data: trackGeoJson(track) as any,
      });
      map.addLayer({
        id: 'ground-track-line',
        type: 'line',
        source: 'ground-track',