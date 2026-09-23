import { useEffect, useMemo, useState } from 'react';
import { computeLink } from './orbit';
import SkyPlot from './components/SkyPlot';
import Sparkline from './components/Sparkline';
import HandoverPanel from './components/HandoverPanel';
import { useMetricHistory } from './hooks/useMetricHistory';
import type { OmmRecord, RadioConfig } from './types';

const API = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8791';
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
    .filter((link): link is NonNullable<typeof link> => !!link && link.elevationDeg >= radio.minElevationDeg)
    .sort((a, b) => b.snrDb - a.snrDb), [records, radio, now]);

  const best = visible[0];
  const candidate = visible[1];
  const snrHistory = useMetricHistory(best?.snrDb ?? null);
  const rangeHistory = useMetricHistory(best?.rangeKm ?? null);
  const dopplerHistory = useMetricHistory(best ? best.dopplerHz / 1000 : null);

  const update = (key: keyof RadioConfig, value: number) => {
    setRadio(current => ({ ...current, [key]: value }));
  };

  const linkState = !best
    ? 'SEARCHING'
    : best.linkMarginDb >= 6
      ? 'LOCKED'
      : best.linkMarginDb >= 0
        ? 'MARGINAL'
        : 'WEAK';

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div>
            <b>LEO LINK LAB</b>
            <span>STARLINK-INSPIRED NETWORK CONSOLE</span>
          </div>
        </div>
        <div className="topbar-status">
          <span className="live-pill"><i /> LIVE</span>
          <small>{now.toLocaleTimeString()} · Auckland, NZ</small>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">ORBIT + RF + NETWORK</p>
          <h1>Watch a LEO link<br />move through the sky.</h1>
          <p className="hero-copy">Real orbital elements drive geometry, path loss, received power, SNR, Doppler and delay in real time.</p>
        </div>
        <div className={`link-state ${linkState.toLowerCase()}`}>
          <span>CURRENT STATE</span>
          <strong>{linkState}</strong>
          <small>{best ? `${best.name} · ${fmt(best.elevationDeg)}° elevation` : 'Waiting for a visible satellite'}</small>
        </div>
      </section>

      <section className="metrics">
        <Metric label="CURRENT LINK" value={best?.name || 'No visible link'} detail={best ? `NORAD ${best.noradId}` : `Mask ≥ ${radio.minElevationDeg}°`} />
        <Metric label="SLANT RANGE" value={best ? `${fmt(best.rangeKm, 0)} km` : '—'} detail={best ? `${best.rangeRateMps < 0 ? 'Approaching' : 'Receding'} · ${fmt(Math.abs(best.rangeRateMps) / 1000, 2)} km/s` : 'Searching'} />
        <Metric label="SNR / MARGIN" value={best ? `${fmt(best.snrDb)} dB` : '—'} detail={best ? `${fmt(best.linkMarginDb)} dB link margin` : 'No active link'} />
        <Metric label="PROPAGATION" value={best ? `${fmt(best.delayMs, 2)} ms` : '—'} detail={best ? `${fmt(best.dopplerHz / 1000)} kHz Doppler` : `${radio.frequencyGHz} GHz carrier`} />
      </section>

      <section className="dashboard-grid">
        <SkyPlot satellites={visible.slice(0, 40)} selectedNoradId={best?.noradId} />

        <div className="dashboard-stack">
          <section className="panel current-link-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">ACTIVE CHANNEL</p>
                <h2>Current link</h2>
              </div>
              <span className={`quality-pill ${best && best.snrDb >= 6 ? 'good' : 'warn'}`}>
                {best ? `${fmt(best.snrDb)} dB SNR` : 'NO LINK'}
              </span>
            </div>

            {best ? (
              <>
                <div className="current-satellite">
                  <div>
                    <span>SATELLITE</span>
                    <strong>{best.name}</strong>
                    <small>NORAD {best.noradId}</small>
                  </div>
                  <div className="orbit-badge">
                    <b>{fmt(best.elevationDeg)}°</b>
                    <span>elevation</span>
                  </div>
                </div>

                <div className="link-detail-grid">
                  <Detail label="Azimuth" value={`${fmt(best.azimuthDeg, 0)}°`} />
                  <Detail label="FSPL" value={`${fmt(best.fsplDb, 2)} dB`} />
                  <Detail label="Received power" value={`${fmt(best.receivedPowerDbm, 1)} dBm`} />
                  <Detail label="Noise floor" value={`${fmt(best.noiseDbm, 1)} dBm`} />
                  <Detail label="Shannon bound" value={`${fmt(best.capacityMbps, 0)} Mbps`} />
                  <Detail label="Link margin" value={`${fmt(best.linkMarginDb, 1)} dB`} />
                </div>
              </>
            ) : <p className="empty-state">No satellite currently clears the elevation mask.</p>}
          </section>

          <HandoverPanel current={best} candidate={candidate} />
        </div>
      </section>

      <section className="trend-grid">
        <Sparkline label="SNR" unit="dB" values={snrHistory} tone="green" />
        <Sparkline label="Slant range" unit="km" values={rangeHistory} tone="cyan" digits={0} />
        <Sparkline label="Doppler" unit="kHz" values={dopplerHistory} tone="amber" />
      </section>

      <section className="lower-grid">
        <section className="panel candidates-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">VISIBLE CONSTELLATION</p>
              <h2>Candidate satellites</h2>
            </div>
            <span className="count-pill">{visible.length} above mask</span>
          </div>
          <p className="muted">{meta}{error ? ` · ${error}` : ''}</p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Satellite</th><th>Quality</th><th>El.</th><th>Az.</th><th>Range</th><th>SNR</th><th>Margin</th><th>Doppler</th></tr>
              </thead>
              <tbody>
                {visible.slice(0, 20).map((satellite, index) => (
                  <tr key={satellite.noradId} className={index === 0 ? 'selected-row' : ''}>
                    <td><b>{satellite.name}</b><small>NORAD {satellite.noradId}</small></td>
                    <td><QualityBar value={satellite.snrDb} /></td>
                    <td>{fmt(satellite.elevationDeg)}°</td>
                    <td>{fmt(satellite.azimuthDeg, 0)}°</td>
                    <td>{fmt(satellite.rangeKm, 0)} km</td>
                    <td>{fmt(satellite.snrDb)} dB</td>
                    <td>{fmt(satellite.linkMarginDb)} dB</td>
                    <td>{fmt(satellite.dopplerHz / 1000)} kHz</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel controls">
          <div>
            <p className="eyebrow">SCENARIO INPUTS</p>
            <h2>Radio model</h2>
          </div>
          <div className="controls-grid">
            <Field label="Carrier" suffix="GHz" value={radio.frequencyGHz} step={0.1} set={value => update('frequencyGHz', value)} />
            <Field label="Bandwidth" suffix="MHz" value={radio.bandwidthMHz} set={value => update('bandwidthMHz', value)} />
            <Field label="Tx power" suffix="dBm" value={radio.txPowerDbm} set={value => update('txPowerDbm', value)} />
            <Field label="Tx gain" suffix="dBi" value={radio.txGainDbi} set={value => update('txGainDbi', value)} />
            <Field label="Rx gain" suffix="dBi" value={radio.rxGainDbi} set={value => update('rxGainDbi', value)} />
            <Field label="Noise figure" suffix="dB" value={radio.noiseFigureDb} step={0.1} set={value => update('noiseFigureDb', value)} />
            <Field label="Other loss" suffix="dB" value={radio.otherLossDb} step={0.1} set={value => update('otherLossDb', value)} />
            <Field label="Elevation mask" suffix="°" value={radio.minElevationDeg} set={value => update('minElevationDeg', value)} />
          </div>
          <div className="formula-strip">
            <span>FSPL = 92.45 + 20log₁₀(d km) + 20log₁₀(f GHz)</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="detail"><span>{label}</span><b>{value}</b></div>;
}

function Field({ label, suffix, value, set, step = 1 }: { label: string; suffix: string; value: number; set: (value: number) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div><input type="number" step={step} value={value} onChange={event => set(Number(event.target.value))} /><b>{suffix}</b></div>
    </label>
  );
}

function QualityBar({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(100, ((value + 5) / 25) * 100));
  return <div className="quality-bar"><i style={{ width: `${normalized}%` }} /><span>{value >= 12 ? 'EXCELLENT' : value >= 6 ? 'GOOD' : value >= 2 ? 'FAIR' : 'WEAK'}</span></div>;
}
