import type { RadioConfig, SatelliteLink } from '../types';
import { useI18n } from '../i18n';

type Props = {
  current?: SatelliteLink;
  radio: RadioConfig;
  receiverLabel: string;
};

function db(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export default function LinkBudgetPanel({ current, radio, receiverLabel }: Props) {
  const { t } = useI18n();
  const eirp = radio.txPowerDbm + radio.txGainDbi;
  const afterPath = current ? eirp - current.fsplDb - radio.otherLossDb : null;

  return (
    <section className="panel link-budget-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">{t('SIGNAL PATH')}</p>
          <h2>{t('Link budget · satellite → receiver')} · {receiverLabel}</h2>
        </div>
        <span className="budget-equation">{t('all values in dB / dBm')}</span>
      </div>

      {current ? (
        <>
          <div className="budget-flow" aria-label="Link budget calculation">
            <BudgetStep label={t('TX power')} value={`+${db(radio.txPowerDbm)} dBm`} kind="source" />
            <BudgetOperator symbol="+" />
            <BudgetStep label={t('TX antenna gain')} value={`+${db(radio.txGainDbi)} dBi`} />
            <BudgetOperator symbol="=" />
            <BudgetStep label={t('EIRP')} value={`${db(eirp)} dBm`} kind="result" />
            <BudgetOperator symbol="−" />
            <BudgetStep label={t('Free-space path loss')} value={`${db(current.fsplDb)} dB`} kind="loss" />
            <BudgetOperator symbol="−" />
            <BudgetStep label={t('Other losses')} value={`${db(radio.otherLossDb)} dB`} kind="loss" />
            <BudgetOperator symbol="+" />
            <BudgetStep label={t('RX antenna gain')} value={`+${db(radio.rxGainDbi)} dBi`} />
            <BudgetOperator symbol="=" />
            <BudgetStep label={t('Received power')} value={`${db(current.receivedPowerDbm)} dBm`} kind="result" />
          </div>

          <div className="budget-summary-grid">
            <div className="budget-summary primary">
              <span>{t('Received signal')}</span>
              <strong>{db(current.receivedPowerDbm)} dBm</strong>
              <small>{afterPath != null ? t('{value} dBm before RX antenna gain', { value: db(afterPath) }) : ''}</small>
            </div>
            <div className="budget-summary">
              <span>{t('Noise floor')}</span>
              <strong>{db(current.noiseDbm)} dBm</strong>
              <small>{t('{bandwidth} MHz bandwidth · {nf} dB NF', {
                bandwidth: db(radio.bandwidthMHz, 0),
                nf: db(radio.noiseFigureDb),
              })}</small>
            </div>
            <div className="budget-summary accent">
              <span>{t('SNR = signal − noise')}</span>
              <strong>{db(current.snrDb)} dB</strong>
              <small>{t('Required SNR: {value} dB', { value: db(radio.requiredSnrDb) })}</small>
            </div>
            <div className={`budget-summary ${current.linkMarginDb >= 0 ? 'good' : 'bad'}`}>
              <span>{t('Link margin')}</span>
              <strong>{current.linkMarginDb >= 0 ? '+' : ''}{db(current.linkMarginDb)} dB</strong>
              <small>{current.linkMarginDb >= 0 ? t('Link closes under this model') : t('Below required SNR')}</small>
            </div>
          </div>

          <div className="budget-explainer">
            <b>{t('Why FSPL is so large:')}</b>
            <span>{t(
              'The signal spreads over the {range} km slant range. At {frequency} GHz, free-space path loss is {fspl} dB. Antenna gains recover part of that loss; they do not remove it.',
              {
                range: db(current.rangeKm, 0),
                frequency: db(radio.frequencyGHz),
                fspl: db(current.fsplDb),
              },
            )}</span>
          </div>
        </>
      ) : (
        <p className="empty-copy">{t('A visible satellite is required before the live link budget can be calculated.')}</p>
      )}
    </section>
  );
}

function BudgetStep({ label, value, kind = '' }: { label: string; value: string; kind?: string }) {
  return (
    <div className={`budget-step ${kind}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BudgetOperator({ symbol }: { symbol: string }) {
  return <div className="budget-operator" aria-hidden="true">{symbol}</div>;
}
