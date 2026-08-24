import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { useLinearAnalogDisplay, useCenteredAnalogDisplay, useCenteredAnalogDisplayFromRef } from './useAnalogDisplay';

type Tone = 'accent' | 'ok' | 'warn';

interface CenteredAnalogAxisProps {
  label: string;
  value: number | null;
  maxAbs: number;
  unit: string;
  tone?: Tone;
  smooth?: boolean;
  minLabel?: string;
  maxLabel?: string;
  emptyLabel: string;
}

export function CenteredAnalogAxis({
  label,
  value,
  maxAbs,
  unit,
  tone = 'accent',
  smooth = true,
  minLabel,
  maxLabel,
  emptyLabel,
}: CenteredAnalogAxisProps) {
  const { barPercent, displayRaw } = useCenteredAnalogDisplay(value, maxAbs, smooth);
  const valueLabel = formatSigned(displayRaw, unit, emptyLabel);

  return (
    <div className={`input-control input-control--centered${smooth ? '' : ' input-control--instant'}`}>
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">{valueLabel}</strong>
      </div>
      <div className="input-control-track input-control-track--centered" aria-hidden="true">
        <span className="input-control-center" />
        <CenteredFill percent={barPercent} tone={tone} />
      </div>
      {(minLabel || maxLabel) && (
        <div className="input-control-scale">
          <span>{minLabel ?? ''}</span>
          <span>{maxLabel ?? ''}</span>
        </div>
      )}
    </div>
  );
}

interface CenteredAnalogAxisFromRefProps {
  label: string;
  valueRef: React.RefObject<number | null>;
  maxAbs: number;
  unit: string;
  enabled: boolean;
  tone?: Tone;
  minLabel?: string;
  maxLabel?: string;
  emptyLabel: string;
}

/** Centered axis synced to a ref at display refresh rate (no React state throttle). */
export function CenteredAnalogAxisFromRef({
  label,
  valueRef,
  maxAbs,
  unit,
  enabled,
  tone = 'accent',
  minLabel,
  maxLabel,
  emptyLabel,
}: CenteredAnalogAxisFromRefProps) {
  const { barPercent, displayRaw } = useCenteredAnalogDisplayFromRef(valueRef, maxAbs, enabled);
  const valueLabel = formatSigned(displayRaw, unit, emptyLabel);

  return (
    <div className="input-control input-control--centered input-control--instant">
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">{valueLabel}</strong>
      </div>
      <div className="input-control-track input-control-track--centered" aria-hidden="true">
        <span className="input-control-center" />
        <CenteredFill percent={barPercent} tone={tone} />
      </div>
      {(minLabel || maxLabel) && (
        <div className="input-control-scale">
          <span>{minLabel ?? ''}</span>
          <span>{maxLabel ?? ''}</span>
        </div>
      )}
    </div>
  );
}

interface LinearAnalogAxisProps {
  label: string;
  value: number | null;
  min: number;
  max: number;
  tone?: Tone;
  smooth?: boolean;
  fast?: boolean;
  emptyLabel: string;
}

