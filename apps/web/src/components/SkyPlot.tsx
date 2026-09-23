import type { SatelliteLink } from '../types';

type TrackPoint = {
  azimuthDeg: number;
  elevationDeg: number;
  seconds: number;
};

type Props = {
  current?: SatelliteLink;
  track: TrackPoint[];
};

const SIZE = 760;
const C = SIZE / 2;
const R = 300;

function project(azimuthDeg: number, elevationDeg: number) {
  const radius = ((90 - Math.max(0, Math.min(90, elevationDeg))) / 90) * R;
  const angle = (azimuthDeg - 90) * Math.PI / 180;
  return {
    x: C + radius * Math.cos(angle),
    y: C + radius * Math.sin(angle),
  };
}

function compassLabel(azimuth: number) {
  const directions = ['N','NE','E','SE','S','SW','W','NW'];
  return directions[Math.round((azimuth % 360) / 45) % 8];
}

export default function SkyPlot({ current, track }: Props) {
  const currentPoint = current ? project(current.azimuthDeg, current.elevationDeg) : null;
  const visibleTrack = track.filter(point => point.elevationDeg >= 0);
  const path = visibleTrack.map(point => {
    const p = project(point.azimuthDeg, point.elevationDeg);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');

  return (
    <section className="panel sky-position-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">SKY POSITION FROM AUCKLAND</p>
          <h2>{current ? current.name : 'Waiting for a visible satellite'}</h2>
        </div>
        {current && (
          <span className="sky-bearing">
            {compassLabel(current.azimuthDeg)} · {current.azimuthDeg.toFixed(0)}° azimuth
          </span>
        )}
      </div>

      <div className="sky-layout">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="sky-position-svg" role="img" aria-label="Satellite position in Auckland sky">
          <defs>
            <radialGradient id="skyDome" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0e3142" />
              <stop offset="58%" stopColor="#071a25" />
              <stop offset="100%" stopColor="#02090f" />
            </radialGradient>
            <filter id="skyGlow">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <circle cx={C} cy={C} r={R + 28} className="sky-atmosphere" />
          <circle cx={C} cy={C} r={R} fill="url(#skyDome)" className="sky-horizon" />

          {[30,60].map(elevation => {
            const radius = ((90 - elevation) / 90) * R;
            return (
              <g key={elevation}>
                <circle cx={C} cy={C} r={radius} className="elevation-ring" />
                <text x={C + 8} y={C - radius + 18} className="elevation-label">{elevation}° EL</text>
              </g>
            );
          })}

          {[0,45,90,135,180,225,270,315].map(az => {
            const outer = project(az, 0);
            const inner = project(az, 90);
            return <line key={az} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="azimuth-line" />;
          })}

          <text x={C} y={48} textAnchor="middle" className="compass-major">N</text>
          <text x={SIZE - 48} y={C + 6} textAnchor="middle" className="compass-major">E</text>
          <text x={C} y={SIZE - 35} textAnchor="middle" className="compass-major">S</text>
          <text x={48} y={C + 6} textAnchor="middle" className="compass-major">W</text>
          <text x={C} y={C + 5} textAnchor="middle" className="zenith-label">ZENITH · 90°</text>

          {path && <polyline points={path} className="future-sky-track" />}

          {visibleTrack.map((point, index) => {
            if (index % 2 !== 0) return null;
            const p = project(point.azimuthDeg, point.elevationDeg);
            return <circle key={point.seconds} cx={p.x} cy={p.y} r="3" className="future-track-dot" />;
          })}

          {currentPoint && current && (
            <g transform={`translate(${currentPoint.x} ${currentPoint.y})`}>
              <circle r="30" className="active-sky-halo" filter="url(#skyGlow)" />
              <circle r="11" className="active-sky-dot" />
              <line x1="0" y1="0" x2="42" y2="-34" className="active-label-line" />
              <g transform="translate(48 -56)" className="active-sky-label">
                <rect width="205" height="66" rx="10" />
                <text x="12" y="23">{current.name}</text>
                <text x="12" y="44" className="sub">{current.elevationDeg.toFixed(1)}° elevation · {current.azimuthDeg.toFixed(0)}° azimuth</text>
              </g>
            </g>
          )}
        </svg>

        <div className="sky-explainer">
          <div>
            <span>HOW TO READ THIS</span>
            <strong>Edge = horizon</strong>
            <p>A satellite on the outer circle is just above the horizon.</p>
          </div>
          <div>
            <span>HEIGHT IN THE SKY</span>
            <strong>Center = directly overhead</strong>
            <p>Higher elevation means a shorter, usually stronger link.</p>
          </div>
          <div>
            <span>DIRECTION</span>
            <strong>N / E / S / W = azimuth</strong>
            <p>The cyan trail is the predicted path for the next few minutes.</p>
          </div>
          {current && (
            <div className="sky-now-card">
              <span>NOW</span>
              <strong>{current.elevationDeg.toFixed(1)}° elevation</strong>
              <b>{current.azimuthDeg.toFixed(0)}° {compassLabel(current.azimuthDeg)}</b>
              <small>{current.rangeKm.toFixed(0)} km slant range</small>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
