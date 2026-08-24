import { useState } from 'react';
import { translate, type Locale } from '../../i18n/messages';
import { NtcCalculatorModal } from '../calibration/NtcCalculatorModal';
import { NTC_10K_PRESET, NTC_100K_PRESET, type NtcThermistorPreset } from './ntcThermistorPresets';

interface ThermistorChannelConfigProps {
  locale: Locale;
  disabled: boolean;
  lowerLimit: string;
  upperLimit: string;
  isDirty: boolean;
  onApplyPreset: (preset: NtcThermistorPreset) => void;
  onChangeLowerLimit: (value: string) => void;
  onChangeUpperLimit: (value: string) => void;
}

export function ThermistorChannelConfig({
  locale,
  disabled,
  lowerLimit,
  upperLimit,
  isDirty,
  onApplyPreset,
  onChangeLowerLimit,
  onChangeUpperLimit,
}: ThermistorChannelConfigProps) {
  const [ntcCalcOpen, setNtcCalcOpen] = useState(false);

  return (
    <div className="input-channel-thermistor-config" style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Presets Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {translate(locale, 'inputsThermistorPresets')}
        </span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary small"
            disabled={disabled}
            onClick={() => onApplyPreset(NTC_10K_PRESET)}
          >
            {translate(locale, 'inputsThermistorNtc10k')}
          </button>
          <button
            type="button"
            className="secondary small"
            disabled={disabled}
            onClick={() => onApplyPreset(NTC_100K_PRESET)}
          >
            {translate(locale, 'inputsThermistorNtc100k')}
          </button>
          <button
            type="button"
            className="secondary small"
            disabled={disabled}
            onClick={() => setNtcCalcOpen(true)}
            style={{ marginLeft: 'auto' }}
          >
            ⚙️ {translate(locale, 'inputsThermistorOpenCalc')}
          </button>
        </div>
      </div>

      {/* Limits Grid */}
      <div className="input-channel-config-grid">
        <label className={`input-channel-field${isDirty ? ' is-dirty' : ''}`}>
          <span className="input-channel-field-label">
            {translate(locale, 'inputsThermistorLowerLimit')}
          </span>
          <input
            type="number"
            step="1"
            min="20"
            max="150"
            value={lowerLimit || '80.0'}
            disabled={disabled}
            onChange={(e) => onChangeLowerLimit(e.target.value)}
          />
        </label>

        <label className={`input-channel-field${isDirty ? ' is-dirty' : ''}`}>
          <span className="input-channel-field-label">
            {translate(locale, 'inputsThermistorUpperLimit')}
          </span>
          <input
            type="number"
            step="1"
            min="30"
            max="160"
            value={upperLimit || '100.0'}
            disabled={disabled}
            onChange={(e) => onChangeUpperLimit(e.target.value)}
          />
        </label>
      </div>

      {ntcCalcOpen ? <NtcCalculatorModal onClose={() => setNtcCalcOpen(false)} /> : null}
    </div>
  );
}
