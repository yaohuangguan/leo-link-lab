import { useEffect, useMemo, useState } from 'react';
import { computeLink } from './orbit';
import type { OmmRecord, RadioConfig } from './types';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
const station = { latDeg: -36.8485, lonDeg: 174.7633 };
const initialRadio: RadioConfig = {
  frequencyGHz: 12, bandwidthMHz: 100, txPowerDbm: 30,
  txGainDbi: 35, rxGainDbi: 33, noiseFigureDb: 3,
  otherLossDb: 3, requiredSnrDb: 5, minElevationDeg: 10,
};

const fmt = (n: number, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : '—';

export default function App() {
  const [records, setRecords] = useState<OmmRecord[]>([]);
  const [radio, setRadio] = useState(initialRadio);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [meta, setMeta] = useState('Loading CelesTrak Starlink GP data…');

  useEffect(() => {
    fetch(`${API}/api/starlink?limit=900`)
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        return body;
      })
      .then(body => {
        setRecords(body.satellites || []);
        setMeta(`${body.returned} sampled / ${body.total} Starlink records`);
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => records
    .map(r => computeLink(r, station, radio, now))
    .filter((x): x is NonNullable<typeof x> => !!x && x.elevationDeg >= radio.minElevationDeg)
    .sort((a, b) => b.snrDb - a.snrDb), [records, radio, now]);

  const best = visible[0];
  const update = (key: keyof RadioConfig, value: number) => setRadio(r => ({ ...r, [key]: value }));

  return <main>
    <header>
      <div><b>LEO LINK LAB</b><span>α</span></div>
      <small>{now.toLocaleTimeString()} · Auckland ground station</small>
    </header>

    <section className="hero">
      <p className="eyebrow">STARLINK / ORBIT + RF</p>
      <h1>See the wireless link<br/>move through the sky.</h1>
      <p>Real orbital elements drive slant range, FSPL, received power, noise floor, SNR, Doppler shift and propagation delay.</p>
    </section>

    <section className="metrics">
      <Card label="BEST LINK" value={best?.name || 'No visible link'} detail={best ? `NORAD ${best.noradId} · El ${fmt(best.elevationDeg)}°` : `Mask ≥ ${radio.minElevationDeg}°`} />
      <Card label="SLANT RANGE" value={best ? `${fmt(best.rangeKm,0)} km` : '—'} detail={best ? `${best.rangeRateMps < 0 ? 'Approaching' : 'Receding'} ${fmt(Math.abs(best.rangeRateMps)/1000,2)} km/s` : 'Waiting for pass'} />
      <Card label="SNR / MARGIN" value={best ? `${fmt(best.snrDb)} dB` : '—'} detail={best ? `${fmt(best.linkMarginDb)} dB margin` : 'No link'} />
      <Card label="DOPPLER" value={best ? `${fmt(best.dopplerHz/1000)} kHz` : '—'} detail={`${radio.frequencyGHz} GHz carrier`} />
    </section>

    <section className="grid">
      <div className="panel">
        <h2>Visible candidates</h2>
        <p className="muted">{meta}{error ? ` · ${error}` : ''}</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Satellite</th><th>El.</th><th>Az.</th><th>Range</th><th>FSPL</th><th>Pr</th><th>SNR</th><th>Doppler</th><th>Delay</th></tr></thead>
          <tbody>{visible.slice(0, 20).map(s => <tr key={s.noradId}>
            <td>{s.name}</td><td>{fmt(s.elevationDeg)}°</td><td>{fmt(s.azimuthDeg,0)}°</td>
            <td>{fmt(s.rangeKm,0)} km</td><td>{fmt(s.fsplDb)} dB</td><td>{fmt(s.receivedPowerDbm)} dBm</td>
            <td>{fmt(s.snrDb)} dB</td><td>{fmt(s.dopplerHz/1000)} kHz</td><td>{fmt(s.delayMs,2)} ms</td>
          </tr>)}</tbody>
        </table></div>
      </div>

      <aside className="panel controls">
        <h2>Radio model</h2>
        <Field label="Carrier GHz" value={radio.frequencyGHz} step={0.1} set={v => update('frequencyGHz', v)} />
        <Field label="Bandwidth MHz" value={radio.bandwidthMHz} set={v => update('bandwidthMHz', v)} />
        <Field label="Tx power dBm" value={radio.txPowerDbm} set={v => update('txPowerDbm', v)} />
        <Field label="Tx gain dBi" value={radio.txGainDbi} set={v => update('txGainDbi', v)} />
        <Field label="Rx gain dBi" value={radio.rxGainDbi} set={v => update('rxGainDbi', v)} />
        <Field label="Noise figure dB" value={radio.noiseFigureDb} step={0.1} set={v => update('noiseFigureDb', v)} />
        <Field label="Other loss dB" value={radio.otherLossDb} step={0.1} set={v => update('otherLossDb', v)} />
        <Field label="Elevation mask °" value={radio.minElevationDeg} set={v => update('minElevationDeg', v)} />
        {best && <div className="equations">
          <div><span>FSPL</span><b>{fmt(best.fsplDb,2)} dB</b></div>
          <div><span>Noise floor</span><b>{fmt(best.noiseDbm,2)} dBm</b></div>
          <div><span>Shannon bound</span><b>{fmt(best.capacityMbps,0)} Mbps</b></div>
        </div>}
      </aside>
    </section>
  </main>;
}

function Card({label,value,detail}:{label:string;value:string;detail:string}) {
  return <div className="card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Field({label,value,set,step=1}:{label:string;value:number;set:(v:number)=>void;step?:number}) {
  return <label><span>{label}</span><input type="number" step={step} value={value} onChange={e=>set(Number(e.target.value))}/></label>;
}