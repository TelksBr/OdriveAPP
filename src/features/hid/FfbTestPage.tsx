import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate, type Locale } from '../../i18n/messages';
import { Card, SectionHeader } from '../../shared/ui';
import { TimeSeriesChart } from '../telemetry/TimeSeriesChart';
import { TelemetryControlPanel } from '../telemetry/TelemetryControlPanel';
import { localizedSeries, motionSeries } from '../telemetry/series';
import { useTelemetry } from '../telemetry/useTelemetry';
import { FfbPidReference } from './FfbPidReference';
import { HidConnectionToolbar } from './HidConnectionToolbar';
import { hidFfbService, EFFECT_KEYS, RAMP_LAB_MAX_PCT, type EffectKey, type EffectParams } from './HidFfbService';
import { useHidConnection } from './useHidConnection';

type EffectDef = {
  key: EffectKey;
  title: string;
  description: string;
  sliderLabel: string;
  sliderMin: number;
  sliderMax: number;
  sliderDefault: number;
  formatValue: (v: number) => string;
  signed?: boolean;
  secondSlider?: {
    label: string;
    min: number;
    max: number;
    default: number;
    formatValue: (v: number) => string;
  };
  hintKey?: string;
};

function buildEffectParams(key: EffectKey, value: number, secondValue?: number, effectGainPct = 100): EffectParams {
  if (key === 'cf' || key === 'ra') {
    return { magnitudePct: value, effectGainPct };
  }
  if (key === 'si') {
    return { pct: value, frequencyHz: secondValue ?? 15, effectGainPct };
  }
  return { pct: value, effectGainPct };
}

function getEffects(locale: Locale): EffectDef[] {
  return [
    {
      key: 'cf',
      title: translate(locale, 'ffbEffectCfTitle'),
      description: translate(locale, 'ffbEffectCfDescription'),
      sliderLabel: translate(locale, 'ffbEffectCfSlider'),
      sliderMin: -100,
      sliderMax: 100,
      sliderDefault: 0,
      formatValue: (v) => `${v > 0 ? '+' : ''}${v}%`,
    },
    {
      key: 'sp',
      title: translate(locale, 'ffbEffectSpTitle'),
      description: translate(locale, 'ffbEffectSpDescription'),
      sliderLabel: translate(locale, 'ffbEffectIntensity'),
      sliderMin: 0,
      sliderMax: 100,
      sliderDefault: 50,
      formatValue: (v) => `${v}%`,
    },
    {
      key: 'da',
      title: translate(locale, 'ffbEffectDaTitle'),
      description: translate(locale, 'ffbEffectDaDescription'),
      sliderLabel: translate(locale, 'ffbEffectIntensity'),
      sliderMin: 0,
      sliderMax: 100,
      sliderDefault: 50,
      formatValue: (v) => `${v}%`,
    },
    {
      key: 'fr',
      title: translate(locale, 'ffbEffectFrTitle'),
      description: translate(locale, 'ffbEffectFrDescription'),
      sliderLabel: translate(locale, 'ffbEffectIntensity'),
      sliderMin: 0,
      sliderMax: 100,
      sliderDefault: 50,
      formatValue: (v) => `${v}%`,
    },
    {
      key: 'si',
      title: translate(locale, 'ffbEffectSiTitle'),
      description: translate(locale, 'ffbEffectSiDescription'),
      sliderLabel: translate(locale, 'ffbEffectIntensity'),
      sliderMin: 0,
      sliderMax: 100,
      sliderDefault: 40,
      formatValue: (v) => `${v}%`,
      secondSlider: {
        label: translate(locale, 'ffbEffectSiFrequency'),
        min: 5,
        max: 60,
        default: 15,
        formatValue: (v) => `${v} Hz`,
      },
    },
    {
      key: 'ra',
      title: translate(locale, 'ffbEffectRaTitle'),
      description: translate(locale, 'ffbEffectRaDescription'),
      hintKey: 'ffbEffectRaHint',
      sliderLabel: translate(locale, 'ffbEffectRaSlider'),
      sliderMin: -RAMP_LAB_MAX_PCT,
      sliderMax: RAMP_LAB_MAX_PCT,
      sliderDefault: 0,
      signed: true,
      formatValue: (v) => `${v > 0 ? '+' : ''}${v}%`,
    },
  ];
}

function readRunningFromService(): Record<EffectKey, boolean> {
  return Object.fromEntries(EFFECT_KEYS.map((key) => [key, hidFfbService.isRunning(key)])) as Record<EffectKey, boolean>;
}

function countActiveEffects(running: Record<EffectKey, boolean>): number {
  return Object.values(running).filter(Boolean).length;
}

