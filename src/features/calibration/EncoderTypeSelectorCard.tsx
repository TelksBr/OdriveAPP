import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import {
  detectEncoderArchitecture,
  getBootPresetForArchitecture,
  type EncoderArchitecture,
} from './calibrationBootPresets';
import { applyAs5047Preset, applyMt6835Preset, writePaths } from './calibrationPresets';
import { toast } from '../../shared/toastActions';

interface EncoderTypeSelectorCardProps {
  onArchitectureChanged?: (arch: EncoderArchitecture) => void;
  index?: number;
}

export function EncoderTypeSelectorCard({ onArchitectureChanged, index }: EncoderTypeSelectorCardProps) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const fv = state.fieldValues;

  const detectedArch = detectEncoderArchitecture(fv);
  const [selectedArch, setSelectedArch] = useState<EncoderArchitecture>(detectedArch);
  const [applying, setApplying] = useState(false);

  async function handleApplyArchitecture(arch: EncoderArchitecture) {
    if (!state.connected) {
      toast(dispatch, translate(locale, 'connectFirst'), 'warn');
      return;
    }
    setApplying(true);
    dispatch({ type: 'set-busy', busy: true });
    try {
      const presetEntries = getBootPresetForArchitecture(arch);
      
      // Also configure encoder mode & use_index accordingly
      const hardwareEntries: { path: string; value: string | boolean }[] = [];
      if (arch === 'incremental_no_z') {
        hardwareEntries.push(
          { path: 'axis0.encoder.config.mode', value: '0' },
          { path: 'axis0.encoder.config.use_index', value: false },
        );
      } else if (arch === 'incremental_abz') {
        hardwareEntries.push(
          { path: 'axis0.encoder.config.mode', value: '0' },
          { path: 'axis0.encoder.config.use_index', value: true },
        );
      }

      const allEntries = [
        ...hardwareEntries,
        ...presetEntries.map((e) => ({ path: e.path, value: e.value })),
      ];

      const { fail, errors } = await writePaths(allEntries, dispatch);
      if (fail === 0) {
        dispatch({ type: 'set-nvm-pending', pending: true });
        const toastKey =
          arch === 'incremental_no_z'
            ? 'encoderArchAppliedOptA'
            : arch === 'incremental_abz'
            ? 'encoderArchAppliedOptB'
            : 'encoderArchAppliedOptC';
        toast(dispatch, translate(locale, toastKey), 'ok');
        onArchitectureChanged?.(arch);
      } else {
        toast(dispatch, `${translate(locale, 'calFinalizePresetFailed')}: ${errors.join(', ')}`, 'error');
      }
    } finally {
      setApplying(false);
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  const titleText = index !== undefined
    ? `${index}. ${translate(locale, 'encoderArchTitle')}`
    : translate(locale, 'encoderArchTitle');

  return (
    <Card
      title={titleText}
      description={translate(locale, 'encoderArchDesc')}
    >
      <div className="encoder-arch-grid">
        {/* Opção A — Incremental sem Z */}
        <div
          className={`encoder-arch-card ${selectedArch === 'incremental_no_z' ? 'active' : ''} ${
            detectedArch === 'incremental_no_z' ? 'detected' : ''
          }`}
          onClick={() => setSelectedArch('incremental_no_z')}
        >
          <div className="encoder-arch-head">
            <span className="encoder-arch-icon">🔄</span>
            <div className="encoder-arch-title-wrap">
              <h4>{translate(locale, 'encoderArchOptATitle')}</h4>
              <span className="encoder-arch-badge warn">{translate(locale, 'encoderArchOptABadge')}</span>
            </div>
            {detectedArch === 'incremental_no_z' ? (
              <span className="encoder-arch-current-badge">✓ {translate(locale, 'encoderArchCurrentBadge')}</span>
            ) : null}
          </div>

          <p className="encoder-arch-desc">{translate(locale, 'encoderArchOptADesc')}</p>

          <div className="encoder-arch-alert warn">
            <span>⚠ {translate(locale, 'encoderArchOptAWarn')}</span>
          </div>

          <ul className="encoder-arch-flags">
            <li><code>axis0.motor.config.pre_calibrated</code> = <b>true</b></li>
            <li><code>axis0.encoder.config.pre_calibrated</code> = <b>false</b></li>
            <li><code>axis0.config.startup_motor_calibration</code> = <b>false</b></li>
            <li><code>axis0.config.startup_encoder_offset_calibration</code> = <b>true</b></li>
            <li><code>axis0.config.startup_encoder_index_search</code> = <b>false</b></li>
            <li><code>axis0.config.startup_closed_loop_control</code> = <b>true</b></li>
          </ul>

          <div className="encoder-arch-actions">
            <button
              type="button"
              className={selectedArch === 'incremental_no_z' ? 'ok' : ''}
              disabled={!state.connected || state.busy || applying}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedArch('incremental_no_z');
                void handleApplyArchitecture('incremental_no_z');
              }}
            >
              {translate(locale, 'encoderArchApplyBtnA')}
            </button>
          </div>
        </div>

        {/* Opção B — Incremental com Index ABZ */}
        <div
          className={`encoder-arch-card ${selectedArch === 'incremental_abz' ? 'active' : ''} ${
            detectedArch === 'incremental_abz' ? 'detected' : ''
          }`}
          onClick={() => setSelectedArch('incremental_abz')}
        >
          <div className="encoder-arch-head">
            <span className="encoder-arch-icon">⚡</span>
            <div className="encoder-arch-title-wrap">
              <h4>{translate(locale, 'encoderArchOptBTitle')}</h4>
              <span className="encoder-arch-badge info">{translate(locale, 'encoderArchOptBBadge')}</span>
            </div>
            {detectedArch === 'incremental_abz' ? (
              <span className="encoder-arch-current-badge">✓ {translate(locale, 'encoderArchCurrentBadge')}</span>
            ) : null}
          </div>

          <p className="encoder-arch-desc">{translate(locale, 'encoderArchOptBDesc')}</p>

          <div className="encoder-arch-alert info">
            <span>ℹ️ {translate(locale, 'encoderArchOptBHint')}</span>
          </div>

          <ul className="encoder-arch-flags">
            <li><code>axis0.motor.config.pre_calibrated</code> = <b>true</b></li>
            <li><code>axis0.encoder.config.pre_calibrated</code> = <b>true</b></li>
            <li><code>axis0.encoder.config.use_index</code> = <b>true</b></li>
            <li><code>axis0.config.startup_motor_calibration</code> = <b>false</b></li>
            <li><code>axis0.config.startup_encoder_offset_calibration</code> = <b>false</b></li>
            <li><code>axis0.config.startup_encoder_index_search</code> = <b>true</b></li>
            <li><code>axis0.config.startup_closed_loop_control</code> = <b>true</b></li>
          </ul>

          <div className="encoder-arch-actions">
            <button
              type="button"
              className={selectedArch === 'incremental_abz' ? 'ok' : ''}
              disabled={!state.connected || state.busy || applying}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedArch('incremental_abz');
                void handleApplyArchitecture('incremental_abz');
              }}
            >
              {translate(locale, 'encoderArchApplyBtnB')}
            </button>
          </div>
        </div>

        {/* Opção C — Absoluto SPI (MT6835 / AS5047P) */}
        <div
          className={`encoder-arch-card ${selectedArch === 'spi_absolute' ? 'active' : ''} ${
            detectedArch === 'spi_absolute' ? 'detected' : ''
          }`}
          onClick={() => setSelectedArch('spi_absolute')}
        >
          <div className="encoder-arch-head">
            <span className="encoder-arch-icon">🚀</span>
            <div className="encoder-arch-title-wrap">
              <h4>{translate(locale, 'encoderArchOptCTitle')}</h4>
              <span className="encoder-arch-badge ok">{translate(locale, 'encoderArchOptCBadge')}</span>
            </div>
            {detectedArch === 'spi_absolute' ? (
              <span className="encoder-arch-current-badge">✓ {translate(locale, 'encoderArchCurrentBadge')}</span>
            ) : null}
          </div>

          <p className="encoder-arch-desc">{translate(locale, 'encoderArchOptCDesc')}</p>

          <div className="encoder-arch-alert ok">
            <span>✓ {translate(locale, 'encoderArchOptCHint')}</span>
          </div>

          <ul className="encoder-arch-flags">
            <li><code>axis0.motor.config.pre_calibrated</code> = <b>true</b></li>
            <li><code>axis0.encoder.config.pre_calibrated</code> = <b>true</b></li>
            <li><code>axis0.config.startup_motor_calibration</code> = <b>false</b></li>
            <li><code>axis0.config.startup_encoder_offset_calibration</code> = <b>false</b></li>
            <li><code>axis0.config.startup_encoder_index_search</code> = <b>false</b></li>
            <li><code>axis0.config.startup_closed_loop_control</code> = <b>true</b></li>
          </ul>

          <div className="encoder-arch-actions">
            <div className="encoder-arch-presets-row">
              <button
                type="button"
                className="small-btn"
                disabled={state.busy}
                title="Configura AS5047 (modo 257, CS GPIO 7, CPR 16384)"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(translate(locale, 'encoderAs5047Confirm'))) {
                    applyAs5047Preset(dispatch);
                  }
                }}
              >
                Preset AS5047P
              </button>
              <button
                type="button"
                className="small-btn"
                disabled={state.busy}
                title="Configura MT6835 (modo 261, CS GPIO 7, 21-bit)"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(translate(locale, 'encoderMt6835Confirm'))) {
                    applyMt6835Preset(dispatch);
                  }
                }}
              >
                Preset MT6835
              </button>
            </div>
            <button
              type="button"
              className={selectedArch === 'spi_absolute' ? 'ok' : ''}
              disabled={!state.connected || state.busy || applying}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedArch('spi_absolute');
                void handleApplyArchitecture('spi_absolute');
              }}
            >
              {translate(locale, 'encoderArchApplyBtnC')}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
