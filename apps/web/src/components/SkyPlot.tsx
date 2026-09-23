import type { SatelliteLink } from '../types';

type Props = {
  satellites: SatelliteLink[];
  selectedNoradId?: string;
};

const SIZE = 520;
const CENTER = SIZE / 2;
const EDGE = SIZE / 2 - 34;

function polarToCartesian(azimuthDeg: number, elevationDeg: number) {
  const radius = ((90 - Math.max(0, elevationDeg)) / 90) * EDGE;
  const angle = (azimuthDeg - 90) * Math.PI / 180;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function tone(snr: number) {
  if (snr >= 12) return 'excellent';
  if (snr >= 6) return 'good';
  if (snr >= 2) return 'fair';
  return 'weak';
}

export default function SkyPlot({ satellites, selectedNoradId }: Props) {
  return (
    <section className="panel sky-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">LIVE SKY VIEW</p>
          <h2>Satellite geometry</h2>
        </div>
        <span className="live-pill"><i /> Auckland</span>
      </div>

      <div className="sky-stage">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="skyplot" role="img" aria-label="Visible satellites over Auckland">
          <defs>
            <radialGradient id="skyGlow">
              <stop offset="0%" stopColor="#17384b" stopOpacity=".9" />
              <stop offset="68%" stopColor="#0c2231" stopOpacity=".36" />
              <stop offset="100%" stopColor="#07141e" stopOpacity=".06" />
            </radialGradient>
          </defs>

          <circle cx={CENTER} cy={CENTER} r={EDGE} fill="url(#skyGlow)" className="sky-boundary" />
          {[30, 60].map(elevation => {
            const r = ((90 - elevation) / 90) * EDGE;
            return <circle key={elevation} cx={CENTER} cy={CENTER} r={r} className="sky-ring" />;
          })}
          <line x1={CENTER} y1={34} x2={CENTER} y2={SIZE - 34} className="sky-axis" />
          <line x1={34} y1={CENTER} x2={SIZE - 34} y2={CENTER} className="sky-axis" />
          <text x={CENTER} y={25} textAnchor="middle" className="sky-label">N</text>
          <text x={CENTER} y={SIZE - 10} textAnchor="middle" className="sky-label">S</text>
          <text x={SIZE - 14} y={CENTER + 4} textAnchor="middle" className="sky-label">E</text>
          <text x={14} y={CENTER + 4} textAnchor="middle" className="sky-label">W</text>

          <g className="observer-mark">
            <circle cx={CENTER} cy={CENTER} r="14" />
            <circle cx={CENTER} cy={CENTER} r="4" />
          </g>

          {satellites.map(sat => {
            const { x, y } = polarToCartesian(sat.azimuthDeg, sat.elevationDeg);
            const active = sat.noradId === selectedNoradId;
            return (
              <g key={sat.noradId} className={`sat-dot ${tone(sat.snrDb)} ${active ? 'active' : ''}`}>
                {active && <circle cx={x} cy={y} r="16" className="pulse-ring" />}
                <circle cx={x} cy={y} r={active ? 7 : 4.6} className="sat-core" />
                {active && (
                  <>
                    <line x1={CENTER} y1={CENTER} x2={x} y2={y} className="link-line" />
                    <text x={x + 13} y={y - 13} className="sat-name">{sat.name}</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        <div className="sky-legend">
          <span><i className="excellent" /> ≥12 dB</span>
          <span><i className="good" /> ≥6 dB</span>
          <span><i className="fair" /> ≥2 dB</span>
          <span><i className="weak" /> weak</span>
        </div>
      </div>
    </section>
  );
}