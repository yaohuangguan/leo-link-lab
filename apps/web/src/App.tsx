import { useEffect, useMemo, useState } from 'react';
import { computeLink } from './orbit';
import SkyPlot from './components/SkyPlot';
import Sparkline from './components/Sparkline';
import HandoverPanel from './components/HandoverPanel';
import PassTimeline from './components/PassTimeline';
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
            <span>ORBITAL NETWORK CONSOLE</span>
          </div>
        </div>
        <div className="topbar-status">
          <span className="live-pill"><i /> LIVE ORBIT</span>
          <small>{now.toLocaleTimeString()} · Auckland, NZ</small>
        </div>
      </header>

      <section className="mission-header">
        <div>
          <p className="eyebrow">AUCKLAND GROUND SEGMENT / STARLINK-INSPIRED LEO</p>
          <h1>One ground station.<br />A moving constellation.</h1>
        </div>
        <div className={`mission-lock ${linkState.toLowerCase()}`}>
          <span>LINK STATE</span>
          <strong>{linkState}</strong>
          <small>{best ? `${best.name} · ${fmt(best.snrDb)} dB SNR` : 'Scanning visible sky'}</small>
        </div>
      </section>

      <section className="mission-grid">
        <SkyPlot satellites={visible.slice(0, 40)} selectedNoradId={best?.noradId} />

        <div className="mission-stack">
          <section className="panel current-link-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">ACTIVE UPLINK</p>
                <h2>{best?.name ?? 'Searching for link'}</h2>
              </div>
              <span className={`quality-pill ${best && best.snrDb >= 6 ? 'good' : 'warn'}`}>
                {best ? `${fmt(best.elevationDeg)}° EL` : 'NO LOCK'}
              </span>
            </div>

            {best ? (
              <>
                <div className="primary-signal">
                  <div>
                    <span>SIGNAL TO NOISE</span>
                    <strong>{fmt(best.snrDb)}<small>dB</small></strong>
                    <em>{best.linkMarginDb >= 0 ? '+' : ''}{fmt(best.linkMarginDb)} dB margin</em>
                  </div>
                  <div className="signal-orbit">
                    <div className="mini-satellite"><i /><b /><i /></div>
                    <span>{best.rangeRateMps < 0 ? 'APPROACHING' : 'RECEDING'}</span>
                  </div>
                </div>

                <div className="link-route">
                  <div><span>GROUND</span><strong>Auckland</strong></div>
                  <div className="route-beam"><i /><b>12 GHz</b><i /></div>
                  <div><span>SPACE</span><strong>{best.name}</strong></div>
                </div>

                <div className="link-detail-grid compact">
                  <Detail label="Range" value={`${fmt(best.rangeKm, 0)} km`} />
                  <Detail label="Azimuth" value={`${fmt(best.azimuthDeg, 0)}°`} />
                  <Detail label="Doppler" value={`${fmt(best.dopplerHz / 1000)} kHz`} />
                  <Detail label="Delay" value={`${fmt(best.delayMs, 2)} ms`} />
                  <Detail label="Rx power" value={`${fmt(best.receivedPowerDbm, 1)} dBm`} />
                  <Detail label="FSPL" value={`${fmt(best.fsplDb, 1)} dB`} />
                </div>
              </>
            ) : <p className="empty-state">No satellite currently clears the elevation mask.</p>}
          </section>

          <PassTimeline samples={passSamples} minElevationDeg={radio.minElevationDeg} satelliteName={best?.name} />
          <HandoverPanel current={best} candidate={candidate} />
        </div>
      </section>

      <section className="trend-grid">
        <Sparkline label="SNR" unit="dB" values={snrHistory} tone="green" />
        <Sparkline label="Slant range" unit="km" values={rangeHistory} tone="cyan" digits={0} />
        <Sparkline label="Doppler" unit="kHz" values={dopplerHistory} tone="amber" />
      </section>

      <section className="panel constellation-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">NEXT LINKS</p>
            <h2>Constellation candidates</h2>
          </div>
          <span className="count-pill">{visible.length} above {radio.minElevationDeg}° mask</span>
        </div>
        <div className="candidate-rail">
          {visible.slice(0, 5).map((satellite, index) => (
            <article key={satellite.noradId} className={`candidate-card ${index === 0 ? 'connected' : ''}`}>
              <div className="candidate-rank">{index === 0 ? 'LINK' : String(index + 1).padStart(2, '0')}</div>
              <div className="candidate-satellite"><i /><b /><i /></div>
              <strong>{satellite.name}</strong>
              <span>{fmt(satellite.elevationDeg)}° elevation</span>
              <div className="candidate-snr"><b>{fmt(satellite.snrDb)}</b><small>dB SNR</small></div>
              <div className="candidate-meter"><i style={{ width: `${Math.max(4, Math.min(100, ((satellite.snrDb + 5) / 25) * 100))}%` }} /></div>
            </article>
          ))}
        </div>
      </section>

      <section className="lower-grid">
        <section className="panel candidates-panel">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">ENGINEERING DETAIL</p>
              <h2>Visible links</h2>
            </div>
            <span className="data-source">{meta}{error ? ` · ${error}` : ''}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Satellite</th><th>Quality</th><th>El.</th><th>Az.</th><th>Range</th><th>SNR</th><th>Margin</th><th>Doppler</th></tr>
              </thead>
              <tbody>
                {visible.slice(0, 14).map((satellite, index) => (
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
            <p className="eyebrow">SCENARIO CONTROLS</p>
            <h2>RF model</h2>
          </div>
          <div className="controls-grid">
            <Field label="Carrier" suffix="GHz" value={radio.frequencyGHz} step={0.1} set={value => update('frequencyGHz', value)} />
            <Field label="Bandwidth" suffix="MHz" value={radio.bandwidthMHz} set={value => update('bandwidthMHz', value)} />
            <Field label="Elevation mask" suffix="°" value={radio.minElevationDeg} set={value => update('minElevationDeg', value)} />
            <Field label="Noise figure" suffix="dB" value={radio.noiseFigureDb} step={0.1} set={value => update('noiseFigureDb', value)} />
          </div>
          <details className="advanced-controls">
            <summary>Advanced link budget</summary>
            <div className="controls-grid">
              <Field label="Tx power" suffix="dBm" value={radio.txPowerDbm} set={value => update('txPowerDbm', value)} />
              <Field label="Tx gain" suffix="dBi" value={radio.txGainDbi} set={value => update('txGainDbi', value)} />
              <Field label="Rx gain" suffix="dBi" value={radio.rxGainDbi} set={value => update('rxGainDbi', value)} />
              <Field label="Other loss" suffix="dB" value={radio.otherLossDb} step={0.1} set={value => update('otherLossDb', value)} />
            </div>
          </details>
          <div className="formula-strip">FSPL = 92.45 + 20log₁₀(d km) + 20log₁₀(f GHz)</div>
        </aside>
      </section>
    </main>
  );
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