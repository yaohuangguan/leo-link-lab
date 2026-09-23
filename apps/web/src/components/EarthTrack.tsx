import type { SatelliteLink } from '../types';

type TrackPoint = {
  latDeg: number;
  lonDeg: number;
  offsetMin: number;
};

type Props = {
  current?: SatelliteLink;
  station: { latDeg: number; lonDeg: number };
  track: TrackPoint[];
};

const WIDTH = 720;
const HEIGHT = 350;

function project(latDeg: number, lonDeg: number) {
  return {
    x: ((lonDeg + 180) / 360) * WIDTH,
    y: ((90 - latDeg) / 180) * HEIGHT,
  };
}

function formatLat(value: number) {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? 'N' : 'S'}`;
}

function formatLon(value: number) {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? 'E' : 'W'}`;
}

function splitTrack(points: TrackPoint[]) {
  const segments: TrackPoint[][] = [];
  let current: TrackPoint[] = [];

  for (const point of points) {
    const previous = current.at(-1);
    if (previous && Math.abs(point.lonDeg - previous.lonDeg) > 180) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push(point);
  }

  if (current.length > 1) segments.push(current);
  return segments;
}

function polyline(points: TrackPoint[]) {
  return points.map(point => {
    const projected = project(point.latDeg, point.lonDeg);
    return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
  }).join(' ');
}

const land = [
  'M52 83 L82 56 L133 48 L174 70 L188 98 L167 113 L139 105 L122 130 L92 122 L75 100 Z',
  'M161 151 L188 162 L205 194 L199 230 L181 276 L162 257 L153 215 L142 181 Z',
  'M336 78 L365 65 L397 71 L413 91 L392 107 L365 103 L347 119 L328 104 Z',
  'M355 119 L398 121 L423 157 L416 208 L393 256 L369 244 L350 203 L342 158 Z',
  'M413 83 L461 57 L536 56 L607 82 L649 119 L630 145 L581 139 L555 112 L513 121 L479 104 L448 118 L414 104 Z',
  'M566 221 L603 207 L641 221 L652 248 L633 269 L590 268 L558 246 Z',
  'M276 40 L296 27 L314 40 L307 63 L284 67 Z',
];

export default function EarthTrack({ current, station, track }: Props) {
  const stationPoint = project(station.latDeg, station.lonDeg);
  const satellitePoint = current ? project(current.subLatDeg, current.subLonDeg) : null;
  const segments = splitTrack(track);

  return (
    <section className="panel earth-track-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">EARTH TRACK</p>
          <h2>Where is the satellite?</h2>
        </div>
        <span className="earth-altitude">{current ? `${current.altitudeKm.toFixed(0)} km ALT` : 'NO LOCK'}</span>
      </div>

      <div className="earth-map-wrap">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="earth-map" role="img" aria-label="Current satellite ground track">
          <defs>
            <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#071a28" />
              <stop offset="100%" stopColor="#041019" />
            </linearGradient>
            <filter id="mapGlow">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect width={WIDTH} height={HEIGHT} rx="15" fill="url(#ocean)" />

          {[-120,-60,0,60,120].map(lon => {
            const p = project(0, lon);
            return <line key={lon} x1={p.x} y1="0" x2={p.x} y2={HEIGHT} className="map-grid-line" />;
          })}
          {[-60,-30,0,30,60].map(lat => {
            const p = project(lat, 0);
            return <line key={lat} x1="0" y1={p.y} x2={WIDTH} y2={p.y} className="map-grid-line" />;
          })}

          {land.map((path, index) => <path key={index} d={path} className="map-land" />)}

          {segments.map((segment, index) => (
            <polyline key={index} points={polyline(segment)} className="ground-track-line" />
          ))}

          <g className="map-station" style={{ transform: `translate(${stationPoint.x}px, ${stationPoint.y}px)` }}>
            <circle r="9" className="map-station-ring" />
            <circle r="3" className="map-station-core" />
            <text x="12" y="-8">AUCKLAND</text>
          </g>

          {satellitePoint && current && (
            <g
              className="map-satellite"
              style={{ transform: `translate(${satellitePoint.x}px, ${satellitePoint.y}px)` }}
            >
              <circle r="17" className="map-satellite-halo" />
              <rect x="-5" y="-4" width="10" height="8" rx="2" className="map-sat-body" />
              <rect x="-18" y="-3" width="10" height="6" rx="1" className="map-sat-panel" />
              <rect x="8" y="-3" width="10" height="6" rx="1" className="map-sat-panel" />
              <text x="23" y="-9">{current.name}</text>
              <text x="23" y="6" className="sub">SUB-SATELLITE POINT</text>
            </g>
          )}
        </svg>
      </div>

      <div className="earth-location-readout">
        <div>
          <span>SUBPOINT</span>
          <strong>{current ? `${formatLat(current.subLatDeg)} · ${formatLon(current.subLonDeg)}` : '—'}</strong>
        </div>
        <div>
          <span>ALTITUDE</span>
          <strong>{current ? `${current.altitudeKm.toFixed(1)} km` : '—'}</strong>
        </div>
        <div>
          <span>OBSERVER</span>
          <strong>Auckland · NZ</strong>
        </div>
      </div>

      <div className="track-key">
        <span><i className="past" /> past / future ground track</span>
        <span><i className="station" /> ground station</span>
        <span><i className="satellite" /> satellite subpoint</span>
      </div>
    </section>
  );
}