export function FfbTestPage() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const effects = getEffects(locale);
  const hid = useHidConnection(locale);
  const [running, setRunning] = useState<Record<EffectKey, boolean>>(() => readRunningFromService());
  const [values, setValues] = useState<Record<EffectKey, number>>({
    cf: 0, sp: 50, da: 50, fr: 50, si: 40, ra: 0,
  });
  const [effectGainPct, setEffectGainPct] = useState(100);
  const [secondaryValues, setSecondaryValues] = useState<Partial<Record<EffectKey, number>>>({ si: 15 });
  const [telemetryEnabled, setTelemetryEnabled] = useState(true);
  const [intervalMs, setIntervalMs] = useState(250);
  const [windowMs, setWindowMs] = useState(60_000);

  const localizedMotionSeries = useMemo(() => localizedSeries(locale, motionSeries), [locale]);

  const maxTorqueNm = Number(state.fieldValues['axis.maxtorque'] ?? '');
  const rangeDeg = Number(state.fieldValues['axis.range'] ?? '');
  const halfRangeDeg = Number.isFinite(rangeDeg) && rangeDeg > 0 ? rangeDeg / 2 : undefined;
  const telemetry = useTelemetry({
    connected: state.connected,
    enabled: telemetryEnabled,
    intervalMs,
    windowMs,
    maxTorqueNm: Number.isFinite(maxTorqueNm) && maxTorqueNm > 0 ? maxTorqueNm : undefined,
    halfRangeDeg,
    holdPolling: state.busy,
  });

  useEffect(() => {
    return hidFfbService.onConnectionChange(() => {
      setRunning(readRunningFromService());
    });
  }, []);

  useEffect(() => {
    return () => {
      if (hidFfbService.connected) {
        void hidFfbService.stopAll();
      }
    };
  }, []);

  async function wrapAsync(fn: () => Promise<void>) {
    hid.clearError();
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      hid.setError(msg);
      dispatch({ type: 'append-log', direction: 'error', message: msg });
    }
  }

  async function handleConnect() {
    await wrapAsync(async () => {
      await hid.connect();
    });
  }

  async function handleDisconnect() {
    await wrapAsync(async () => {
      await hid.disconnect();
    });
  }

  async function panicStop() {
    await wrapAsync(async () => {
      await hidFfbService.stopAll();
      setRunning(readRunningFromService());
    });
  }

  async function toggleEffect(key: EffectKey, enable: boolean) {
    await wrapAsync(async () => {
      if (enable) {
        await hidFfbService.startEffect(key, buildEffectParams(key, values[key], secondaryValues[key], effectGainPct));
      } else {
        await hidFfbService.stopEffect(key);
      }
      setRunning(readRunningFromService());
    });
  }

  async function updateValue(key: EffectKey, value: number) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (running[key] && hidFfbService.connected) {
      await wrapAsync(async () => {
        await hidFfbService.startEffect(key, buildEffectParams(key, value, secondaryValues[key], effectGainPct));
      });
    }
  }

  async function updateSecondaryValue(key: EffectKey, value: number) {
    setSecondaryValues((prev) => ({ ...prev, [key]: value }));
    if (running[key] && hidFfbService.connected) {
      await wrapAsync(async () => {
        await hidFfbService.startEffect(key, buildEffectParams(key, values[key], value, effectGainPct));
      });
    }
  }

  async function updateEffectGain(value: number) {
    setEffectGainPct(value);
    if (!hid.connected) return;
    await wrapAsync(async () => {
      for (const key of EFFECT_KEYS) {
        if (running[key]) await hidFfbService.updateEffectGain(key, value);
      }
    });
  }

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow={translate(locale, 'ffbTestEyebrow')}
        title={translate(locale, 'ffbTestTitle')}
        description={translate(locale, 'ffbTestDescription')}
      />

      <Card title={translate(locale, 'ffbHidCardTitle')} description={translate(locale, 'ffbHidCardDescription')}>
        <HidConnectionToolbar
          locale={locale}
          hidSupported={state.hidSupported}
          connected={hid.connected}
          deviceName={hid.deviceName}
          error={hid.error}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          showStopAll
          onStopAll={panicStop}
          stopAllDisabled={!hid.connected}
        />
        {state.connected && (
          <p className="ffb-inline-warn" style={{ marginTop: 10 }}>
            {translate(locale, 'ffbMotorClosedLoopWarning')}
          </p>
        )}
        {!state.connected && (
          <p className="ffb-inline-hint" style={{ marginTop: 10 }}>
            {translate(locale, 'ffbSerialHint')}
          </p>
        )}
      </Card>

      <Card title={translate(locale, 'ffbEffectsCardTitle')} description={translate(locale, 'ffbEffectsCardDescription')}>
        <div className="ffb-effect-gain-control">
          <label className="ffb-slider-row">
            <span>{translate(locale, 'ffbEffectGainLabel')}</span>
            <strong>{effectGainPct}%</strong>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={effectGainPct}
              onChange={(event) => void updateEffectGain(Number(event.target.value))}
            />
          </label>
          <p className="ffb-inline-hint">{translate(locale, 'ffbEffectGainHint')}</p>
        </div>
        <div className="ffb-effect-grid">
          {effects.map((effect) => (
            <EffectCard
              key={effect.key}
              locale={locale}
              effect={effect}
              enabled={running[effect.key]}
              value={values[effect.key]}
              secondValue={effect.secondSlider ? secondaryValues[effect.key] ?? effect.secondSlider.default : undefined}
              disabled={!hid.connected}
              onToggle={(en) => void toggleEffect(effect.key, en)}
              onValueChange={(v) => void updateValue(effect.key, v)}
              onSecondValueChange={
                effect.secondSlider ? (v) => void updateSecondaryValue(effect.key, v) : undefined
              }
            />
          ))}
        </div>
        <p className="ffb-inline-hint" style={{ marginTop: 12, marginBottom: 0 }}>
          {translate(locale, 'ffbRealForcesNote')}
        </p>
      </Card>

      <Card title={translate(locale, 'ffbChartTitle')} description={translate(locale, 'ffbChartDescription')}>
        <TelemetryControlPanel
          locale={locale}
          connected={state.connected}
          enabled={telemetryEnabled}
          onEnabledChange={setTelemetryEnabled}
          intervalMs={intervalMs}
          onIntervalChange={setIntervalMs}
          windowMs={windowMs}
          onWindowChange={setWindowMs}
          telemetry={telemetry}
          extraKpis={(
            <div>
              <span>{translate(locale, 'ffbKpiActiveEffects')}</span>
              <strong>{countActiveEffects(running)}</strong>
            </div>
          )}
        />
      </Card>

      <div className="chart-grid">
        <TimeSeriesChart
          title={translate(locale, 'observeChartWheel')}
          samples={telemetry.displaySamples}
          series={localizedMotionSeries}
          windowMs={windowMs}
        />
      </div>

      <Card title={translate(locale, 'ffbHowItWorksTitle')} description={translate(locale, 'ffbHowItWorksDescription')}>
        <p className="ffb-pid-intro">{translate(locale, 'ffbPidIntro')}</p>
        <FfbPidReference
          locale={locale}
          running={running}
          values={values}
          secondaryValues={secondaryValues}
          hidConnected={hid.connected}
        />
      </Card>

      <Card title={translate(locale, 'ffbPerfLinkTitle')} description={translate(locale, 'ffbPerfLinkDescription')}>
        <button type="button" onClick={() => dispatch({ type: 'set-tab', tab: 'perf-test' })}>
          {translate(locale, 'ffbPerfLinkBtn')}
        </button>
      </Card>
    </div>
  );
}

