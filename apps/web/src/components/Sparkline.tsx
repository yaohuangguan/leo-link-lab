type Props = {
  label: string;
  unit: string;
  values: number[];
  tone?: 'cyan' | 'green' | 'amber';
  digits?: number;
};

function points(values: number[], width: number, height: number) {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function Sparkline({ label, unit, values, tone = 'cyan', digits = 1 }: Props) {
  const latest = values.at(-1);
  const previous = values.at(-2);
  const delta = latest != null && previous != null ? latest - previous : 0;

  return (
    <article className={`trend-card ${tone}`}>
      <div className="trend-head">
        <div>
          <span>{label}</span>
          <strong>{latest == null ? '—' : latest.toFixed(digits)} <small>{unit}</small></strong>
        </div>
        <b className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>
          {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
        </b>
      </div>
      <svg viewBox="0 0 320 92" preserveAspectRatio="none" className="trend-chart">
        <line x1="0" y1="91" x2="320" y2="91" className="trend-baseline" />
        {values.length > 1 && <polyline points={points(values, 320, 82)} className="trend-line" />}
      </svg>
      <div className="trend-foot"><span>60 s history</span><span>live</span></div>
    </article>
  );
}