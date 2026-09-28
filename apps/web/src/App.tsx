[Reading 240 lines from start (total: 546 lines, 23.5 KB)]

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeLink } from './orbit';
import SkyPlot from './components/SkyPlot';
import EarthTrack from './components/EarthTrack';
import Sparkline from './components/Sparkline';
import HandoverPanel from './components/HandoverPanel';
import PassTimeline from './components/PassTimeline';
import LinkBudgetPanel from './components/LinkBudgetPanel';
import ObserverPicker, { type ObserverLocation } from './components/ObserverPicker';
import { useMetricHistory } from './hooks/useMetricHistory';
import { useI18n } from './i18n';
import type { OmmRecord, RadioConfig, SatelliteLink } from './types';

const API = import.meta.env.VITE_API_BASE_URL || '';
const DEFAULT_OBSERVER: ObserverLocation = {
  label: 'Auckland, New Zealand',
  latDeg: -36.8485,
  lonDeg: 174.7633,
  locale: 'en',
};

const initialRadio: RadioConfig = {
  frequencyGHz: 12,
  bandwidthMHz: 100,
  txPowerDbm: 30,
  txGainDbi: 35,
  rxGainDbi: 33,
  noiseFigureDb: 3,
  otherLossDb: 3,
  requiredSnrDb: 5,
  minElevationDeg: 10,
};

