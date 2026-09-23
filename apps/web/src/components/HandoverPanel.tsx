import type { SatelliteLink } from '../types';

type Props = {
  current?: SatelliteLink;
  candidate?: SatelliteLink;
  hysteresisDb?: number;
};

export default function HandoverPanel({ current, candidate, hysteresisDb = 3 }: Props) {
  const delta = current && candidate ? candidate.snrDb - current.snrDb : null;
  const handover = delta != null && delta >= hysteresisDb;

  return (
    <section className="panel handover-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">NETWORK DECISION</p>
          <h2>Handover</h2>
        </div>
        <span className={`decision-pill ${handover ? 'switch' : 'stay'}`}>{handover ? 'HANDOVER' : 'STAY'}</span>
      </div>

      <div className="handover-flow">
        <div className="handover-node active">
          <span>CONNECTED</span>
          <strong>{current?.name ?? 'Searching'}</strong>
          <small>{current ? `${current.snrDb.toFixed(1)} dB SNR` : 'No active link'}</small>
        </div>
        <div className="handover-arrow">
          <span>{delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} dB`}</span>
          <i>→</i>
        </div>
        <div className="handover-node">
          <span>BEST CANDIDATE</span>
          <strong>{candidate?.name ?? 'None'}</strong>
          <small>{candidate ? `${candidate.snrDb.toFixed(1)} dB SNR` : 'No alternate satellite'}</small>
        </div>
      </div>

      <div className="handover-rule">
        <span>Hysteresis threshold</span>
        <b>{hysteresisDb.toFixed(1)} dB</b>
      </div>
    </section>
  );
}