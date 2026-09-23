import { useEffect, useRef, useState } from 'react';
import type { SatelliteLink } from '../types';

type Props = {
  satellites: SatelliteLink[];
  selectedNoradId?: string;
};

const WIDTH = 1040;
const HEIGHT = 640;
const GROUND_X = 612;
const GROUND_Y = 468;
const FRAME_MS = 1050;
const EARTH_IMAGE = 'https://svs.gsfc.nasa.gov/vis/a030000/a031100/a031115/airglow-australia_print.jpg';

function projectSatellite(satellite: SatelliteLink) {
  const az = satellite.azimuthDeg / 360;
  const el = Math.max(0, Math.min(90, satellite.elevationDeg)) / 90;
  return {
    x: 92 + az * (WIDTH - 184),
    y: 278 - Math.pow(el, .72) * 194,
  };
}

function signalTone(snr: number) {
  if (snr >= 12) return 'excellent';
  if (snr >= 6) return 'good';
  if (snr >= 2) return 'fair';
  return 'weak';
}

function lerp(from: number, to: number, alpha: number) {
  return from + (to - from) * alpha;
}

function lerpAngle(from: number, to: number, alpha: number) {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * alpha + 360) % 360;
}

function interpolate(from: SatelliteLink | undefined, to: SatelliteLink, alpha: number): SatelliteLink {
  if (!from) return to;
  return {
    ...to,
    azimuthDeg: lerpAngle(from.azimuthDeg, to.azimuthDeg, alpha),
    elevationDeg: lerp(from.elevationDeg, to.elevationDeg, alpha),
    rangeKm: lerp(from.rangeKm, to.rangeKm, alpha),
    snrDb: lerp(from.snrDb, to.snrDb, alpha),
    subLatDeg: lerp(from.subLatDeg, to.subLatDeg, alpha),
    subLonDeg: lerpAngle(from.subLonDeg, to.subLonDeg, alpha),
    altitudeKm: lerp(from.altitudeKm, to.altitudeKm, alpha),
  };
}

