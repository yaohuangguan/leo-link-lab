import type { RadioConfig, SatelliteLink } from '../types';

type Props = {
  current?: SatelliteLink;
  radio: RadioConfig;
};

function db(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export default function LinkBudgetPanel({ current, radio }: Props) {
  const eirp = radio.txPowerDbm + radio.txGainDbi;
  const afterPath = current ? eirp - current.fsplDb - radio.otherLossDb : null;

  return (
    <section className="panel link-budget-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">SIGNAL PATH</p>
          <h2>Link budget · satellite → Auckland receiver</h2>
        </div>
        <span className="budget-equation">all values in dB / dBm</span>
      </div>

      {current ? (
        <>
          <div className="budget-flow" aria-label="Link budget calculation">
            <BudgetStep label="TX power" value={`+${db(radio.txPowerDbm)} dBm`} kind="source" />
            <BudgetOperator symbol="+" />
            <BudgetStep label="TX antenna gain" value={`+${db(radio.txGainDbi)} dBi`} />
            <BudgetOperator symbol="=" />
            <BudgetStep label="EIRP" value={`${db(eirp)} dBm`} kind="result" />
            <BudgetOperator symbol="−" />
            <BudgetStep label="Free-space path loss" value={`${db(current.fsplDb)} dB`} kind="loss" />
            <BudgetOperator symbol="−" />
            <BudgetStep label="Other losses" value={`${db(radio.otherLossDb)} dB`} kind="loss" />
            <BudgetOperator symbol="+" />
            <BudgetStep label="RX antenna gain" value={`+${db(radio.rxGainDbi)} dBi`} />
            <BudgetOperator symbol="=" />
            <BudgetStep label="Received power" value={`${db(current.receivedPowerDbm)} dBm`} kind="result" />
          </div>

          <div className="budget-summary-grid">
            <div className="budget-summary primary">
              <span>Received signal</span>
              <strong>{db(current.receivedPowerDbm)} dBm</strong>
              <small>{afterPath != null ? `${db(afterPath)} dBm before RX antenna gain` : ''}</small>
            </div>
            <div className="budget-summary">
              <span>Noise floor</span>
              <strong>{db(current.noiseDbm)} dBm</strong>
              <small>{db(radio.bandwidthMHz, 0)} MHz bandwidth · {db(radio.noiseFigureDb)} dB NF</small>
            </div>
            <div className="budget-summary accent">
              <span>SNR = signal − noise</span>
              <strong>{db(current.snrDb)} dB</strong>
              <small>Required SNR: {db(radio.requiredSnrDb)} dB</small>
            </div>
            <div className={`budget-summary ${current.linkMarginDb >= 0 ? 'good' : 'bad'}`}>
              <span>Link margin</span>
              <strong>{current.linkMarginDb >= 0 ? '+' : ''}{db(current.linkMarginDb)} dB</strong>
              <small>{current.linkMarginDb >= 0 ? 'Link closes under this model' : 'Below required SNR'}</small>
            </div>
          </div>

          <div className="budget-explainer">
            <b>Why FSPL is so large:</b>
            <span>
              The signal spreads over the {db(current.rangeKm, 0)} km slant range. At {db(radio.frequencyGHz)} GHz,
              free-space path loss is {db(current.fsplDb)} dB. Antenna gains recover part of that loss; they do not remove it.
            </span>
          </div>
        </>
      ) : (
        <p className="empty-copy">A visible satellite is required before the live link budget can be calculated.</p>
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
