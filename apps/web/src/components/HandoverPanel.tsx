import type { SatelliteLink } from '../types';

type Props = {
  current?: SatelliteLink;
  candidate?: SatelliteLink;
  hysteresisDb?: number;
};

export default function HandoverPanel({ current, candidate, hysteresisDb = 3 }: Props) {
  const delta = current && candidate ? candidate.snrDb - current.snrDb : null;
  const handover = delta != null && delta >= hysteresisDb;
  const gapToSwitch = delta == null ? null : hysteresisDb - delta;

  return (
    <section className="panel handover-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">HANDOVER LOGIC</p>
          <h2>Should the receiver switch satellites?</h2>
        </div>
        <span className={`decision-pill ${handover ? 'switch' : 'stay'}`}>{handover ? 'SWITCH' : 'STAY'}</span>
      </div>

      <p className="handover-explainer">
        The candidate must beat the current satellite by at least <b>{hysteresisDb.toFixed(1)} dB SNR</b>.
        This prevents rapid ping-pong switching when two satellites have similar signal quality.
      </p>

      <div className="handover-flow">
        <div className="handover-node active">
          <span>CURRENT LINK</span>
          <strong>{current?.name ?? 'Searching'}</strong>
          <small>{current ? `${current.snrDb.toFixed(1)} dB SNR · ${current.elevationDeg.toFixed(1)}° EL` : 'No active link'}</small>
        </div>
        <div className="handover-arrow">
          <span>{delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} dB`}</span>
          <i>→</i>
        </div>
        <div className="handover-node">
          <span>BEST ALTERNATIVE</span>
          <strong>{candidate?.name ?? 'None'}</strong>
          <small>{candidate ? `${candidate.snrDb.toFixed(1)} dB SNR · ${candidate.elevationDeg.toFixed(1)}° EL` : 'No alternate satellite'}</small>
        </div>
      </div>

      <div className="handover-verdict">
        <span>Decision</span>
        <strong>
          {delta == null
            ? 'No comparison available.'
            : handover
              ? `Candidate is ${delta.toFixed(1)} dB better — switch.`
              : delta >= 0
                ? `Candidate is only ${delta.toFixed(1)} dB better — needs ${gapToSwitch?.toFixed(1)} dB more.`
                : `Current link is ${Math.abs(delta).toFixed(1)} dB stronger — stay connected.`}
        </strong>
      </div>
    </section>
  );
}
