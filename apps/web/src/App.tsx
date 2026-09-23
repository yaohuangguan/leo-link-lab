import { useEffect, useMemo, useState } from 'react';
import { computeLink } from './orbit';
import SkyPlot from './components/SkyPlot';
import EarthTrack from './components/EarthTrack';
import Sparkline from './components/Sparkline';
import HandoverPanel from './components/HandoverPanel';
import PassTimeline from './components/PassTimeline';
import { useMetricHistory } from './hooks/useMetricHistory';
import type { OmmRecord, RadioConfig, SatelliteLink } from './types';

const API = import.meta.env.VITE_API_BASE_URL || '';
const station = { latDeg: -36.8485, lonDeg: 174.7633 };
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

export default function App() {
  const [records, setRecords] = useState<OmmRecord[]>([]);
  const [radio, setRadio] = useState(initialRadio);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [meta, setMeta] = useState('Loading orbital data…');

  useEffect(() => {
    fetch(`${API}/api/starlink?limit=900`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        return body;
      })
      .then(body => {
        setRecords(body.satellites || []);
        setMeta(`${body.returned} sampled · ${body.total} total · ${body.stale ? 'fallback/cache' : 'live cache'}`);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => records
    .map(record => computeLink(record, station, radio, now))
    .filter((link): link is SatelliteLink => !!link && link.elevationDeg >= radio.minElevationDeg)
    .sort((a, b) => b.snrDb - a.snrDb), [records, radio, now]);

  const best = visible[0];
  const candidate = visible[1];
  const snrHistory = useMetricHistory(best?.snrDb ?? null);
  const rangeHistory = useMetricHistory(best?.rangeKm ?? null);
  const dopplerHistory = useMetricHistory(best ? best.dopplerHz / 1000 : null);

  const activeRecord = useMemo(
    () => best ? records.find(record => String(record.NORAD_CAT_ID ?? '') === best.noradId) : undefined,
    [records, best?.noradId],
  );

  const predictionTick = Math.floor(now.getTime() / 10_000);

  const passSamples = useMemo(() => {
    if (!activeRecord) return [];
    const start = predictionTick * 10_000;
    return Array.from({ length: 25 }, (_, index) => {
      const seconds = index * 30;
      const link = computeLink(activeRecord, station, radio, new Date(start + seconds * 1000));
      return { seconds, elevation: link?.elevationDeg ?? 0, snr: link?.snrDb ?? -99 };
    });
  }, [activeRecord, radio, predictionTick]);

  const earthTrack = useMemo(() => {
    if (!activeRecord) return [];
    const center = predictionTick * 10_000;
    return Array.from({ length: 41 }, (_, index) => {
      const offsetMin = index - 10;
      const link = computeLink(activeRecord, station, radio, new Date(center + offsetMin * 60_000));
      return link ? { latDeg: link.subLatDeg, lonDeg: link.subLonDeg, offsetMin } : null;
    }).filter((point): point is { latDeg: number; lonDeg: number; offsetMin: number } => point !== null);
  }, [activeRecord, radio, predictionTick]);

  const update = (key: keyof RadioConfig, value: number) => {
    setRadio(current => ({ ...current, [key]: value }));
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="brand-orbit"><i /><b /></div>
          <div>
            <strong>LEO LINK LAB</strong>
            <span>LIVE SATELLITE NETWORK CONSOLE</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="Primary">
          {['Live','Missions','Network','Analytics','Coverage','Satellites','Settings'].map(item => (
            <button key={item} className={item === 'Live' ? 'active' : ''}>{item}</button>
          ))}
        </nav>

        <div className="header-actions">
          <div className="search-box">⌕ <span>Search satellite, location, or ID…</span></div>
          <div className="status-dot" title="System online" />
          <div className="avatar">SY</div>
        </div>
      </header>

      <main className="console-main">
        <section className="hero-console-grid">
          <SkyPlot satellites={visible.slice(0, 40)} selectedNoradId={best?.noradId} />

          <div className="right-console-grid">
            <CurrentLinkPanel current={best} radio={radio} />
            <PassTimeline samples={passSamples} minElevationDeg={radio.minElevationDeg} satelliteName={best?.name} />
            <HandoverPanel current={best} candidate={candidate} />
            <EarthTrack current={best} station={station} track={earthTrack} />
          </div>
        </section>

        <section className="lower-console-grid">
          <section className="panel metrics-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">LINK METRICS</p>
                <h2>{best ? `${best.name} → Auckland` : 'No active link'}</h2>
              </div>
              <div className="time-range"><span>1m</span><span className="active">5m</span><span>30m</span><span>1h</span></div>
            </div>
            <div className="metrics-three">
              <Sparkline label="SNR" unit="dB" values={snrHistory} tone="green" />
              <Sparkline label="Range" unit="km" values={rangeHistory} tone="cyan" digits={0} />
              <Sparkline label="Doppler" unit="kHz" values={dopplerHistory} tone="amber" />
            </div>
          </section>

          <section className="panel candidate-table-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">CANDIDATE SATELLITES</p>
                <h2>Visible links</h2>
              </div>
              <span className="data-source">{visible.length} visible</span>
            </div>
            <CandidateTable satellites={visible.slice(0, 7)} />
          </section>
        </section>

        <section className="panel rf-settings-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">SCENARIO CONTROLS</p>
              <h2>RF model</h2>
            </div>
            <span className="data-source">{meta}{error ? ` · ${error}` : ''}</span>
          </div>

          <div className="rf-controls-row">
            <Field label="Carrier" suffix="GHz" value={radio.frequencyGHz} step={0.1} set={value => update('frequencyGHz', value)} />
            <Field label="Bandwidth" suffix="MHz" value={radio.bandwidthMHz} set={value => update('bandwidthMHz', value)} />
            <Field label="Elevation mask" suffix="°" value={radio.minElevationDeg} set={value => update('minElevationDeg', value)} />
            <Field label="Noise figure" suffix="dB" value={radio.noiseFigureDb} step={0.1} set={value => update('noiseFigureDb', value)} />
            <Field label="Tx power" suffix="dBm" value={radio.txPowerDbm} set={value => update('txPowerDbm', value)} />
            <Field label="Tx gain" suffix="dBi" value={radio.txGainDbi} set={value => update('txGainDbi', value)} />
            <Field label="Rx gain" suffix="dBi" value={radio.rxGainDbi} set={value => update('rxGainDbi', value)} />
            <Field label="Other loss" suffix="dB" value={radio.otherLossDb} step={0.1} set={value => update('otherLossDb', value)} />
          </div>
        </section>

        <footer className="console-footer">
          <span>LEO LINK LAB · v1.3.0</span>
          <span className="footer-online"><i /> All systems operational</span>
          <span className="footer-motto">CONNECTING A BRIGHTER TOMORROW</span>
          <span>{now.toISOString().replace('T',' ').slice(0,19)} UTC</span>
        </footer>
      </main>
    </div>
  );
}

function CurrentLinkPanel({ current, radio }: { current?: SatelliteLink; radio: RadioConfig }) {
  return (
    <section className="panel current-link-card">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">CURRENT LINK</p>
          <h2>{current?.name ?? 'Searching'}</h2>
        </div>
        <span className={`connection-pill ${current ? 'connected' : ''}`}><i /> {current ? 'Connected' : 'Scanning'}</span>
      </div>

      <div className="current-link-body">
        <div className="link-kv">
          <div><span>Satellite</span><b>{current?.name ?? '—'}</b></div>
          <div><span>Beam</span><b>AUK-1</b></div>
          <div><span>Mode</span><b>Ka-Band</b></div>
          <div><span>Carrier</span><b>{radio.frequencyGHz.toFixed(1)} GHz</b></div>
          <div><span>Latency</span><b>{current ? `${current.delayMs.toFixed(1)} ms` : '—'}</b></div>
          <div><span>Altitude</span><b>{current ? `${current.altitudeKm.toFixed(0)} km` : '—'}</b></div>
        </div>

        <div className="link-satellite-orbit">
          <div className="link-satellite-glyph"><i /><b /><i /></div>
          <span>{current ? `${current.elevationDeg.toFixed(1)}° EL` : 'NO LOCK'}</span>
        </div>
      </div>

      <div className="signal-quality">
        <div className="signal-bar"><i style={{ width: `${current ? Math.max(8, Math.min(100, ((current.snrDb + 5) / 25) * 100)) : 0}%` }} /></div>
        <div><span>Signal Quality</span><b>{current ? current.snrDb >= 12 ? 'Excellent' : current.snrDb >= 6 ? 'Good' : 'Marginal' : 'Unavailable'}</b><strong>{current ? `${current.receivedPowerDbm.toFixed(0)} dBm` : '—'}</strong></div>
      </div>
    </section>
  );
}

function CandidateTable({ satellites }: { satellites: SatelliteLink[] }) {
  return (
    <div className="candidate-table-wrap">
      <table className="candidate-table">
        <thead><tr><th>Satellite</th><th>Elevation</th><th>Azimuth</th><th>Range</th><th>Doppler</th><th>SNR</th><th>Status</th></tr></thead>
        <tbody>
          {satellites.map((satellite, index) => (
            <tr key={satellite.noradId} className={index === 0 ? 'candidate-highlight' : ''}>
              <td><i className="row-dot" />{satellite.name}</td>
              <td>{fmt(satellite.elevationDeg)}°</td>
              <td>{fmt(satellite.azimuthDeg, 0)}°</td>
              <td>{fmt(satellite.rangeKm, 0)} km</td>
              <td>{fmt(satellite.dopplerHz / 1000)} kHz</td>
              <td>{fmt(satellite.snrDb)} dB</td>
              <td>{index <= 1 ? 'Candidate' : 'Standby'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, suffix, value, set, step = 1 }: { label: string; suffix: string; value: number; set: (value: number) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div><input type="number" step={step} value={value} onChange={event => set(Number(event.target.value))} /><b>{suffix}</b></div>
    </label>
  );
}