const fmt = (n: number, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : '—';

const sections = [
  ['overview', 'Real Earth'],
  ['link', 'Current link'],
  ['budget', 'Link budget'],
  ['pass', 'Pass & handover'],
  ['metrics', 'Metrics'],
  ['satellites', 'Satellites'],
  ['rf', 'RF model'],
] as const;

function initialObserver(): ObserverLocation {
  if (typeof window === 'undefined') return DEFAULT_OBSERVER;
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return DEFAULT_OBSERVER;
  }
  return {
    label: params.get('place') || `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
    latDeg: lat,
    lonDeg: lon,
  };
}

export default function App() {
  const { t, language, setLanguage } = useI18n();
  const [records, setRecords] = useState<OmmRecord[]>([]);
  const [radio, setRadio] = useState(initialRadio);
  const [station, setStation] = useState<ObserverLocation>(initialObserver);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({ returned: 0, total: 0, stale: false, loaded: false });
  const [lockedNoradId, setLockedNoradId] = useState<string | null>(null);
  const [manualSelection, setManualSelection] = useState(false);

  const lockStartedAt = useRef(Date.now());
  const betterCandidate = useRef<{ noradId: string; since: number } | null>(null);

  useEffect(() => {
    fetch(`${API}/api/starlink?limit=900`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        return body;
      })
      .then(body => {
        setRecords(body.satellites || []);
        setMeta({
          returned: Number(body.returned || 0),
          total: Number(body.total || 0),
          stale: Boolean(body.stale),
          loaded: true,
        });
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('lat', station.latDeg.toFixed(5));
    url.searchParams.set('lon', station.lonDeg.toFixed(5));
    url.searchParams.set('place', station.label);
    window.history.replaceState({}, '', url);
  }, [station.latDeg, station.lonDeg, station.label]);

  useEffect(() => {
    setLockedNoradId(null);
    setManualSelection(false);
    betterCandidate.current = null;
    lockStartedAt.current = Date.now();
  }, [station.latDeg, station.lonDeg]);

  useEffect(() => {
    if (station.locale === language) return;
    const controller = new AbortController();

    const updateLocalizedLabel = async () => {
      let localizedLabel = '';

      if (station.locale !== 'neutral' && station.label) {
        const response = await fetch(
          `${API}/api/geocode?q=${encodeURIComponent(station.label)}&lang=${language}`,
          { signal: controller.signal },
        );
        if (response.ok) {
          const body = await response.json();
          const candidates = Array.isArray(body.results) ? body.results : [];
          const nearest = candidates
            .map((item: { label: string; latDeg: number; lonDeg: number }) => ({
              ...item,
              distance: Math.hypot(item.latDeg - station.latDeg, item.lonDeg - station.lonDeg),
            }))
            .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)[0];
          if (nearest && nearest.distance < 2) localizedLabel = nearest.label;
        }
      }

      if (!localizedLabel) {
        const response = await fetch(
          `${API}/api/reverse-geocode?lat=${station.latDeg}&lon=${station.lonDeg}&lang=${language}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const body = await response.json();
        localizedLabel = body.label || '';
      }

      if (!localizedLabel) return;
      setStation(previous => {
        if (previous.latDeg !== station.latDeg || previous.lonDeg !== station.lonDeg) return previous;
        return { ...previous, label: localizedLabel, locale: language };
      });
    };

    updateLocalizedLabel().catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    });

    return () => controller.abort();
  }, [language, station.latDeg, station.lonDeg, station.label, station.locale]);

  const visible = useMemo(() => records
    .map(record => computeLink(record, station, radio, now))
    .filter((link): link is SatelliteLink => !!link && link.elevationDeg >= radio.minElevationDeg)
    .sort((a, b) => b.snrDb - a.snrDb), [records, station, radio, now]);

  const bestNow = visible[0];
  const locked = lockedNoradId ? visible.find(link => link.noradId === lockedNoradId) : undefined;
  const tracked = locked || bestNow;
  const candidate = visible.find(link => link.noradId !== tracked?.noradId);

  useEffect(() => {
    if (!visible.length) {
      setLockedNoradId(null);
      betterCandidate.current = null;
      return;
    }

    if (!lockedNoradId || !visible.some(link => link.noradId === lockedNoradId)) {
      setLockedNoradId(visible[0].noradId);
      setManualSelection(false);
      lockStartedAt.current = Date.now();
      betterCandidate.current = null;
      return;
    }

    if (manualSelection) return;

    const lockedLink = visible.find(link => link.noradId === lockedNoradId);
    const alternate = visible.find(link => link.noradId !== lockedNoradId);
    if (!lockedLink || !alternate) return;

    if (Date.now() - lockStartedAt.current < 20_000) {
      betterCandidate.current = null;
      return;
    }

    if (alternate.snrDb >= lockedLink.snrDb + 3) {
      if (betterCandidate.current?.noradId !== alternate.noradId) {
        betterCandidate.current = { noradId: alternate.noradId, since: Date.now() };
        return;
      }
      if (Date.now() - betterCandidate.current.since >= 5_000) {
        setLockedNoradId(alternate.noradId);
        lockStartedAt.current = Date.now();
        betterCandidate.current = null;
      }
    } else {
      betterCandidate.current = null;
    }
  }, [visible, lockedNoradId, manualSelection]);

  const trackedRecord = useMemo(
    () => tracked ? records.find(record => String(record.NORAD_CAT_ID ?? '') === tracked.noradId) : undefined,
    [records, tracked?.noradId],
  );

  const historyKey = `${station.latDeg},${station.lonDeg},${tracked?.noradId ?? ''}`;
  const snrHistory = useMetricHistory(tracked?.snrDb ?? null, 60, historyKey);
  const rangeHistory = useMetricHistory(tracked?.rangeKm ?? null, 60, historyKey);
  const dopplerHistory = useMetricHistory(tracked ? tracked.dopplerHz / 1000 : null, 60, historyKey);

  const predictionTick = Math.floor(now.getTime() / 10_000);

  const passSamples = useMemo(() => {
    if (!trackedRecord) return [];
    const start = predictionTick * 10_000;
    return Array.from({ length: 25 }, (_, index) => {
      const seconds = index * 30;
      const link = computeLink(trackedRecord, station, radio, new Date(start + seconds * 1000));
      return { seconds, elevation: link?.elevationDeg ?? 0, snr: link?.snrDb ?? -99 };
    });
  }, [trackedRecord, station, radio, predictionTick]);

  const earthTrack = useMemo(() => {
    if (!trackedRecord) return [];
    const center = predictionTick * 10_000;
    return Array.from({ length: 41 }, (_, index) => {
      const offsetMin = index - 10;