import { useMemo } from 'react';
import type { ConfigField } from '../config/fieldCatalog';
import { getFieldHelp } from '../config/fieldHelp';
import { translate, type Locale } from '../../i18n/messages';
import { localizeField, localizeOptionLabel } from '../../i18n/fieldMeta';
import { Card, Pill } from '../../shared/ui';
import { isButtonPressed } from './analogAxisMath';
import {
  channelModeLabel,
  channelValue,
  parseChannelNumber,
  type GpioChannel,
} from './gpioChannel';
import {
  ButtonInputControl,
  LinearAnalogAxis,
  ZeroWheelInputControl,
  ThermistorInputControl,
} from './InputControls';
import { AnalogSignalTuning } from './AnalogSignalTuning';
import { ThermistorChannelConfig } from './ThermistorChannelConfig';
import type { NtcThermistorPreset } from './ntcThermistorPresets';

interface AnalogProcessorControls {
  filterOn: boolean;
  cutoffRaw: string;
  cutoffValid: boolean;
  cutoffNum: number;
  processorDisabled: boolean;
  onToggleFilter: (enabled: boolean) => void;
  onCutoffChange: (value: string) => void;
  onCutoffCommit: () => void;
  onCutoffPreset: (hz: number) => void;
}

interface InputChannelPanelProps {
  channel: GpioChannel;
  values: Record<string, string>;
  dirtyPaths: string[];
  locale: Locale;
  disabled: boolean;
  analogProcessor?: AnalogProcessorControls;
  thermistorPin?: string;
  thermistorEnabled?: boolean;
  thermistorTempC?: number | null;
  thermistorLowerLimit?: string;
  thermistorUpperLimit?: string;
  thermistorDirty?: boolean;
  onChange: (field: ConfigField, value: string) => void;
  onModeChange: (channel: GpioChannel, mode: string) => void;
  onApplyThermistorPreset?: (preset: NtcThermistorPreset) => void;
  onChangeThermistorLimit?: (key: 'temp_limit_lower' | 'temp_limit_upper', value: string) => void;
  onRead: () => void;
  onApply: () => void;
  onCaptureMin: () => void;
  onCaptureMax: () => void;
  onResetMinMax: () => void;
}

