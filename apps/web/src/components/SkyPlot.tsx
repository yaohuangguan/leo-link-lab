import type { SatelliteLink } from '../types';

type TrackPoint = {
  azimuthDeg: number;
  elevationDeg: number;
  seconds: number;
};

type Props = {
  current?: SatelliteLink;
  track: TrackPoint[];
  locationLabel: string;
};

const WIDTH = 1160;
const HEIGHT = 560;
const LEFT = 54;
const RIGHT = 54;
const TOP = 66;
const HORIZON = 468;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HORIZON - TOP;

function project(azimuthDeg: number, elevationDeg: number) {
  return {
    x: LEFT + ((azimuthDeg % 360 + 360) % 360) / 360 * PLOT_WIDTH,
    y: HORIZON - Math.max(0, Math.min(90, elevationDeg)) / 90 * PLOT_HEIGHT,
  };
}

function compassLabel(azimuth: number) {
  const directions = ['N','NE','E','SE','S','SW','W','NW'];
  return directions[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}

function buildSegments(points: TrackPoint[]) {
  const segments: TrackPoint[][] = [];
  let current: TrackPoint[] = [];

  for (const point of points) {
    if (point.elevationDeg < 0) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    const previous = current.at(-1);
    if (previous && Math.abs(point.azimuthDeg - previous.azimuthDeg) > 180) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push(point);
  }

  if (current.length > 1) segments.push(current);
  return segments;
}

function pointsString(points: TrackPoint[]) {
  return points.map(point => {
    const p = project(point.azimuthDeg, point.elevationDeg);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
}

function timeLabel(seconds: number) {
  if (seconds === 0) return 'NOW';
  const minutes = Math.round(Math.abs(seconds) / 60);
  return seconds < 0 ? `−${minutes}m` : `+${minutes}m`;
}

export default function SkyPlot({ current, track, locationLabel }: Props) {
  const pastSegments = buildSegments(track.filter(point => point.seconds <= 0));
  const futureSegments = buildSegments(track.filter(point => point.seconds >= 0));
  const currentPoint = current ? project(current.azimuthDeg, current.elevationDeg) : null;
  const visibleFuture = track.filter(point => point.seconds > 0 && point.elevationDeg >= 0);
  const visiblePast = track.filter(point => point.seconds < 0 && point.elevationDeg >= 0);

  return (
    <section className="panel realtime-sky-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">REAL-TIME LOCAL SKY</p>
          <h2>{locationLabel.split(',').slice(0, 2).join(', ')}</h2>
        </div>
        {current && <span className="sky-bearing">{current.elevationDeg.toFixed(1)}° EL · {current.azimuthDeg.toFixed(0)}° {compassLabel(current.azimuthDeg)}</span>}
      </div>

      <div className="panorama-wrap">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="panorama-sky" role="img" aria-label={`Real-time sky view from ${locationLabel}`}>
          <defs>
            <linearGradient id="localSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#020912" />
              <stop offset="46%" stopColor="#092334" />
              <stop offset="78%" stopColor="#164658" />
              <stop offset="100%" stopColor="#294d55" />
            </linearGradient>
            <linearGradient id="groundFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#081417" />
              <stop offset="100%" stopColor="#020607" />
            </linearGradient>
            <filter id="satGlow">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect x="0" y="0" width={WIDTH} height={HORIZON} fill="url(#localSky)" rx="14" />
          <rect x="0" y={HORIZON} width={WIDTH} height={HEIGHT - HORIZON} fill="url(#groundFade)" />

          {Array.from({ length: 42 }, (_, index) => {
            const x = (index * 139 + 83) % WIDTH;
            const y = 28 + ((index * 71 + 39) % 250);
            return <circle key={index} cx={x} cy={y} r={index % 7 === 0 ? 1.5 : .8} className="local-star" />;
          })}

          {[15,30,45,60,75].map(elevation => {
            const y = project(0, elevation).y;
            return (
              <g key={elevation}>
                <line x1={LEFT} y1={y} x2={WIDTH - RIGHT} y2={y} className="sky-grid-line" />
                <text x={LEFT + 7} y={y - 7} className="sky-grid-label">{elevation}° elevation</text>
              </g>
            );
          })}

          {[0,90,180,270,360].map((azimuth, index) => {
            const x = LEFT + index * PLOT_WIDTH / 4;
            const labels = ['N · 0°','E · 90°','S · 180°','W · 270°','N · 360°'];
            return (
              <g key={azimuth}>
                <line x1={x} y1={TOP} x2={x} y2={HORIZON} className="azimuth-grid-line" />
                <text x={x} y={HORIZON + 30} textAnchor="middle" className="horizon-direction">{labels[index]}</text>
              </g>
            );
          })}

          <line x1={LEFT} y1={HORIZON} x2={WIDTH - RIGHT} y2={HORIZON} className="horizon-line" />
          <path d={`M 0 ${HORIZON + 15} L 90 ${HORIZON - 4} L 160 ${HORIZON + 10} L 260 ${HORIZON - 9} L 360 ${HORIZON + 4} L 470 ${HORIZON - 3} L 575 ${HORIZON + 9} L 680 ${HORIZON - 6} L 780 ${HORIZON + 6} L 900 ${HORIZON - 2} L 1030 ${HORIZON + 8} L 1160 ${HORIZON} L 1160 560 L 0 560 Z`} className="ground-silhouette" />

          {pastSegments.map((segment, index) => <polyline key={`past-${index}`} points={pointsString(segment)} className="sky-track-past" />)}
          {futureSegments.map((segment, index) => <polyline key={`future-${index}`} points={pointsString(segment)} className="sky-track-future" />)}

          {[...visiblePast, ...visibleFuture].filter(point => Math.abs(point.seconds) % 120 === 0).map(point => {
            const p = project(point.azimuthDeg, point.elevationDeg);
            return (
              <g key={point.seconds} transform={`translate(${p.x} ${p.y})`} className="track-time-marker">
                <circle r="4" />
                <text x="8" y="-8">{timeLabel(point.seconds)}</text>
              </g>
            );
          })}

          {currentPoint && current && (
            <g transform={`translate(${currentPoint.x} ${currentPoint.y})`}>
              <circle r="34" className="realtime-sat-halo" filter="url(#satGlow)" />
              <g className="realtime-satellite">
                <rect x="-9" y="-7" width="18" height="14" rx="3" />
                <rect x="-36" y="-5" width="22" height="10" rx="1.5" />
                <rect x="14" y="-5" width="22" height="10" rx="1.5" />
                <line x1="-14" y1="0" x2="-9" y2="0" />
                <line x1="9" y1="0" x2="14" y2="0" />
              </g>
              <line x1="0" y1="0" x2="35" y2="-38" className="realtime-label-line" />
              <g transform="translate(42 -76)" className="realtime-label">
                <rect width="232" height="72" rx="10" />
                <text x="13" y="25">{current.name}</text>
                <text x="13" y="47" className="sub">NOW · {current.elevationDeg.toFixed(1)}° EL · {current.azimuthDeg.toFixed(0)}° {compassLabel(current.azimuthDeg)}</text>
              </g>
            </g>
          )}

          <g className="sky-legend" transform="translate(70 38)">
            <circle cx="0" cy="0" r="4" className="legend-now" /><text x="10" y="4">current satellite</text>
            <line x1="150" y1="0" x2="184" y2="0" className="legend-future" /><text x="194" y="4">future path</text>
            <line x1="300" y1="0" x2="334" y2="0" className="legend-past" /><text x="344" y="4">past path</text>
          </g>
        </svg>
      </div>

      <div className="sky-readout">
        <div><span>Direction</span><strong>{current ? `${current.azimuthDeg.toFixed(0)}° · ${compassLabel(current.azimuthDeg)}` : '—'}</strong><small>Azimuth around the horizon</small></div>
        <div><span>Height in sky</span><strong>{current ? `${current.elevationDeg.toFixed(1)}°` : '—'}</strong><small>0° horizon · 90° overhead</small></div>
        <div><span>Slant range</span><strong>{current ? `${current.rangeKm.toFixed(0)} km` : '—'}</strong><small>Observer to satellite</small></div>
        <div><span>Motion</span><strong>{current ? current.rangeRateMps < 0 ? 'Approaching' : 'Receding' : '—'}</strong><small>From range-rate sign</small></div>
      </div>
    </section>
  );
}
