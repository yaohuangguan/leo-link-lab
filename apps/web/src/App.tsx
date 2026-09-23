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

const sections = [
  ['overview', 'Overview'],
  ['link', 'Current link'],
  ['pass', 'Pass & handover'],
  ['metrics', 'Metrics'],
  ['satellites', 'Satellites'],
  ['rf', 'RF model'],
] as const;

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
        setMeta(`${body.returned} sampled · ${body.total} total · ${body.stale ? 'cached snapshot' : 'live cache'}`);
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
        <a className="app-brand" href="#overview" aria-label="LEO Link Lab overview">
          <div className="brand-orbit"><i /><b /></div>
          <div>
            <strong>LEO LINK LAB</strong>
            <span>LIVE SATELLITE NETWORK CONSOLE</span>
          </div>
        </a>

        <nav className="main-nav" aria-label="Page sections">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <div className="live-summary">
          <i className={error ? 'error' : ''} />
          <span>{error ? 'Data error' : `${visible.length} visible · Auckland`}</span>
        </div>
      </header>

      <main className="console-main">
        <section id="overview" className="page-section overview-section">
          <SectionHeading
            kicker="LIVE ORBIT"
            title="See the link before you read the numbers."
            description="The main view is purely spatial: real Earth imagery, the Auckland ground station, visible satellites, orbital paths and the active uplink."
          />
          <SkyPlot satellites={visible.slice(0, 40)} selectedNoradId={best?.noradId} />
        </section>

        <section id="link" className="page-section">
          <SectionHeading
            kicker="CURRENT CONNECTION"
            title="Where the satellite is, and what the link is doing."
            description="The left panel explains the RF link. The globe answers the separate geographic question: what part of Earth the satellite is currently above."
          />
          <div className="two-column-section link-section-grid">
            <CurrentLinkPanel current={best} radio={radio} />
            <EarthTrack current={best} station={station} track={earthTrack} />
          </div>
        </section>

        <section id="pass" className="page-section">
          <SectionHeading
            kicker="NEXT FEW MINUTES"
            title="Pass evolution and handover decision."
            description="Pass prediction shows how elevation changes over time. Handover compares the current link against the strongest alternative."
          />
          <div className="two-column-section">
            <PassTimeline samples={passSamples} minElevationDeg={radio.minElevationDeg} satelliteName={best?.name} />
            <HandoverPanel current={best} candidate={candidate} />
          </div>
        </section>

        <section id="metrics" className="page-section">
          <SectionHeading
            kicker="LIVE TELEMETRY"
            title="Three signals that explain the movement."
            description={best ? `Tracking ${best.name} → Auckland. The charts keep a rolling 60-second history for the currently selected best link.` : 'Waiting for a visible satellite above the elevation mask.'}
          />
          <div className="metrics-three">
            <Sparkline label="Signal-to-noise ratio" unit="dB" values={snrHistory} tone="green" />
            <Sparkline label="Slant range" unit="km" values={rangeHistory} tone="cyan" digits={0} />
            <Sparkline label="Doppler shift" unit="kHz" values={dopplerHistory} tone="amber" />
          </div>
        </section>

        <section id="satellites" className="page-section">
          <SectionHeading
            kicker="VISIBLE CONSTELLATION"
            title="Which satellites can Auckland see right now?"
            description={`${visible.length} satellites clear the current ${radio.minElevationDeg}° elevation mask. The first row is the active best-SNR link.`}
          />
          <section className="panel candidate-table-panel">
            <CandidateTable satellites={visible.slice(0, 14)} />
          </section>
        </section>

        <section id="rf" className="page-section">
          <SectionHeading
            kicker="EDUCATIONAL RF MODEL"
            title="Change the assumptions and watch the link respond."
            description="These controls affect the simulated link budget. Orbital geometry remains driven by the satellite data."
          />
          <section className="panel rf-settings-panel">
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
            <div className="model-note">
              <span>Orbital data</span>
              <strong>{meta}</strong>
              <span>Current time</span>
              <strong>{now.toISOString().replace('T', ' ').slice(0, 19)} UTC</strong>
              {error && <strong className="error-text">{error}</strong>}
            </div>
          </section>
        </section>

        <footer className="console-footer">
          <span>LEO LINK LAB</span>
          <span>Real orbital geometry · educational RF assumptions</span>
        </footer>
      </main>
    </div>
  );
}

function SectionHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <div className="section-heading">
      <p>{kicker}</p>
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
  );
}

function CurrentLinkPanel({ current, radio }: { current?: SatelliteLink; radio: RadioConfig }) {
  const quality = !current ? 'Unavailable' : current.snrDb >= 12 ? 'Excellent' : current.snrDb >= 6 ? 'Good' : current.snrDb >= 2 ? 'Fair' : 'Weak';

  return (
    <section className="panel current-link-card">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">ACTIVE LINK</p>
          <h2>{current?.name ?? 'Searching for a visible satellite'}</h2>
        </div>
        <span className={`connection-pill ${current ? 'connected' : ''}`}><i /> {current ? quality : 'Scanning'}</span>
      </div>

      {current ? (
        <>
          <div className="hero-metric">
            <span>SIGNAL TO NOISE</span>
            <strong>{fmt(current.snrDb)} <small>dB</small></strong>
            <em>{current.linkMarginDb >= 0 ? '+' : ''}{fmt(current.linkMarginDb)} dB margin</em>
          </div>

          <div className="link-facts">
            <Fact label="NORAD ID" value={current.noradId} />
            <Fact label="Elevation" value={`${fmt(current.elevationDeg)}°`} />
            <Fact label="Azimuth" value={`${fmt(current.azimuthDeg, 0)}°`} />
            <Fact label="Slant range" value={`${fmt(current.rangeKm, 0)} km`} />
            <Fact label="Altitude" value={`${fmt(current.altitudeKm, 0)} km`} />
            <Fact label="One-way delay" value={`${fmt(current.delayMs, 2)} ms`} />
            <Fact label="Received power" value={`${fmt(current.receivedPowerDbm, 1)} dBm`} />
            <Fact label="Carrier" value={`${radio.frequencyGHz.toFixed(1)} GHz`} />
          </div>

          <div className="signal-quality">
            <div className="signal-bar"><i style={{ width: `${Math.max(8, Math.min(100, ((current.snrDb + 5) / 25) * 100))}%` }} /></div>
            <div><span>Link quality</span><b>{quality}</b><strong>{current.rangeRateMps < 0 ? 'Approaching' : 'Receding'}</strong></div>
          </div>
        </>
      ) : <p className="empty-copy">No satellite currently clears the selected elevation mask.</p>}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="fact"><span>{label}</span><strong>{value}</strong></div>;
}

function CandidateTable({ satellites }: { satellites: SatelliteLink[] }) {
  return (
    <div className="candidate-table-wrap">
      <table className="candidate-table">
        <thead><tr><th>Satellite</th><th>Elevation</th><th>Azimuth</th><th>Range</th><th>Altitude</th><th>Doppler</th><th>SNR</th><th>Role</th></tr></thead>
        <tbody>
          {satellites.map((satellite, index) => (
            <tr key={satellite.noradId} className={index === 0 ? 'candidate-highlight' : ''}>
              <td><i className="row-dot" />{satellite.name}<small>NORAD {satellite.noradId}</small></td>
              <td>{fmt(satellite.elevationDeg)}°</td>
              <td>{fmt(satellite.azimuthDeg, 0)}°</td>
              <td>{fmt(satellite.rangeKm, 0)} km</td>
              <td>{fmt(satellite.altitudeKm, 0)} km</td>
              <td>{fmt(satellite.dopplerHz / 1000)} kHz</td>
              <td>{fmt(satellite.snrDb)} dB</td>
              <td>{index === 0 ? 'Active link' : index === 1 ? 'Best alternative' : 'Visible'}</td>
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