export function LinearAnalogAxis({
  label,
  value,
  min,
  max,
  tone = 'ok',
  smooth = true,
  fast = false,
  emptyLabel,
}: LinearAnalogAxisProps) {
  const { barPercent, labelPercent } = useLinearAnalogDisplay(value, min, max, smooth, fast);
  const valueLabel = labelPercent === null ? emptyLabel : `${labelPercent}%`;

  return (
    <div className={`input-control input-control--linear${smooth ? '' : ' input-control--instant'}`}>
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">{valueLabel}</strong>
      </div>
      <div className="input-control-track input-control-track--linear" aria-hidden="true">
        <span className={`input-control-fill tone-${tone}`} style={{ width: `${barPercent ?? 0}%` }} />
      </div>
      <div className="input-control-scale">
        <span>{min}</span>
        <span>{valueLabel}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

interface ButtonInputControlProps {
  label: string;
  pressed: boolean;
  raw: number | null;
  pressedLabel: string;
  releasedLabel: string;
  emptyLabel: string;
}

export function ButtonInputControl({
  label,
  pressed,
  raw,
  pressedLabel,
  releasedLabel,
  emptyLabel,
}: ButtonInputControlProps) {
  const { state } = useAppState();
  return (
    <div className={`input-control input-control--button${pressed ? ' is-pressed' : ''}`}>
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">
          {raw === null ? emptyLabel : pressed ? pressedLabel : releasedLabel}
        </strong>
      </div>
      <div className="input-control-button-pad" aria-hidden="true">
        <span className="input-control-button-cap" />
      </div>
      {raw !== null && (
        <div className="input-control-scale">
          <span>{translate(state.locale, 'inputAdcRaw', { n: raw })}</span>
        </div>
      )}
    </div>
  );
}

interface ZeroWheelInputControlProps {
  label: string;
  active: boolean;
  raw: number | null;
  readyLabel: string;
  triggeredLabel: string;
  hint: string;
  emptyLabel: string;
}

export function ZeroWheelInputControl({
  label,
  active,
  raw,
  readyLabel,
  triggeredLabel,
  hint,
  emptyLabel,
}: ZeroWheelInputControlProps) {
  return (
    <div className={`input-control input-control--zero${active ? ' is-active' : ''}`}>
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong className="input-control-value">
          {raw === null ? emptyLabel : active ? triggeredLabel : readyLabel}
        </strong>
      </div>
      <div className="input-control-zero-pad" aria-hidden="true">
        <span className="input-control-zero-ring" />
        <span className="input-control-zero-dot" />
      </div>
      <p className="input-control-zero-hint">{hint}</p>
    </div>
  );
}

interface ThermistorInputControlProps {
  label: string;
  tempC: number | null;
  rawAdc: number | null;
  lowerLimit: number;
  upperLimit: number;
  emptyLabel: string;
}

export function ThermistorInputControl({
  label,
  tempC,
  rawAdc,
  lowerLimit,
  upperLimit,
  emptyLabel,
}: ThermistorInputControlProps) {
  const percent =
    tempC !== null && Number.isFinite(tempC)
      ? Math.max(0, Math.min(100, (tempC / Math.max(upperLimit, 120)) * 100))
      : 0;
  const isWarn = tempC !== null && tempC >= lowerLimit;
  const isError = tempC !== null && tempC >= upperLimit;
  const tone = isError ? 'warn' : isWarn ? 'warn' : 'ok';

  return (
    <div className={`input-control input-control--thermistor ${isError ? 'is-error' : isWarn ? 'is-warn' : ''}`}>
      <div className="input-control-header">
        <span className="input-control-label">{label}</span>
        <strong
          className="input-control-value"
          style={{ color: isError ? 'var(--error)' : isWarn ? 'var(--warn)' : 'var(--ok)' }}
        >
          {tempC === null || !Number.isFinite(tempC) ? emptyLabel : `${tempC.toFixed(1)} °C`}
        </strong>
      </div>
      <div className="input-control-track" aria-hidden="true">
        <span
          className={`input-control-fill tone-${tone}`}
          style={{
            width: `${percent}%`,
            backgroundColor: isError ? 'var(--error)' : isWarn ? 'var(--warn)' : 'var(--ok)',
          }}
        />
      </div>
      <div className="input-control-scale">
        <span>0 °C</span>
        {rawAdc !== null && <span style={{ opacity: 0.7 }}>ADC {rawAdc}</span>}
        <span>{upperLimit} °C (cutoff)</span>
      </div>
    </div>
  );
}

function CenteredFill({ percent, tone }: { percent: number | null; tone: Tone }) {
  if (percent === null || !Number.isFinite(percent) || percent === 0) {
    return null;
  }
  const clamped = Math.max(-100, Math.min(100, percent));
  if (clamped > 0) {
    return <span className={`input-control-fill tone-${tone}`} style={{ left: '50%', width: `${clamped / 2}%` }} />;
  }
  const width = Math.abs(clamped) / 2;
  return <span className={`input-control-fill tone-${tone}`} style={{ left: `${50 - width}%`, width: `${width}%` }} />;
}

function formatSigned(value: number | null, unit: string, emptyLabel: string, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return emptyLabel;
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}${unit}`;
}
