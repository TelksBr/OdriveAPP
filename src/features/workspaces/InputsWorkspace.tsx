import { useMemo } from 'react';
import { useAppState } from '../../app/AppState';
import { readField } from '../board/BoardProtocol';
import { applyConfigFields, applyOpenffboardRam } from '../board/fieldApply';
import { getFieldByPath, type ConfigField } from '../config/fieldCatalog';
import {
  channelValue,
  channelFields,
  createGpioChannel,
  GPIO_CHANNELS,
  writableChannelFields,
  type GpioChannel,
} from '../inputs/gpioChannel';
import { InputChannelPanel } from '../inputs/InputChannelPanel';
import { useGpioAnalogProcessor } from '../inputs/useGpioAnalogProcessor';
import { useInputsLivePoller } from '../inputs/useInputsLivePoller';
import type { NtcThermistorPreset } from '../inputs/ntcThermistorPresets';
import { translate } from '../../i18n/messages';
import { SectionHeader } from '../../shared/ui';
import { toast } from '../../shared/toastActions';

const THERMISTOR_CONFIG_PATHS = [
  'axis0.motor.motor_thermistor.config.gpio_pin',
  'axis0.motor.motor_thermistor.config.enabled',
  'axis0.motor.motor_thermistor.config.temp_limit_lower',
  'axis0.motor.motor_thermistor.config.temp_limit_upper',
  'axis0.motor.motor_thermistor.config.poly_coefficient_0',
  'axis0.motor.motor_thermistor.config.poly_coefficient_1',
  'axis0.motor.motor_thermistor.config.poly_coefficient_2',
  'axis0.motor.motor_thermistor.config.poly_coefficient_3',
] as const;

