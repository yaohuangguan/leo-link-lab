import type { SatelliteLink } from '../types';
import { useI18n } from '../i18n';

type Props = {
  current?: SatelliteLink;
  candidate?: SatelliteLink;
  hysteresisDb?: number;
};

export default function HandoverPanel({ current, candidate, hysteresisDb = 3 }: Props) {
  const { t } = useI18n();
  const delta = current && candidate ? candidate.snrDb - current.snrDb : null;
  const handover = delta != null && delta >= hysteresisDb;
  const gapToSwitch = delta == null ? null : hysteresisDb - delta;

  return (
    <section className="panel handover-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">{t('HANDOVER LOGIC')}</p>
          <h2>{t('Should the receiver switch satellites?')}</h2>
        </div>
        <span className={`decision-pill ${handover ? 'switch' : 'stay'}`}>
          {handover ? t('SWITCH') : t('STAY')}
        </span>
      </div>

      <p className="handover-explainer">
        {t(
          'The candidate must beat the current satellite by at least {value} dB SNR. This prevents rapid ping-pong switching when two satellites have similar signal quality.',
          { value: hysteresisDb.toFixed(1) },
        )}
      </p>

      <div className="handover-flow">
        <div className="handover-node active">
          <span>{t('CURRENT LINK')}</span>
          <strong>{current?.name ?? t('Searching…')}</strong>
          <small>{current ? `${current.snrDb.toFixed(1)} dB SNR · ${current.elevationDeg.toFixed(1)}° EL` : t('No active link')}</small>
        </div>
        <div className="handover-arrow">
          <span>{delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} dB`}</span>
          <i>→</i>
        </div>
        <div className="handover-node">
          <span>{t('BEST ALTERNATIVE')}</span>
          <strong>{candidate?.name ?? t('None')}</strong>
          <small>{candidate ? `${candidate.snrDb.toFixed(1)} dB SNR · ${candidate.elevationDeg.toFixed(1)}° EL` : t('No alternate satellite')}</small>
        </div>
      </div>

      <div className="handover-verdict">
        <span>{t('Decision')}</span>
        <strong>
          {delta == null
            ? t('No comparison available.')
            : handover
              ? t('Candidate is {delta} dB better — switch.', { delta: delta.toFixed(1) })
              : delta >= 0
                ? t('Candidate is only {delta} dB better — needs {gap} dB more.', {
                    delta: delta.toFixed(1),
                    gap: gapToSwitch?.toFixed(1) ?? '0.0',
                  })
                : t('Current link is {delta} dB stronger — stay connected.', { delta: Math.abs(delta).toFixed(1) })}
        </strong>
      </div>
    </section>
  );
}