function EffectCard({
  locale,
  effect,
  enabled,
  value,
  secondValue,
  disabled,
  onToggle,
  onValueChange,
  onSecondValueChange,
}: {
  locale: Locale;
  effect: EffectDef;
  enabled: boolean;
  value: number;
  secondValue?: number;
  disabled: boolean;
  onToggle: (enable: boolean) => void;
  onValueChange: (value: number) => void;
  onSecondValueChange?: (value: number) => void;
}) {
  return (
    <div className={`field-row ffb-effect-card${enabled ? ' field-row--highlight' : ''}`}>
      <div className="field-title-row">
        <div className="field-copy">
          <label>{effect.title}</label>
          <small>{effect.description}</small>
          {effect.hintKey ? <small className="ffb-effect-hint">{translate(locale, effect.hintKey)}</small> : null}
        </div>
        <label className="toggle-label" style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1 }}>
          <input type="checkbox" checked={enabled} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
          {enabled ? translate(locale, 'ffbEffectOn') : translate(locale, 'ffbEffectOff')}
        </label>
      </div>

      <label className="ffb-slider-row">
        <span>{effect.sliderLabel}</span>
        <strong>{effect.formatValue(value)}</strong>
        <input
          type="range"
          min={effect.sliderMin}
          max={effect.sliderMax}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onValueChange(Number(e.target.value))}
        />
        {effect.signed && (
          <div className="ffb-slider-ends">
            <span>{translate(locale, 'ffbCfLeft')}</span>
            <span>{translate(locale, 'ffbCfRight')}</span>
          </div>
        )}
      </label>

      {effect.secondSlider && secondValue !== undefined && onSecondValueChange ? (
        <label className="ffb-slider-row">
          <span>{effect.secondSlider.label}</span>
          <strong>{effect.secondSlider.formatValue(secondValue)}</strong>
          <input
            type="range"
            min={effect.secondSlider.min}
            max={effect.secondSlider.max}
            step={1}
            value={secondValue}
            disabled={disabled}
            onChange={(e) => onSecondValueChange(Number(e.target.value))}
          />
        </label>
      ) : null}
    </div>
  );
}
