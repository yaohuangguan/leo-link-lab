type PassSample = {
  seconds: number;
  elevation: number;
  snr: number;
};

type Props = {
  samples: PassSample[];
  minElevationDeg: number;
  satelliteName?: string;
};

function polyline(samples: PassSample[], width: number, height: number) {
  if (!samples.length) return '';
  return samples.map((sample, index) => {
    const x = (index / Math.max(samples.length - 1, 1)) * width;
    const y = height - (Math.max(0, Math.min(90, sample.elevation)) / 90) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function PassTimeline({ samples, minElevationDeg, satelliteName }: Props) {
  const peak = samples.reduce((best, sample) => sample.elevation > best.elevation ? sample : best, samples[0] ?? { seconds: 0, elevation: 0, snr: 0 });
  const lastVisible = [...samples].reverse().find(sample => sample.elevation >= minElevationDeg);
  const durationLabel = lastVisible && lastVisible.seconds < (samples.at(-1)?.seconds ?? 0)
    ? `LOS in ~${Math.max(1, Math.ceil(lastVisible.seconds / 60))} min`
    : 'Pass extends beyond window';

  return (
    <section className="panel pass-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">PASS PREDICTION</p>
          <h2>{satelliteName ?? 'No active pass'}</h2>
        </div>
        <span className="pass-status">{durationLabel}</span>
      </div>

      <div className="pass-summary">
        <div><span>NOW</span><strong>{samples[0] ? `${samples[0].elevation.toFixed(1)}°` : '—'}</strong></div>
        <div><span>PEAK</span><strong>{samples.length ? `${peak.elevation.toFixed(1)}°` : '—'}</strong></div>
        <div><span>AT</span><strong>{samples.length ? `+${Math.round(peak.seconds / 60)}m` : '—'}</strong></div>
      </div>

      <div className="pass-chart-wrap">
        <svg viewBox="0 0 460 118" preserveAspectRatio="none" className="pass-chart">
          <defs>
            <linearGradient id="passArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6de9ff" stopOpacity=".35" />
              <stop offset="100%" stopColor="#6de9ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={118 - (minElevationDeg / 90) * 104} x2="460" y2={118 - (minElevationDeg / 90) * 104} className="mask-line" />
          {samples.length > 1 && (
            <>
              <polygon points={`0,118 ${polyline(samples, 460, 104)} 460,118`} fill="url(#passArea)" />
              <polyline points={polyline(samples, 460, 104)} className="pass-line" />
            </>
          )}
          <circle cx="0" cy={samples[0] ? 104 - (samples[0].elevation / 90) * 104 : 104} r="5" className="pass-now-dot" />
        </svg>
        <div className="pass-axis"><span>NOW</span><span>+4m</span><span>+8m</span><span>+12m</span></div>
      </div>
    </section>
  );
}