import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { SatelliteLink } from '../types';

type TrackPoint = {
  latDeg: number;
  lonDeg: number;
  offsetMin: number;
};

type Props = {
  current?: SatelliteLink;
  station: { latDeg: number; lonDeg: number };
  stationLabel: string;
  track: TrackPoint[];
};

type GeoPoint = [number, number];

const WIDTH = 720;
const HEIGHT = 430;
const CX = 360;
const CY = 215;
const R = 166;
const DEG = Math.PI / 180;
const EARTH_TEXTURE = '/earth/earth-at-night.jpg';

const continents: GeoPoint[][] = [
  [[-168,72],[-145,68],[-127,56],[-124,42],[-117,32],[-99,19],[-82,25],[-80,36],[-70,45],[-60,53],[-76,63],[-105,72],[-140,70],[-168,72]],
  [[-81,12],[-67,7],[-52,-4],[-44,-22],[-53,-36],[-66,-55],[-74,-41],[-79,-16],[-81,12]],
  [[-10,36],[4,44],[20,40],[33,31],[42,14],[50,2],[42,-15],[30,-30],[18,-35],[7,-25],[-5,-4],[-15,17],[-10,36]],
  [[-10,36],[8,46],[28,54],[45,58],[65,67],[92,72],[120,63],[145,55],[162,45],[151,30],[126,20],[111,8],[95,18],[76,24],[60,31],[45,35],[31,41],[16,39],[-10,36]],
  [[111,-11],[129,-12],[145,-21],[154,-34],[142,-43],[124,-34],[115,-24],[111,-11]],
  [[166,-34],[176,-39],[179,-46],[170,-47],[166,-42],[166,-34]],
  [[-53,60],[-43,68],[-35,74],[-46,81],[-61,80],[-70,72],[-53,60]],
];

function normalizeLon(value: number) {
  let result = value;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return result;
}

function project(latDeg: number, lonDeg: number, centerLatDeg: number, centerLonDeg: number) {
  const phi = latDeg * DEG;
  const lambda = lonDeg * DEG;
  const phi0 = centerLatDeg * DEG;
  const lambda0 = centerLonDeg * DEG;
  const dLambda = lambda - lambda0;

  const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dLambda);
  const x = CX + R * Math.cos(phi) * Math.sin(dLambda);
  const y = CY - R * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dLambda));

  return { x, y, visible: cosC >= 0, cosC };
}

