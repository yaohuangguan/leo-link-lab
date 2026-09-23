import type { SatelliteLink } from '../types';
import { useI18n } from '../i18n';

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

const SIZE = 760;
const C = SIZE / 2;
const R = 292;

function project(azimuthDeg: number, elevationDeg: number) {
  const elevation = Math.max(0, Math.min(90, elevationDeg));
  const zenithDistance = 90 - elevation;
  const radius = R * zenithDistance / 90;
  const angle = (azimuthDeg - 90) * Math.PI / 180;

  return {
    x: C + radius * Math.cos(angle),
    y: C + radius * Math.sin(angle),
  };
}

function compassLabel(azimuth: number) {
  const directions = ['N','NE','E','SE','S','SW','W','NW'];
  const normalized = ((azimuth % 360) + 360) % 360;
  return directions[Math.round(normalized / 45) % 8];
}

function pointsString(points: TrackPoint[]) {
  return points
    .filter(point => point.elevationDeg >= 0)
    .map(point => {
      const p = project(point.azimuthDeg, point.elevationDeg);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

export default function SkyPlot({ current, track, locationLabel }: Props) {
  const { t } = useI18n();
  const currentPoint = current ? project(current.azimuthDeg, current.elevationDeg) : null;
  const past = track.filter(point => point.seconds <= 0 && point.elevationDeg >= 0);
  const future = track.filter(point => point.seconds >= 0 && point.elevationDeg >= 0);

  const timeLabel = (seconds: number) => {
    if (seconds === 0) return t('NOW');
    const minutes = Math.round(Math.abs(seconds) / 60);
    return seconds < 0 ? `−${minutes}m` : `+${minutes}m`;
  };

  return (
    <section className="panel rigorous-sky-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">{t('AZIMUTH–ELEVATION SKY PLOT')}</p>
          <h2>{locationLabel.split(',').slice(0, 2).join(', ')}</h2>
        </div>
        {current && (
          <span className="sky-bearing">
            Az {current.azimuthDeg.toFixed(1)}° · El {current.elevationDeg.toFixed(1)}°
          </span>
        )}
      </div>

      <p className="sky-method-note">
        {t('Standard observer-centred polar sky plot: azimuth increases clockwise from true north; radial distance is linear zenith distance, r ∝ (90° − elevation).')}
      </p>

      <div className="rigorous-sky-layout">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="rigorous-sky-svg" role="img" aria-label={`Azimuth elevation sky plot from ${locationLabel}`}>
          <defs>
            <radialGradient id="rigorousSky" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0c2c3a" />
              <stop offset="62%" stopColor="#071923" />
              <stop offset="100%" stopColor="#02090f" />
            </radialGradient>
            <filter id="currentGlow">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <circle cx={C} cy={C} r={R + 18} className="sky-atmosphere-ring" />
          <circle cx={C} cy={C} r={R} fill="url(#rigorousSky)" className="sky-horizon-ring" />

          {[0,30,60,90].map(elevation => {
            const radius = R * (90 - elevation) / 90;
            return (
              <g key={elevation}>
                <circle cx={C} cy={C} r={radius} className={elevation === 0 ? 'sky-ring horizon' : 'sky-ring'} />
                {elevation < 90 && (
                  <text x={C + 7} y={C - radius + 18} className="sky-ring-label">{elevation}° EL</text>
                )}
              </g>
            );
          })}

          {[0,45,90,135,180,225,270,315].map(azimuth => {
            const edge = project(azimuth, 0);
            return (
              <g key={azimuth}>
                <line x1={C} y1={C} x2={edge.x} y2={edge.y} className="sky-az-line" />
                {azimuth % 90 !== 0 && (
                  <text x={edge.x} y={edge.y} dy={azimuth < 180 ? -8 : 16} textAnchor="middle" className="sky-minor-az">
                    {azimuth}°
                  </text>
                )}
              </g>
            );
          })}

          <text x={C} y="32" textAnchor="middle" className="sky-cardinal">N · 0°</text>
          <text x={SIZE - 28} y={C + 5} textAnchor="end" className="sky-cardinal">E · 90°</text>
          <text x={C} y={SIZE - 18} textAnchor="middle" className="sky-cardinal">S · 180°</text>
          <text x="28" y={C + 5} className="sky-cardinal">W · 270°</text>
          <text x={C} y={C + 5} textAnchor="middle" className="sky-zenith">{t('ZENITH · 90° EL')}</text>

          {past.length > 1 && <polyline points={pointsString(past)} className="sky-past-path" />}
          {future.length > 1 && <polyline points={pointsString(future)} className="sky-future-path" />}

          {track
            .filter(point => point.elevationDeg >= 0 && point.seconds % 120 === 0)
            .map(point => {
              const p = project(point.azimuthDeg, point.elevationDeg);
              return (
                <g key={point.seconds} transform={`translate(${p.x} ${p.y})`} className="sky-time-point">
                  <circle r="4" />
                  <text x="8" y="-8">{timeLabel(point.seconds)}</text>
                </g>
              );
            })}

          {currentPoint && current && (
            <g transform={`translate(${currentPoint.x} ${currentPoint.y})`}>
              <circle r="30" className="sky-current-halo" filter="url(#currentGlow)" />
              <circle r="10" className="sky-current-dot" />
              <line x1="0" y1="0" x2="37" y2="-35" className="sky-current-label-line" />
              <g transform="translate(43 -73)" className="sky-current-label">
                <rect width="224" height="67" rx="10" />
                <text x="12" y="24">{current.name}</text>
                <text x="12" y="45" className="sub">
                  Az {current.azimuthDeg.toFixed(1)}° · El {current.elevationDeg.toFixed(1)}°
                </text>
              </g>
            </g>
          )}
        </svg>

        <aside className="sky-rigor-panel">
          <div>
            <span>{t('AZIMUTH')}</span>
            <strong>{current ? `${current.azimuthDeg.toFixed(1)}° · ${compassLabel(current.azimuthDeg)}` : '—'}</strong>
            <p>{t('Measured clockwise from true north: 0° N, 90° E, 180° S, 270° W.')}</p>
          </div>
          <div>
            <span>{t('ELEVATION')}</span>
            <strong>{current ? `${current.elevationDeg.toFixed(1)}°` : '—'}</strong>
            <p>{t('0° is the astronomical horizon. 90° is directly overhead at the zenith.')}</p>
          </div>
          <div>
            <span>{t('PLOT PROJECTION')}</span>
            <strong>{t('Linear zenith-distance')}</strong>
            <p>{t('Radius = R × (90° − elevation) / 90°. This is a coordinate plot, not a camera perspective.')}</p>
          </div>
          <div>
            <span>{t('TRACK')}</span>
            <strong>{t('Grey past · cyan future')}</strong>
            <p>{t('Track points are recomputed from the selected satellite orbit for this observer location.')}</p>
          </div>

          {current && (
            <div className="sky-rigor-current">
              <span>{t('CURRENT GEOMETRY')}</span>
              <strong>{t('{range} km slant range', { range: current.rangeKm.toFixed(0) })}</strong>
              <b>{current.rangeRateMps < 0 ? t('Approaching observer') : t('Receding from observer')}</b>
              <small>{t('Altitude {altitude} km · Doppler {doppler} kHz', {
                altitude: current.altitudeKm.toFixed(0),
                doppler: (current.dopplerHz / 1000).toFixed(1),
              })}</small>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