export function InputChannelPanel({
  channel,
  values,
  dirtyPaths,
  locale,
  disabled,
  analogProcessor,
  thermistorPin,
  thermistorEnabled,
  thermistorTempC = null,
  thermistorLowerLimit = '80.0',
  thermistorUpperLimit = '100.0',
  thermistorDirty = false,
  onChange,
  onModeChange,
  onApplyThermistorPreset,
  onChangeThermistorLimit,
  onRead,
  onApply,
  onCaptureMin,
  onCaptureMax,
  onResetMinMax,
}: InputChannelPanelProps) {
  const fields = useMemo(
    () => ({
      mode: localizeField(channel.fields.mode, locale),
      idx: localizeField(channel.fields.idx, locale),
      invert: localizeField(channel.fields.invert, locale),
      amin: channel.fields.amin ? localizeField(channel.fields.amin, locale) : undefined,
      amax: channel.fields.amax ? localizeField(channel.fields.amax, locale) : undefined,
      cur: localizeField(channel.fields.cur, locale),
    }),
    [channel, locale],
  );

  const analogCapable = Boolean(channel.fields.amin && channel.fields.amax);
  const isThermistor = analogCapable && Boolean(thermistorEnabled) && thermistorPin === String(channel.gpio);
  const rawMode = channelValue(channel, 'mode', values);
  const effectiveMode = isThermistor ? 'thermistor' : rawMode;

  const raw = parseChannelNumber(channelValue(channel, 'cur', values));
  const isAnalog = analogCapable && effectiveMode === '2';
  const filteredRaw = parseChannelNumber(channelValue(channel, 'filt', values));
  const filtered = filteredRaw === 65535 ? null : filteredRaw;
  const filterBypassed = isAnalog && filteredRaw === 65535;
  const min = parseChannelNumber(channelValue(channel, 'amin', values)) ?? 0;
  const max = parseChannelNumber(channelValue(channel, 'amax', values)) ?? 4095;

  const channelFieldsDirty = Object.values(channel.fields).some((field) => field && dirtyPaths.includes(field.path));
  const dirty = channelFieldsDirty || (isThermistor && thermistorDirty);
  const emptyLabel = translate(locale, 'metricEmpty');

  const modeOptions = useMemo(() => {
    const opts = [
      { value: '0', label: translate(locale, 'inputModeDisabled') },
      { value: '1', label: translate(locale, 'inputModeButton') },
    ];
    if (analogCapable) {
      opts.push({ value: '2', label: translate(locale, 'inputModeAnalog') });
    }
    opts.push({ value: '3', label: translate(locale, 'inputModeZero') });
    if (analogCapable) {
      opts.push({ value: 'thermistor', label: translate(locale, 'inputModeThermistor') });
    }
    return opts;
  }, [analogCapable, locale]);

  return (
    <Card
      title={translate(locale, 'inputsGpioTitle', { n: channel.gpio })}
      description={channelModeLabel(locale, effectiveMode)}
    >
      <div className="input-channel-panel">
        <InputLiveDisplay
          mode={effectiveMode}
          raw={raw ?? null}
          filtered={filtered ?? null}
          filterBypassed={filterBypassed}
          min={min}
          max={max}
          thermistorTempC={thermistorTempC}
          thermistorLowerLimit={parseFloat(thermistorLowerLimit) || 80}
          thermistorUpperLimit={parseFloat(thermistorUpperLimit) || 100}
          locale={locale}
          emptyLabel={emptyLabel}
        />

        <section className="input-channel-config">
          <div className="input-channel-config-head">
            <h4 className="input-channel-config-title">{translate(locale, 'inputsConfigSection')}</h4>
            {dirty ? <Pill tone="warn">{translate(locale, 'inputsModified')}</Pill> : null}
          </div>

          <div className="input-channel-config-grid">
            <label className={`input-channel-field${dirtyPaths.includes(fields.mode.path) ? ' is-dirty' : ''}`}>
              <span className="input-channel-field-label">
                {fields.mode.label}
                {dirtyPaths.includes(fields.mode.path) ? <span className="input-channel-field-dot" aria-hidden /> : null}
              </span>
              <select
                value={effectiveMode}
                disabled={disabled}
                onChange={(e) => onModeChange(channel, e.target.value)}
              >
                {modeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="input-channel-field-desc">{fields.mode.description}</span>
            </label>

            {!isThermistor ? (
              <>
                <GpioConfigField
                  locale={locale}
                  field={fields.idx}
                  value={channelValue(channel, 'idx', values)}
                  dirty={dirtyPaths.includes(fields.idx.path)}
                  disabled={disabled || effectiveMode === '0'}
                  onChange={(value) => onChange(channel.fields.idx, value)}
                />
                <GpioConfigField
                  locale={locale}
                  field={fields.invert}
                  value={channelValue(channel, 'invert', values)}
                  dirty={dirtyPaths.includes(fields.invert.path)}
                  disabled={disabled || effectiveMode === '0'}
                  onChange={(value) => onChange(channel.fields.invert, value)}
                />
                {fields.amin && channel.fields.amin ? (
                  <GpioConfigField
                    locale={locale}
                    field={fields.amin}
                    value={channelValue(channel, 'amin', values)}
                    dirty={dirtyPaths.includes(fields.amin.path)}
                    disabled={disabled || !isAnalog}
                    inactive={!isAnalog}
                    onChange={(value) => onChange(channel.fields.amin!, value)}
                  />
                ) : null}
                {fields.amax && channel.fields.amax ? (
                  <GpioConfigField
                    locale={locale}
                    field={fields.amax}
                    value={channelValue(channel, 'amax', values)}
                    dirty={dirtyPaths.includes(fields.amax.path)}
                    disabled={disabled || !isAnalog}
                    inactive={!isAnalog}
                    onChange={(value) => onChange(channel.fields.amax!, value)}
                  />
                ) : null}
              </>
            ) : null}
          </div>

          {isThermistor && onApplyThermistorPreset && onChangeThermistorLimit ? (
            <ThermistorChannelConfig
              locale={locale}
              disabled={disabled}
              lowerLimit={thermistorLowerLimit}
              upperLimit={thermistorUpperLimit}
              isDirty={thermistorDirty}
              onApplyPreset={onApplyThermistorPreset}
              onChangeLowerLimit={(val) => onChangeThermistorLimit('temp_limit_lower', val)}
              onChangeUpperLimit={(val) => onChangeThermistorLimit('temp_limit_upper', val)}
            />
          ) : null}

          {isAnalog && analogProcessor ? (
            <AnalogSignalTuning
              locale={locale}
              filterOn={analogProcessor.filterOn}
              cutoffRaw={analogProcessor.cutoffRaw}
              cutoffValid={analogProcessor.cutoffValid}
              cutoffNum={analogProcessor.cutoffNum}
              disabled={disabled || analogProcessor.processorDisabled}
              onToggleFilter={(v) => void analogProcessor.onToggleFilter(v)}
              onCutoffChange={analogProcessor.onCutoffChange}
              onCutoffCommit={analogProcessor.onCutoffCommit}
              onCutoffPreset={(hz) => void analogProcessor.onCutoffPreset(hz)}
            />
          ) : null}

          <details className="input-channel-help">
            <summary>{translate(locale, 'inputsChannelHelp')}</summary>
            <div className="input-channel-help-body">
              {[fields.mode, fields.idx, fields.invert, fields.amin, fields.amax, fields.cur]
                .filter((field): field is NonNullable<typeof field> => Boolean(field))
                .map((field) => {
                  const help = getFieldHelp(field, locale);
                  return (
                    <div key={field.path} className="input-channel-help-item">
                      <code>{field.path}</code>
                      <p>{field.description}</p>
                      <span className="input-channel-help-meta">
                        {help.range ? `${translate(locale, 'fieldRange')}: ${help.range}` : null}
                        {help.unit ? `${help.range ? ' · ' : ''}${translate(locale, 'fieldUnit')}: ${help.unit}` : ''}
                      </span>
                    </div>
                  );
                })}
            </div>
          </details>
        </section>

        <div className="input-channel-actions">
          <button type="button" disabled={disabled} onClick={onRead}>
            {translate(locale, 'inputsReadChannel')}
          </button>
          {!isThermistor ? (
            <>
              <button type="button" disabled={disabled || !isAnalog || raw === undefined} onClick={onCaptureMin}>
                {translate(locale, 'inputsCaptureMin')}
              </button>
              <button type="button" disabled={disabled || !isAnalog || raw === undefined} onClick={onCaptureMax}>
                {translate(locale, 'inputsCaptureMax')}
              </button>
              <button
                type="button"
                disabled={disabled || !isAnalog}
                title={translate(locale, 'inputsResetMinMaxTip')}
                onClick={onResetMinMax}
              >
                {translate(locale, 'inputsResetMinMax')}
              </button>
            </>
          ) : null}
          <button type="button" disabled={disabled || !dirty} onClick={onApply}>
            {translate(locale, 'inputsApplyChannel')}
          </button>
        </div>
      </div>
    </Card>
  );
}

function GpioConfigField({
  locale,
  field,
  value,
  dirty,
  disabled,
  inactive = false,
  onChange,
}: {
  locale: Locale;
  field: ConfigField;
  value: string;
  dirty: boolean;
  disabled: boolean;
  inactive?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`input-channel-field${dirty ? ' is-dirty' : ''}${inactive ? ' is-inactive' : ''}`}>
      <span className="input-channel-field-label">
        {field.label}
        {dirty ? <span className="input-channel-field-dot" aria-hidden /> : null}
      </span>
      {field.type === 'enum' && field.options ? (
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          <option value="">{translate(locale, 'enumEmptyOption')}</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === 'bool' ? (
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          <option value="">{translate(locale, 'enumEmptyOption')}</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {localizeOptionLabel(locale, field, opt.value, opt.label)}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <span className="input-channel-field-desc">{field.description}</span>
    </label>
  );
}

function InputLiveDisplay({
  mode,
  raw,
  filtered,
  filterBypassed,
  min,
  max,
  thermistorTempC,
  thermistorLowerLimit = 80,
  thermistorUpperLimit = 100,
  locale,
  emptyLabel,
}: {
  mode: string;
  raw: number | null;
  filtered: number | null;
  filterBypassed: boolean;
  min: number;
  max: number;
  thermistorTempC?: number | null;
  thermistorLowerLimit?: number;
  thermistorUpperLimit?: number;
  locale: Locale;
  emptyLabel: string;
}) {
  const label = translate(locale, 'inputsLiveSignal');
  const filteredLabel = translate(locale, 'inputsFilteredSignal');

  return (
    <div className="input-channel-live">
      {mode === 'thermistor' ? (
        <ThermistorInputControl
          label={translate(locale, 'inputModeThermistor')}
          tempC={thermistorTempC ?? null}
          rawAdc={raw}
          lowerLimit={thermistorLowerLimit}
          upperLimit={thermistorUpperLimit}
          emptyLabel={emptyLabel}
        />
      ) : mode === '2' ? (
        <>
          <LinearAnalogAxis label={label} value={raw} min={min} max={max} tone="ok" emptyLabel={emptyLabel} />
          {filterBypassed ? (
            <div className="input-channel-filter-off">
              <span className="input-control-label">{filteredLabel}</span>
              <span className="input-channel-live-idle-value">{translate(locale, 'inputsFilterBypassed')}</span>
            </div>
          ) : filtered !== null ? (
            <LinearAnalogAxis
              label={filteredLabel}
              value={filtered}
              min={min}
              max={max}
              tone="accent"
              emptyLabel={emptyLabel}
            />
          ) : null}
        </>
      ) : mode === '1' ? (
        <ButtonInputControl
          label={label}
          pressed={isButtonPressed(raw, min, max)}
          raw={raw}
          pressedLabel={translate(locale, 'inputButtonPressed')}
          releasedLabel={translate(locale, 'inputButtonReleased')}
          emptyLabel={emptyLabel}
        />
      ) : mode === '3' ? (
        <ZeroWheelInputControl
          label={label}
          active={isButtonPressed(raw, min, max)}
          raw={raw}
          readyLabel={translate(locale, 'inputZeroReady')}
          triggeredLabel={translate(locale, 'inputZeroTriggered')}
          hint={translate(locale, 'inputZeroHint')}
          emptyLabel={emptyLabel}
        />
      ) : (
        <div className="input-channel-live-idle">
          <span className="input-control-label">{label}</span>
          <span className="input-channel-live-idle-value">{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}