export function InputsWorkspace() {
  const { state, dispatch } = useAppState();
  const channels = useMemo(() => GPIO_CHANNELS.map(createGpioChannel), []);

  const thermistorPin = state.fieldValues['axis0.motor.motor_thermistor.config.gpio_pin'] || '4';
  const thermistorEnabled = state.fieldValues['axis0.motor.motor_thermistor.config.enabled'] === 'true';
  const thermistorLowerLimit = state.fieldValues['axis0.motor.motor_thermistor.config.temp_limit_lower'] || '80.0';
  const thermistorUpperLimit = state.fieldValues['axis0.motor.motor_thermistor.config.temp_limit_upper'] || '100.0';
  const thermistorDirty = THERMISTOR_CONFIG_PATHS.some((path) => state.dirtyPaths.includes(path));

  const { liveValues, motorTempC, polling } = useInputsLivePoller(
    channels,
    state.connected,
    state.busy,
    thermistorEnabled,
  );
  const processor = useGpioAnalogProcessor();

  const analogProcessorProps = {
    filterOn: processor.filterOn,
    cutoffRaw: processor.cutoffRaw,
    cutoffValid: processor.cutoffValid,
    cutoffNum: processor.cutoffNum,
    processorDisabled: processor.disabled,
    onToggleFilter: processor.toggleFilter,
    onCutoffChange: processor.setCutoffDraft,
    onCutoffCommit: processor.flushCutoff,
    onCutoffPreset: (hz: number) => void processor.commitCutoff(String(hz)),
  };

  const mergedValues = useMemo(
    () => ({ ...state.fieldValues, ...liveValues }),
    [state.fieldValues, liveValues],
  );

  const analogCount = channels.filter((ch) => {
    const isTherm = thermistorEnabled && thermistorPin === String(ch.gpio);
    return !isTherm && channelValue(ch, 'mode', mergedValues) === '2';
  }).length;
  const liveCount = channels.filter((ch) => channelValue(ch, 'cur', mergedValues) !== '').length;
  const dirtyCount = channels.filter((ch) => {
    const isTherm = thermistorPin === String(ch.gpio);
    const hasChannelDirty = channelFields(ch).some((field) => state.dirtyPaths.includes(field.path));
    return hasChannelDirty || (isTherm && thermistorDirty);
  }).length;

  const disabled = !state.connected || state.busy;

  function handleModeChange(channel: GpioChannel, newMode: string) {
    if (newMode === 'thermistor') {
      dispatch({ type: 'set-field', path: `gpio.${channel.gpio}.mode`, value: '0' });
      dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.gpio_pin', value: String(channel.gpio) });
      dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.enabled', value: 'true' });
      if (!state.fieldValues['axis0.motor.motor_thermistor.config.poly_coefficient_0']) {
        dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.poly_coefficient_0', value: '363.939' });
        dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.poly_coefficient_1', value: '-462.154' });
        dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.poly_coefficient_2', value: '307.551' });
        dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.poly_coefficient_3', value: '-27.726' });
        dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.temp_limit_lower', value: '80.0' });
        dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.temp_limit_upper', value: '100.0' });
      }
    } else {
      if (state.fieldValues['axis0.motor.motor_thermistor.config.gpio_pin'] === String(channel.gpio)) {
        dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.enabled', value: 'false' });
      }
      dispatch({ type: 'set-field', path: `gpio.${channel.gpio}.mode`, value: newMode });
    }
  }

  function handleApplyThermistorPreset(preset: NtcThermistorPreset) {
    dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.poly_coefficient_0', value: preset.poly0 });
    dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.poly_coefficient_1', value: preset.poly1 });
    dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.poly_coefficient_2', value: preset.poly2 });
    dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.poly_coefficient_3', value: preset.poly3 });
    dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.temp_limit_lower', value: preset.tempLimitLower });
    dispatch({ type: 'set-field', path: 'axis0.motor.motor_thermistor.config.temp_limit_upper', value: preset.tempLimitUpper });
  }

  function handleChangeThermistorLimit(key: 'temp_limit_lower' | 'temp_limit_upper', value: string) {
    dispatch({ type: 'set-field', path: `axis0.motor.motor_thermistor.config.${key}`, value });
  }

  async function readChannel(channel: GpioChannel) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const isTherm = thermistorPin === String(channel.gpio);
      const thermFields = isTherm
        ? THERMISTOR_CONFIG_PATHS.map(getFieldByPath).filter((f): f is ConfigField => Boolean(f))
        : [];
      const fieldsToRead = [...channelFields(channel), ...thermFields];
      for (const field of fieldsToRead) {
        const value = await readField(field);
        dispatch({ type: 'set-field', path: field.path, value, dirty: false });
      }
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function readAllInputs() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      for (const channel of channels) {
        for (const field of channelFields(channel)) {
          const value = await readField(field);
          dispatch({ type: 'set-field', path: field.path, value, dirty: false });
        }
      }
      for (const path of THERMISTOR_CONFIG_PATHS) {
        const field = getFieldByPath(path);
        if (field) {
          const value = await readField(field);
          dispatch({ type: 'set-field', path: field.path, value, dirty: false });
        }
      }
      await processor.reload();
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function applyChannel(channel: GpioChannel) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const channelEntries = writableChannelFields(channel).map((field) => ({
        field,
        value: state.fieldValues[field.path] ?? '',
      }));
      const isTherm = thermistorPin === String(channel.gpio);
      const thermistorEntries = isTherm
        ? THERMISTOR_CONFIG_PATHS.map((p) => {
            const field = getFieldByPath(p);
            return field ? { field, value: state.fieldValues[p] ?? '' } : null;
          }).filter((e): e is NonNullable<typeof e> => Boolean(e))
        : [];
      const entries = [...channelEntries, ...thermistorEntries];
      const result = await applyConfigFields(entries);
      for (const [path, applied] of Object.entries(result.applied)) {
        dispatch({ type: 'set-field', path, value: applied, dirty: false });
      }
      const suffix = result.persistedFfb
        ? translate(state.locale, 'applyLogFfbEepromOk')
        : result.hasFfbFields
          ? translate(state.locale, 'applyLogFfbEepromFail')
          : translate(state.locale, 'applyLogOdriveRam');
      dispatch({
        type: 'append-log',
        direction: 'rx',
        message: `${translate(state.locale, 'logGpioApplied', { n: channel.gpio })} — ${suffix}`,
      });
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  function setValue(field: ConfigField, value: string) {
    dispatch({ type: 'set-field', path: field.path, value });
  }

  function capture(channel: GpioChannel, target: 'amin' | 'amax') {
    const field = channel.fields[target];
    const current = channelValue(channel, 'cur', mergedValues);
    if (!field || !current) {
      return;
    }
    setValue(field, current);
  }

  async function resetMinMax(channel: GpioChannel) {
    const amin = channel.fields.amin;
    const amax = channel.fields.amax;
    if (!amin || !amax) {
      return;
    }
    if (
      !window.confirm(translate(state.locale, 'inputsResetMinMaxConfirm', { n: channel.gpio }))
    ) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      const applied = await applyOpenffboardRam([
        { field: amin, value: '4095' },
        { field: amax, value: '0' },
      ]);
      for (const [path, value] of Object.entries(applied)) {
        dispatch({ type: 'set-field', path, value, dirty: false });
        dispatch({ type: 'mark-nvm-pending-path', path });
      }
      toast(dispatch, translate(state.locale, 'inputsResetMinMaxDone', { n: channel.gpio }), 'ok');
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <div className="inputs-page">
      <SectionHeader
        eyebrow={translate(state.locale, 'inputsHeroEyebrow')}
        title={translate(state.locale, 'inputsHeroTitle')}
        description={translate(state.locale, 'inputsHeroDescription')}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {polling && (
              <span className="pill pill-ok" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                {translate(state.locale, 'inputsLiveBadge')}
              </span>
            )}
            <button type="button" disabled={disabled} onClick={() => void readAllInputs()}>
              {translate(state.locale, 'inputsReadAll')}
            </button>
          </div>
        }
      />

      <div className="inputs-kpis">
        <InputKpi label={translate(state.locale, 'inputsConfiguredAxes')} value={String(analogCount)} />
        <InputKpi label={translate(state.locale, 'inputsLiveSignals')} value={`${liveCount}/4`} tone={liveCount > 0 ? 'ok' : 'neutral'} />
        <InputKpi label={translate(state.locale, 'inputsDirtyChannels')} value={String(dirtyCount)} tone={dirtyCount > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="input-channel-grid">
        {channels.map((channel) => {
          const isTherm = thermistorEnabled && thermistorPin === String(channel.gpio);
          const isAnalog = !isTherm && channelValue(channel, 'mode', mergedValues) === '2';
          return (
            <InputChannelPanel
              key={channel.gpio}
              channel={channel}
              disabled={disabled}
              values={mergedValues}
              dirtyPaths={state.dirtyPaths}
              locale={state.locale}
              analogProcessor={isAnalog ? analogProcessorProps : undefined}
              thermistorPin={thermistorPin}
              thermistorEnabled={thermistorEnabled}
              thermistorTempC={isTherm ? motorTempC : null}
              thermistorLowerLimit={thermistorLowerLimit}
              thermistorUpperLimit={thermistorUpperLimit}
              thermistorDirty={thermistorDirty}
              onModeChange={handleModeChange}
              onApplyThermistorPreset={handleApplyThermistorPreset}
              onChangeThermistorLimit={handleChangeThermistorLimit}
              onRead={() => void readChannel(channel)}
              onApply={() => void applyChannel(channel)}
              onCaptureMin={() => capture(channel, 'amin')}
              onCaptureMax={() => capture(channel, 'amax')}
              onResetMinMax={() => void resetMinMax(channel)}
              onChange={setValue}
            />
          );
        })}
      </div>
    </div>
  );
}

function InputKpi({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <div className={`input-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

