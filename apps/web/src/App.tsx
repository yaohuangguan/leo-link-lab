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
  ['overview', 'Sky view'],
  ['link', 'Current link'],
  ['budget', 'Link budget'],
  ['pass', 'Pass & handover'],
  ['metrics', 'Metrics'],
  ['satellites', 'Satellites'],
  ['rf', 'RF model'],
  ['settings', 'Settings'],
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

    fetch(`${API}/api/reverse-geocode?lat=${station.latDeg}&lon=${station.lonDeg}&lang=${language}`, {
      signal: controller.signal,
    })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        return body;
      })
      .then(body => {
        setStation(previous => {
          if (previous.latDeg !== station.latDeg || previous.lonDeg !== station.lonDeg) return previous;
          return {
            ...previous,
            label: body.label || previous.label,
            locale: language,
          };
        });
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      });

    return () => controller.abort();
  }, [language, station.latDeg, station.lonDeg, station.locale]);

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
      const link = computeLink(trackedRecord, station, radio, new Date(center + offsetMin * 60_000));
      return link ? { latDeg: link.subLatDeg, lonDeg: link.subLonDeg, offsetMin } : null;
    }).filter((point): point is { latDeg: number; lonDeg: number; offsetMin: number } => point !== null);
  }, [trackedRecord, station, radio, predictionTick]);

  const skyTrack = useMemo(() => {
    if (!trackedRecord) return [];
    const center = predictionTick * 10_000;
    return Array.from({ length: 25 }, (_, index) => {
      const seconds = -120 + index * 30;
      const link = computeLink(trackedRecord, station, radio, new Date(center + seconds * 1000));
      return link ? { azimuthDeg: link.azimuthDeg, elevationDeg: link.elevationDeg, seconds } : null;
    }).filter((point): point is { azimuthDeg: number; elevationDeg: number; seconds: number } => point !== null);
  }, [trackedRecord, station, radio, predictionTick]);

  const update = (key: keyof RadioConfig, value: number) => {
    setRadio(previous => ({ ...previous, [key]: value }));
  };

  const pinSatellite = (noradId: string, scrollToSky = true) => {
    setLockedNoradId(noradId);
    setManualSelection(true);
    lockStartedAt.current = Date.now();
    betterCandidate.current = null;
    if (scrollToSky) document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' });
  };

  const returnToAuto = () => {
    setManualSelection(false);
    setLockedNoradId(bestNow?.noradId ?? null);
    lockStartedAt.current = Date.now();
    betterCandidate.current = null;
  };

  const placeShort = station.label.split(/[,，]/)[0];

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="app-brand" href="#overview" aria-label="LEO Link Lab">
          <div className="brand-orbit"><i /><b /></div>
          <div><strong>LEO LINK LAB</strong><span>{t('GLOBAL LEO SKY & LINK LAB')}</span></div>
        </a>
        <nav className="main-nav" aria-label="Page sections">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{t(label)}</a>)}
        </nav>
        <div className="live-summary">
          <i className={error ? 'error' : ''} />
          <span>{error ? t('Data error') : t('{count} visible · {place}', { count: visible.length, place: placeShort })}</span>
        </div>
      </header>

      <main className="console-main">
        <section id="overview" className="page-section overview-section">
          <SectionHeading
            kicker={t('GLOBAL OBSERVER')}
            title={t('Which satellites can you see from {place}?', { place: placeShort })}
            description={t('Choose any observer location on Earth. The URL updates with latitude, longitude and place name, so the exact view can be refreshed, bookmarked or shared.')}
          />
          <ObserverPicker apiBase={API} location={station} onChange={setStation} />
          <div className="tracking-toolbar">
            <div>
              <span>{t('TRACKED SATELLITE')}</span>
              <strong>{tracked?.name ?? t('Searching…')}</strong>
              <small>{manualSelection ? t('Pinned manually — automatic handover paused') : t('Auto tracking — minimum 20 s hold + 3 dB / 5 s handover rule')}</small>
            </div>
            {manualSelection && <button type="button" onClick={returnToAuto}>{t('Return to auto tracking')}</button>}
          </div>
          <SkyPlot current={tracked} track={skyTrack} locationLabel={station.label} />
        </section>

        <section id="link" className="page-section">
          <SectionHeading
            kicker={t('CURRENT CONNECTION')}
            title={t('One tracked satellite, two different spatial views.')}
            description={t("Current Link explains the radio connection. The globe separately shows the satellite's subpoint on Earth relative to the selected observer.")}
          />
          <div className="two-column-section link-section-grid">
            <CurrentLinkPanel current={tracked} radio={radio} manualSelection={manualSelection} />
            <EarthTrack
              current={tracked}
              station={station}
              stationLabel={station.label}
              track={earthTrack}
              visible={visible}
              onSelectSatellite={noradId => pinSatellite(noradId, false)}
              apiBase={API}
            />
          </div>
        </section>

        <section id="budget" className="page-section">
          <SectionHeading
            kicker={t('SIGNAL JOURNEY')}
            title={t('Where does the signal power go?')}
            description={t('Follow the live link budget from transmitter power through path loss to received power, noise floor, SNR and final link margin.')}
          />
          <LinkBudgetPanel current={tracked} radio={radio} receiverLabel={placeShort} />
        </section>

        <section id="pass" className="page-section">
          <SectionHeading
            kicker={t('PASS & HANDOVER')}
            title={t('Keep the satellite stable long enough to understand it.')}
            description={t('The tracked satellite is held for at least 20 seconds. Automatic handover requires another satellite to be 3 dB better for 5 continuous seconds.')}
          />
          <div className="two-column-section">
            <PassTimeline samples={passSamples} minElevationDeg={radio.minElevationDeg} satelliteName={tracked?.name} />
            <HandoverPanel current={tracked} candidate={candidate} />
          </div>
        </section>

        <section id="metrics" className="page-section">
          <SectionHeading
            kicker={t('LIVE TELEMETRY')}
            title={t('How the tracked satellite changes over time.')}
            description={tracked
              ? t('Tracking {satellite} from {place}. Histories reset when you change observer or satellite.', { satellite: tracked.name, place: station.label })
              : t('Waiting for a visible satellite.')}
          />
          <div className="metrics-three">
            <Sparkline label="Signal-to-noise ratio" unit="dB" values={snrHistory} tone="green" />
            <Sparkline label="Slant range" unit="km" values={rangeHistory} tone="cyan" digits={0} />
            <Sparkline label="Doppler shift" unit="kHz" values={dopplerHistory} tone="amber" />
          </div>
        </section>

        <section id="satellites" className="page-section">
          <SectionHeading
            kicker={t('VISIBLE CONSTELLATION')}
            title={t('Satellites above {place} now', { place: placeShort })}
            description={t(
              '{count} sampled Starlink satellites clear the {mask}° elevation mask. Click any satellite name to pin it and inspect it without automatic switching.',
              { count: visible.length, mask: radio.minElevationDeg },
            )}
          />
          <section className="panel candidate-table-panel">
            <CandidateTable
              satellites={visible.slice(0, 18)}
              currentNoradId={tracked?.noradId}
              bestNoradId={bestNow?.noradId}
              manualSelection={manualSelection}
              onSelect={pinSatellite}
            />
          </section>
        </section>

        <section id="rf" className="page-section">
          <SectionHeading
            kicker={t('EDUCATIONAL RF MODEL')}
            title={t('Change the assumptions and watch the link respond.')}
            description={t('RF controls affect the simulated link budget. Observer location changes geometry; orbital positions remain driven by CelesTrak data.')}
          />
          <section className="panel rf-settings-panel">
            <div className="rf-controls-row">
              <Field label={t('Carrier')} suffix="GHz" value={radio.frequencyGHz} step={0.1} set={value => update('frequencyGHz', value)} />
              <Field label={t('Bandwidth')} suffix="MHz" value={radio.bandwidthMHz} set={value => update('bandwidthMHz', value)} />
              <Field label={t('Elevation mask')} suffix="°" value={radio.minElevationDeg} set={value => update('minElevationDeg', value)} />
              <Field label={t('Noise figure')} suffix="dB" value={radio.noiseFigureDb} step={0.1} set={value => update('noiseFigureDb', value)} />
              <Field label={t('Tx power')} suffix="dBm" value={radio.txPowerDbm} set={value => update('txPowerDbm', value)} />
              <Field label={t('Tx gain')} suffix="dBi" value={radio.txGainDbi} set={value => update('txGainDbi', value)} />
              <Field label={t('Rx gain')} suffix="dBi" value={radio.rxGainDbi} set={value => update('rxGainDbi', value)} />
              <Field label={t('Other loss')} suffix="dB" value={radio.otherLossDb} step={0.1} set={value => update('otherLossDb', value)} />
            </div>
            <div className="model-note">
              <span>{t('Orbital data')}</span>
              <strong>{meta.loaded ? `${meta.returned} sampled · ${meta.total} total · ${meta.stale ? 'cached snapshot' : 'live cache'}` : '—'}</strong>
              <span>{t('Current time')}</span>
              <strong>{now.toISOString().replace('T', ' ').slice(0, 19)} UTC</strong>
              {error && <strong className="error-text">{error}</strong>}
            </div>
          </section>
        </section>

        <section id="settings" className="page-section">
          <SectionHeading
            kicker={t('SETTINGS')}
            title={t('Language')}
            description={t('Choose the interface language. This preference is saved in this browser.')}
          />
          <section className="panel settings-panel">
            <div className="setting-row">
              <div>
                <span>{t('Interface language')}</span>
                <strong>{language === 'zh' ? '中文' : 'English'}</strong>
              </div>
              <div className="language-toggle" role="group" aria-label={t('Interface language')}>
                <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>{t('English')}</button>
                <button type="button" className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>{t('中文')}</button>
              </div>
            </div>
          </section>
        </section>

        <footer className="console-footer">
          <span>LEO LINK LAB</span>
          <span>{t('Real orbital geometry · educational RF assumptions')}</span>
        </footer>
      </main>
    </div>
  );
}

function SectionHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div className="section-heading"><p>{kicker}</p><h1>{title}</h1><span>{description}</span></div>;
}

function CurrentLinkPanel({ current, radio, manualSelection }: { current?: SatelliteLink; radio: RadioConfig; manualSelection: boolean }) {
  const { t } = useI18n();
  const qualityKey = !current ? 'Unavailable' : current.snrDb >= 12 ? 'Excellent' : current.snrDb >= 6 ? 'Good' : current.snrDb >= 2 ? 'Fair' : 'Weak';
  const mode = manualSelection ? t('Pinned') : t('Auto');

  return (
    <section className="panel current-link-card">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">{t('TRACKED LINK · {mode}', { mode: mode.toUpperCase() })}</p>
          <h2>{current?.name ?? t('Searching for a visible satellite')}</h2>
        </div>
        <span className={`connection-pill ${current ? 'connected' : ''}`}><i /> {current ? t(qualityKey) : t('Scanning')}</span>
      </div>

      {current ? <>
        <div className="hero-metric">
          <span>{t('SIGNAL TO NOISE')}</span>
          <strong>{fmt(current.snrDb)} <small>dB</small></strong>
          <em>{t('{margin} dB margin', { margin: `${current.linkMarginDb >= 0 ? '+' : ''}${fmt(current.linkMarginDb)}` })}</em>
        </div>
        <div className="link-facts">
          <Fact label={t('NORAD ID')} value={current.noradId} />
          <Fact label={t('Elevation')} value={`${fmt(current.elevationDeg)}°`} />
          <Fact label={t('Azimuth')} value={`${fmt(current.azimuthDeg, 0)}°`} />
          <Fact label={t('Slant range')} value={`${fmt(current.rangeKm, 0)} km`} />
          <Fact label={t('Altitude')} value={`${fmt(current.altitudeKm, 0)} km`} />
          <Fact label={t('One-way delay')} value={`${fmt(current.delayMs, 2)} ms`} />
          <Fact label={t('Received power')} value={`${fmt(current.receivedPowerDbm, 1)} dBm`} />
          <Fact label={t('Carrier')} value={`${radio.frequencyGHz.toFixed(1)} GHz`} />
        </div>
        <div className="signal-quality">
          <div className="signal-bar"><i style={{ width: `${Math.max(8, Math.min(100, ((current.snrDb + 5) / 25) * 100))}%` }} /></div>
          <div>
            <span>{t('Link quality')}</span>
            <b>{t(qualityKey)}</b>
            <strong>{current.rangeRateMps < 0 ? t('Approaching') : t('Receding')}</strong>
          </div>
        </div>
      </> : <p className="empty-copy">{t('No satellite currently clears the selected elevation mask.')}</p>}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="fact"><span>{label}</span><strong>{value}</strong></div>;
}

function CandidateTable({ satellites, currentNoradId, bestNoradId, manualSelection, onSelect }: {
  satellites: SatelliteLink[];
  currentNoradId?: string;
  bestNoradId?: string;
  manualSelection: boolean;
  onSelect: (noradId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="candidate-table-wrap">
      <table className="candidate-table">
        <thead>
          <tr>
            <th>{t('Satellite')}</th><th>{t('Elevation')}</th><th>{t('Azimuth')}</th><th>{t('Range')}</th>
            <th>{t('Altitude')}</th><th>{t('Doppler')}</th><th>{t('SNR')}</th><th>{t('Status')}</th>
          </tr>
        </thead>
        <tbody>
          {satellites.map(satellite => {
            const isCurrent = satellite.noradId === currentNoradId;
            const isBest = satellite.noradId === bestNoradId;
            const status = isCurrent ? (manualSelection ? t('Pinned') : t('Tracked')) : isBest ? t('Best now') : t('Visible');

            return (
              <tr key={satellite.noradId} className={isCurrent ? 'candidate-highlight' : ''}>
                <td>
                  <button className="satellite-select" type="button" onClick={() => onSelect(satellite.noradId)}>
                    <i className="row-dot" />{satellite.name}<small>NORAD {satellite.noradId}</small>
                  </button>
                </td>
                <td>{fmt(satellite.elevationDeg)}°</td>
                <td>{fmt(satellite.azimuthDeg, 0)}°</td>
                <td>{fmt(satellite.rangeKm, 0)} km</td>
                <td>{fmt(satellite.altitudeKm, 0)} km</td>
                <td>{fmt(satellite.dopplerHz / 1000)} kHz</td>
                <td>{fmt(satellite.snrDb)} dB</td>
                <td>{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, suffix, value, set, step = 1 }: { label: string; suffix: string; value: number; set: (value: number) => void; step?: number }) {
  return <label className="field"><span>{label}</span><div><input type="number" step={step} value={value} onChange={event => set(Number(event.target.value))} /><b>{suffix}</b></div></label>;
}
