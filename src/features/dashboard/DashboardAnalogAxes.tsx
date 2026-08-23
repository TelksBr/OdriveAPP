import { useMemo } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { isButtonPressed } from '../inputs/analogAxisMath';
import { gpioInputLabel } from '../inputs/gpioChannel';
import {
  ButtonInputControl,
  CenteredAnalogAxis,
  CenteredAnalogAxisFromRef,
  LinearAnalogAxis,
  ZeroWheelInputControl,
} from '../inputs/InputControls';
import type { GpioInputState } from './useDashboardLivePoll';

interface DashboardAnalogAxesProps {
  connected: boolean;
  positionDegRef: React.RefObject<number | null>;
  torqueNm: number | null;
  maxTorqueNm: number | null;
  gpioInputs: GpioInputState[];
  polling: boolean;
}

export function DashboardAnalogAxes({
  connected,
  positionDegRef,
  torqueNm,
  maxTorqueNm,
  gpioInputs,
  polling,
}: DashboardAnalogAxesProps) {
  const { state } = useAppState();
  const locale = state.locale;

  const rangeDeg = useMemo(() => {
    const value = Number(state.fieldValues['axis.range'] ?? '');
    return Number.isFinite(value) && value > 0 ? value : 900;
  }, [state.fieldValues['axis.range']]);

  const torqueMax = useMemo(() => {
    if (maxTorqueNm && maxTorqueNm > 0) {
      return maxTorqueNm;
    }
    const value = Number(state.fieldValues['axis.maxtorque'] ?? '');
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [maxTorqueNm, state.fieldValues['axis.maxtorque']]);

  const halfRange = rangeDeg / 2;
  const live = connected && polling;
  const emptyLabel = translate(locale, 'metricEmpty');
  const activeGpios = gpioInputs.filter((item) => item.mode !== '0');

  return (
    <section className="dashboard-analog-axes">
      <div className="dashboard-analog-axes-header">
        <span className="eyebrow">{translate(locale, 'dashboardAnalogAxes')}</span>
        {live && (
          <span className="pill pill-ok" style={{ fontSize: 10 }}>
            {translate(locale, 'wheelLiveBadge')}
          </span>
        )}
      </div>

      <div className="dashboard-analog-axes-grid">
        <CenteredAnalogAxisFromRef
          label={translate(locale, 'dashboardWheelPositionAxis')}
          valueRef={positionDegRef}
          maxAbs={halfRange}
          unit="°"
          enabled={live}
          tone="accent"
          minLabel={`-${halfRange.toFixed(0)}°`}
          maxLabel={`+${halfRange.toFixed(0)}°`}
          emptyLabel={emptyLabel}
        />

        <CenteredAnalogAxis
          label={translate(locale, 'dashboardWheelTorqueAxis')}
          value={torqueNm}
          maxAbs={torqueMax ?? 1}
          unit=" Nm"
          tone="warn"
          smooth={false}
          minLabel={torqueMax ? `-${torqueMax.toFixed(1)} Nm` : emptyLabel}
          maxLabel={torqueMax ? `+${torqueMax.toFixed(1)} Nm` : emptyLabel}
          emptyLabel={emptyLabel}
        />

        {activeGpios.length === 0 ? (
          <p className="dashboard-analog-empty">{translate(locale, 'dashboardNoInputs')}</p>
        ) : (
          activeGpios.map((gpio) => (
            <GpioInputDisplay key={gpio.gpio} gpio={gpio} locale={locale} emptyLabel={emptyLabel} />
          ))
        )}
      </div>
    </section>
  );
}

function GpioInputDisplay({
  gpio,
  locale,
  emptyLabel,
}: {
  gpio: GpioInputState;
  locale: import('../../i18n/messages').Locale;
  emptyLabel: string;
}) {
  const label = gpioInputLabel(locale, gpio.gpio, gpio.mode, gpio.idx);

  if (gpio.mode === '2') {
    return (
      <LinearAnalogAxis
        label={label}
        value={gpio.raw}
        min={gpio.min}
        max={gpio.max}
        tone="ok"
        smooth={true}
        fast={true}
        emptyLabel={emptyLabel}
      />
    );
  }

  if (gpio.mode === '1') {
    return (
      <ButtonInputControl
        label={label}
        pressed={isButtonPressed(gpio.raw, gpio.min, gpio.max)}
        raw={gpio.raw}
        pressedLabel={translate(locale, 'inputButtonPressed')}
        releasedLabel={translate(locale, 'inputButtonReleased')}
        emptyLabel={emptyLabel}
      />
    );
  }

  if (gpio.mode === '3') {
    return (
      <ZeroWheelInputControl
        label={label}
        active={isButtonPressed(gpio.raw, gpio.min, gpio.max)}
        raw={gpio.raw}
        readyLabel={translate(locale, 'inputZeroReady')}
        triggeredLabel={translate(locale, 'inputZeroTriggered')}
        hint={translate(locale, 'inputZeroHint')}
        emptyLabel={emptyLabel}
      />
    );
  }

  return null;
}