function useSmoothSatellites(target: SatelliteLink[]) {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const previousRef = useRef(target);
  const targetRef = useRef(target);
  const startRef = useRef(performance.now());
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    previousRef.current = displayRef.current;
    targetRef.current = target;
    startRef.current = performance.now();
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);

    const tick = (timestamp: number) => {
      const alpha = Math.min(1, (timestamp - startRef.current) / FRAME_MS);
      const previousById = new Map(previousRef.current.map(satellite => [satellite.noradId, satellite]));
      const next = targetRef.current.map(satellite => interpolate(previousById.get(satellite.noradId), satellite, alpha));
      displayRef.current = next;
      setDisplay(next);
      if (alpha < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  return display;
}

function SatelliteGlyph({ active, tone }: { active: boolean; tone: string }) {
  const scale = active ? 1.18 : .78;
  return (
    <g transform={`scale(${scale})`} className={`orbital-satellite ${tone} ${active ? 'active' : ''}`}>
      {active && <circle r="27" className="satellite-halo" />}
      <rect x="-9" y="-8" width="18" height="16" rx="4" className="satellite-body" />
      <rect x="-38" y="-7" width="24" height="14" rx="2" className="solar-panel" />
      <rect x="14" y="-7" width="24" height="14" rx="2" className="solar-panel" />
      <line x1="-14" y1="0" x2="-9" y2="0" className="satellite-arm" />
      <line x1="9" y1="0" x2="14" y2="0" className="satellite-arm" />
      <path d="M -5 -8 L 0 -18 L 5 -8" className="satellite-antenna" />
      <circle cx="0" cy="0" r="2.2" className="satellite-sensor" />
    </g>
  );
}

export default function SkyPlot({ satellites, selectedNoradId }: Props) {
  const smoothSatellites = useSmoothSatellites(satellites.slice(0, 16));
  const active = smoothSatellites.find(satellite => satellite.noradId === selectedNoradId);
  const activePoint = active ? projectSatellite(active) : null;

  return (
    <section className="hero-earth-panel">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="hero-earth-svg" role="img" aria-label="Live satellite link over Australia and New Zealand">
        <defs>
          <linearGradient id="heroShade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#01060b" stopOpacity=".14" />
            <stop offset="55%" stopColor="#02070d" stopOpacity=".03" />
            <stop offset="100%" stopColor="#01060b" stopOpacity=".62" />
          </linearGradient>
          <linearGradient id="beamGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#47f7d0" stopOpacity=".96" />
            <stop offset="100%" stopColor="#58e7ff" stopOpacity=".08" />
          </linearGradient>
          <filter id="beamGlow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="pointGlow"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>

        <image href={EARTH_IMAGE} x="0" y="0" width={WIDTH} height={HEIGHT} preserveAspectRatio="xMidYMid slice" className="earth-photo" />
        <rect width={WIDTH} height={HEIGHT} fill="url(#heroShade)" />
        <rect width={WIDTH} height={HEIGHT} className="hero-vignette" />

        <g className="hero-heading">
          <text x="28" y="40">REAL-TIME VIEW</text>
          <text x="28" y="60" className="sub">Low Earth Orbit · Auckland Ground Segment</text>
        </g>

        <path d="M -30 204 Q 290 68 575 196 T 1060 160" className="orbit-path hero-orbit-one" />
        <path d="M -20 258 Q 294 120 602 240 T 1070 218" className="orbit-path hero-orbit-two" />

        {activePoint && (
          <>
            <polygon
              points={`${GROUND_X - 8},${GROUND_Y + 2} ${GROUND_X + 8},${GROUND_Y + 2} ${activePoint.x + 7},${activePoint.y + 8} ${activePoint.x - 7},${activePoint.y + 8}`}
              fill="url(#beamGradient)"
              className="hero-uplink-beam"
              filter="url(#beamGlow)"
            />
            <line x1={GROUND_X} y1={GROUND_Y} x2={activePoint.x} y2={activePoint.y} className="hero-uplink-center" />
          </>
        )}

        {smoothSatellites.map((satellite, index) => {
          const point = projectSatellite(satellite);
          const isActive = satellite.noradId === selectedNoradId;
          return (
            <g key={satellite.noradId} transform={`translate(${point.x} ${point.y})`} opacity={index > 9 && !isActive ? .45 : 1}>
              <SatelliteGlyph active={isActive} tone={signalTone(satellite.snrDb)} />
              {isActive && (
                <g className="hero-sat-label">
                  <text x="30" y="-15">{satellite.name}</text>
                  <text x="30" y="2" className="sub">{satellite.altitudeKm.toFixed(0)} km · {satellite.elevationDeg.toFixed(1)}° EL</text>
                </g>
              )}
            </g>
          );
        })}

        <g className="hero-ground-point" transform={`translate(${GROUND_X} ${GROUND_Y})`}>
          <circle r="16" className="hero-ground-glow" filter="url(#pointGlow)" />
          <circle r="8" className="hero-ground-ring" />
          <circle r="3.2" className="hero-ground-core" />
          <text x="20" y="-5">Auckland</text>
          <text x="20" y="12" className="sub">New Zealand</text>
        </g>

        <text x="126" y="405" className="region-label">AUSTRALIA</text>
        <text x="463" y="430" className="sea-label">Tasman Sea</text>

        <g className="hero-story-card">
          <rect x="24" y="500" width="318" height="96" rx="14" />
          <circle cx="62" cy="548" r="22" className="story-orbit" />
          <path d="M 45 548 Q 62 530 79 548 Q 62 566 45 548" className="story-orbit-line" />
          <text x="98" y="535">A MORE CONNECTED PLANET</text>
          <text x="98" y="556" className="sub">Live geometry, RF link budget and</text>
          <text x="98" y="573" className="sub">handover telemetry from Auckland.</text>
        </g>

        <g className="hero-stats">
          <text x="786" y="562" className="value">{satellites.length}</text>
          <text x="786" y="581" className="label">VISIBLE LINKS</text>
          <text x="900" y="562" className="value">{active ? active.snrDb.toFixed(1) : '—'}</text>
          <text x="900" y="581" className="label">SNR dB</text>
        </g>
      </svg>

      <div className="hero-credit">Earth imagery: NASA / ISS · live orbital overlays by LEO Link Lab</div>
    </section>
  );
}