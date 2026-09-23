import type { SatelliteLink } from '../types';

type Props = {
  satellites: SatelliteLink[];
  selectedNoradId?: string;
};

const WIDTH = 920;
const HEIGHT = 560;
const HORIZON = 455;
const GROUND_X = 455;
const GROUND_Y = 463;

const stars = Array.from({ length: 92 }, (_, index) => ({
  x: (index * 83 + 37) % WIDTH,
  y: (index * 47 + 29) % 360,
  r: index % 7 === 0 ? 1.6 : index % 3 === 0 ? 1.1 : .7,
  opacity: .22 + ((index * 17) % 55) / 100,
}));

function projectSatellite(satellite: SatelliteLink) {
  const x = 62 + (satellite.azimuthDeg / 360) * (WIDTH - 124);
  const elevation = Math.max(0, Math.min(90, satellite.elevationDeg));
  const y = HORIZON - 48 - Math.pow(elevation / 90, .78) * 330;
  return { x, y };
}

function signalTone(snr: number) {
  if (snr >= 12) return 'excellent';
  if (snr >= 6) return 'good';
  if (snr >= 2) return 'fair';
  return 'weak';
}

function SatelliteGlyph({ x, y, active, tone }: { x: number; y: number; active: boolean; tone: string }) {
  const scale = active ? 1.08 : .72;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className={`orbital-satellite ${tone} ${active ? 'active' : ''}`}>
      {active && <circle r="24" className="satellite-halo" />}
      <rect x="-9" y="-7" width="18" height="14" rx="3" className="satellite-body" />
      <rect x="-31" y="-5" width="18" height="10" rx="1.5" className="solar-panel" />
      <rect x="13" y="-5" width="18" height="10" rx="1.5" className="solar-panel" />
      <line x1="-13" y1="0" x2="-9" y2="0" className="satellite-arm" />
      <line x1="9" y1="0" x2="13" y2="0" className="satellite-arm" />
      <path d="M -4 -8 L 0 -15 L 4 -8" className="satellite-antenna" />
    </g>
  );
}

export default function SkyPlot({ satellites, selectedNoradId }: Props) {
  const active = satellites.find(satellite => satellite.noradId === selectedNoradId);
  const activePoint = active ? projectSatellite(active) : null;

  return (
    <section className="panel orbital-theater">
      <div className="panel-title-row orbital-title">
        <div>
          <p className="eyebrow">ORBITAL THEATER</p>
          <h2>Auckland uplink · live constellation</h2>
        </div>
        <div className="orbital-title-meta">
          <span>{satellites.length} visible</span>
          <span className="live-pill"><i /> LIVE</span>
        </div>
      </div>

      <div className="orbital-stage">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="orbital-svg" role="img" aria-label="LEO satellites above Auckland">
          <defs>
            <linearGradient id="spaceFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#02070d" />
              <stop offset="62%" stopColor="#06131f" />
              <stop offset="100%" stopColor="#0b2231" />
            </linearGradient>
            <radialGradient id="earthFill" cx="50%" cy="0%">
              <stop offset="0%" stopColor="#153c4e" />
              <stop offset="55%" stopColor="#0a2230" />
              <stop offset="100%" stopColor="#04101a" />
            </radialGradient>
            <linearGradient id="beamGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#68e4ff" stopOpacity=".62" />
              <stop offset="100%" stopColor="#68e4ff" stopOpacity=".03" />
            </linearGradient>
            <filter id="beamGlow">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="earthGlow">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          <rect width={WIDTH} height={HEIGHT} rx="20" fill="url(#spaceFade)" />

          {stars.map((star, index) => (
            <circle key={index} cx={star.x} cy={star.y} r={star.r} fill="#c9ecff" opacity={star.opacity} />
          ))}

          <path d="M 18 355 Q 246 145 470 335 T 902 294" className="orbit-track orbit-one" />
          <path d="M -12 286 Q 230 474 470 222 T 934 262" className="orbit-track orbit-two" />
          <path d="M 90 168 Q 402 390 820 132" className="orbit-track orbit-three" />

          <g className="azimuth-ruler">
            {['N 0°','E 90°','S 180°','W 270°','N 360°'].map((label, index) => {
              const x = 62 + index * ((WIDTH - 124) / 4);
              return (
                <g key={label}>
                  <line x1={x} y1="420" x2={x} y2="431" />
                  <text x={x} y="414" textAnchor="middle">{label}</text>
                </g>
              );
            })}
          </g>

          {activePoint && (
            <>
              <polygon
                points={`${GROUND_X - 18},${GROUND_Y} ${GROUND_X + 18},${GROUND_Y} ${activePoint.x + 8},${activePoint.y + 10} ${activePoint.x - 8},${activePoint.y + 10}`}
                fill="url(#beamGradient)"
                className="uplink-beam"
                filter="url(#beamGlow)"
              />
              <line x1={GROUND_X} y1={GROUND_Y} x2={activePoint.x} y2={activePoint.y} className="uplink-center" />
            </>
          )}

          {satellites.slice(0, 18).map(satellite => {
            const point = projectSatellite(satellite);
            const isActive = satellite.noradId === selectedNoradId;
            return (
              <g key={satellite.noradId}>
                <SatelliteGlyph x={point.x} y={point.y} active={isActive} tone={signalTone(satellite.snrDb)} />
                {isActive && (
                  <g className="active-sat-label">
                    <rect x={point.x + 30} y={point.y - 28} width="152" height="43" rx="8" />
                    <text x={point.x + 42} y={point.y - 11}>{satellite.name}</text>
                    <text x={point.x + 42} y={point.y + 4} className="sub">{satellite.elevationDeg.toFixed(1)}° EL · {satellite.snrDb.toFixed(1)} dB</text>
                  </g>
                )}
              </g>
            );
          })}

          <ellipse cx={WIDTH / 2} cy="650" rx="545" ry="235" className="earth-atmosphere" filter="url(#earthGlow)" />
          <ellipse cx={WIDTH / 2} cy="650" rx="535" ry="225" fill="url(#earthFill)" className="earth-body" />
          <ellipse cx={WIDTH / 2} cy="650" rx="535" ry="225" className="earth-grid" />

          <g className="ground-station" transform={`translate(${GROUND_X} ${GROUND_Y})`}>
            <circle r="18" className="ground-halo" />
            <path d="M -11 10 L 0 -7 L 11 10 Z" className="station-mast" />
            <path d="M -14 -2 Q 0 -16 14 -2" className="station-dish" />
            <circle cy="-4" r="3" className="station-core" />
            <text x="27" y="-8">AUCKLAND</text>
            <text x="27" y="8" className="sub">36.85°S · 174.76°E</text>
          </g>

          <g className="earth-caption">
            <text x="28" y="520">GROUND SEGMENT</text>
            <text x="28" y="538" className="sub">New Zealand · sea level observer</text>
          </g>
        </svg>

        <div className="orbital-overlay">
          <div><span>ACTIVE BEAM</span><strong>{active?.name ?? 'SEARCHING'}</strong></div>
          <div><span>ELEVATION</span><strong>{active ? `${active.elevationDeg.toFixed(1)}°` : '—'}</strong></div>
          <div><span>LINK RANGE</span><strong>{active ? `${active.rangeKm.toFixed(0)} km` : '—'}</strong></div>
        </div>
      </div>
    </section>
  );
}