function visibleSegments(points: GeoPoint[], centerLat: number, centerLon: number) {
  const segments: string[] = [];
  let current: string[] = [];

  for (const [lon, lat] of points) {
    const point = project(lat, lon, centerLat, centerLon);
    if (point.visible) {
      current.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`);
    } else if (current.length > 1) {
      segments.push(current.join(' '));
      current = [];
    } else {
      current = [];
    }
  }

  if (current.length > 1) segments.push(current.join(' '));
  return segments;
}

function graticuleLatitude(lat: number) {
  return Array.from({ length: 73 }, (_, i): GeoPoint => [-180 + i * 5, lat]);
}

function graticuleLongitude(lon: number) {
  return Array.from({ length: 37 }, (_, i): GeoPoint => [lon, -90 + i * 5]);
}

function formatLat(value: number) {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? 'N' : 'S'}`;
}

function formatLon(value: number) {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? 'E' : 'W'}`;
}

export default function EarthTrack({ current, station, stationLabel, track }: Props) {
  const [centerLon, setCenterLon] = useState(current?.subLonDeg ?? 165);
  const [centerLat, setCenterLat] = useState(current?.subLatDeg ?? -25);
  const [follow, setFollow] = useState(true);
  const dragRef = useRef<{ x: number; y: number; lon: number; lat: number } | null>(null);

  useEffect(() => {
    if (!current || !follow) return;
    setCenterLon(previous => {
      const delta = normalizeLon(current.subLonDeg - previous);
      return normalizeLon(previous + delta * .38);
    });
    setCenterLat(previous => previous + (current.subLatDeg - previous) * .38);
  }, [current?.subLonDeg, current?.subLatDeg, follow]);

  const graticules = useMemo(() => {
    const latitudeLines = [-60,-30,0,30,60].flatMap(lat => visibleSegments(graticuleLatitude(lat), centerLat, centerLon));
    const longitudeLines = [-150,-120,-90,-60,-30,0,30,60,90,120,150,180].flatMap(lon => visibleSegments(graticuleLongitude(lon), centerLat, centerLon));
    return [...latitudeLines, ...longitudeLines];
  }, [centerLat, centerLon]);

  const coastlines = useMemo(
    () => continents.flatMap(continent => visibleSegments(continent, centerLat, centerLon)),
    [centerLat, centerLon],
  );

  const trackSegments = useMemo(() => {
    const points: GeoPoint[] = track.map(point => [point.lonDeg, point.latDeg]);
    return visibleSegments(points, centerLat, centerLon);
  }, [track, centerLat, centerLon]);

  const stationPoint = project(station.latDeg, station.lonDeg, centerLat, centerLon);
  const subpoint = current ? project(current.subLatDeg, current.subLonDeg, centerLat, centerLon) : null;

  const satellitePoint = subpoint && subpoint.visible ? (() => {
    const dx = subpoint.x - CX;
    const dy = subpoint.y - CY;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const radial = 22 + Math.min(24, (current?.altitudeKm ?? 550) / 30);
    return {
      x: subpoint.x + dx / length * radial,
      y: subpoint.y + dy / length * radial,
    };
  })() : null;

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, lon: centerLon, lat: centerLat };
    setFollow(false);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setCenterLon(normalizeLon(dragRef.current.lon - dx * .42));
    setCenterLat(Math.max(-75, Math.min(75, dragRef.current.lat + dy * .32)));
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const refocus = () => {
    if (current) {
      setCenterLon(current.subLonDeg);
      setCenterLat(current.subLatDeg);
    } else {
      setCenterLon(165);
      setCenterLat(-25);
    }
    setFollow(true);
  };

  return (
    <section className="panel globe-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">3D GLOBE / GROUND TRACK</p>
          <h2>Where is {current?.name ?? 'the satellite'}?</h2>
        </div>
        <button className={`globe-follow ${follow ? 'active' : ''}`} onClick={refocus}>
          {follow ? 'FOLLOWING SAT' : 'FOLLOW SAT'}
        </button>
      </div>

      <div className="globe-wrap">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="globe-svg"
          role="img"
          aria-label="Rotatable globe with satellite ground track"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <radialGradient id="globeOcean" cx="34%" cy="26%" r="78%">
              <stop offset="0%" stopColor="#153d51" />
              <stop offset="48%" stopColor="#092536" />
              <stop offset="100%" stopColor="#031019" />
            </radialGradient>
            <radialGradient id="globeAtmosphere" cx="50%" cy="50%" r="50%">
              <stop offset="72%" stopColor="#59ddff" stopOpacity="0" />
              <stop offset="88%" stopColor="#59ddff" stopOpacity=".12" />
              <stop offset="100%" stopColor="#59ddff" stopOpacity=".45" />
            </radialGradient>
            <clipPath id="globeClip">
              <circle cx={CX} cy={CY} r={R} />
            </clipPath>
            <filter id="globeGlow">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </defs>

          <circle cx={CX} cy={CY} r={R + 13} fill="#55dfff" opacity=".13" filter="url(#globeGlow)" />
          <circle cx={CX} cy={CY} r={R + 8} fill="url(#globeAtmosphere)" />
          <circle cx={CX} cy={CY} r={R} fill="url(#globeOcean)" className="globe-sphere" />
          <image
            href={EARTH_TEXTURE}
            x={CX - R}
            y={CY - R}
            width={R * 2}
            height={R * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#globeClip)"
            className="globe-texture"
          />
          <circle cx={CX} cy={CY} r={R} className="globe-night-shade" />

          {graticules.map((points, index) => (
            <polyline key={`grid-${index}`} points={points} className="globe-grid" />
          ))}

          {coastlines.map((points, index) => (
            <polyline key={`coast-${index}`} points={points} className="globe-coast" />
          ))}

          {trackSegments.map((points, index) => (
            <polyline key={`track-${index}`} points={points} className="globe-track-line" />
          ))}

          {stationPoint.visible && (
            <g transform={`translate(${stationPoint.x} ${stationPoint.y})`} className="globe-station">
              <circle r="10" className="globe-station-ring" />
              <circle r="3.2" className="globe-station-core" />
              <text x="13" y="-8">{stationLabel.split(',')[0].toUpperCase()}</text>
            </g>
          )}

          {subpoint?.visible && current && (
            <>
              <circle cx={subpoint.x} cy={subpoint.y} r="6" className="subpoint-dot" />
              {satellitePoint && (
                <>
                  <line x1={subpoint.x} y1={subpoint.y} x2={satellitePoint.x} y2={satellitePoint.y} className="subpoint-beam" />
                  <g transform={`translate(${satellitePoint.x} ${satellitePoint.y})`} className="globe-satellite">
                    <circle r="18" className="globe-satellite-halo" />
                    <rect x="-6" y="-5" width="12" height="10" rx="2" className="globe-sat-body" />
                    <rect x="-22" y="-4" width="12" height="8" rx="1" className="globe-sat-panel" />
                    <rect x="10" y="-4" width="12" height="8" rx="1" className="globe-sat-panel" />
                    <text x="28" y="-8">{current.name}</text>
                    <text x="28" y="7" className="sub">{current.altitudeKm.toFixed(0)} km altitude</text>
                  </g>
                </>
              )}
            </>
          )}

          <text x="26" y="31" className="globe-hint">DRAG TO ROTATE · ORTHOGRAPHIC EARTH VIEW</text>
          <text x="26" y="49" className="globe-hint sub">cyan trail = ±10–30 min ground track</text>
        </svg>
      </div>

      <div className="earth-location-readout">
        <div>
          <span>SUB-SATELLITE POINT</span>
          <strong>{current ? `${formatLat(current.subLatDeg)} · ${formatLon(current.subLonDeg)}` : '—'}</strong>
        </div>
        <div>
          <span>ALTITUDE</span>
          <strong>{current ? `${current.altitudeKm.toFixed(1)} km` : '—'}</strong>
        </div>
        <div>
          <span>VIEW CENTER</span>
          <strong>{formatLat(centerLat)} · {formatLon(centerLon)}</strong>
        </div>
      </div>

      <div className="track-key">
        <span><i className="past" /> ground track</span>
        <span><i className="station" /> {stationLabel.split(',')[0]}</span>
        <span><i className="satellite" /> satellite + subpoint</span>
      </div>
    </section>
  );
}