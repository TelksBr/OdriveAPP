import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { applyAs5047Preset, applyMt6835Preset, zeroWheel } from './calibrationPresets';
import { detectEncoderProfile } from './calibrationTargets';
import { NtcCalculatorModal } from './NtcCalculatorModal';
import { As5047DiagnosticsPanel } from './As5047DiagnosticsPanel';
import { Mt6835DiagnosticsPanel } from './Mt6835DiagnosticsPanel';

export function EncoderToolsPanel() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [ntcOpen, setNtcOpen] = useState(false);
  const profile = detectEncoderProfile(state.fieldValues['axis0.encoder.config.mode']);
  const incremental = profile === 'incremental';

  return (
    <>
      <Card title={translate(locale, 'encoderToolsTitle')} description={translate(locale, 'encoderToolsDescription')}>
        {incremental ? (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          {translate(locale, 'encoderIncrementalWarn')}
        </p>
        ) : (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          {translate(locale, 'calFfbCenterHint')}
        </p>
        )}
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600 }}>{translate(locale, 'encoderAs5047WorkflowTitle')}</p>
        <ol className="cal-nvm-steps" style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          <li>{translate(locale, 'encoderAs5047Step1')}</li>
          <li>{translate(locale, 'encoderAs5047Step2')}</li>
          <li>{translate(locale, 'encoderAs5047Step3')}</li>
        </ol>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>
          {translate(locale, 'encoderZeroPersistHint')}
        </p>
        <div className="toolbar">
          <button
            type="button"
            disabled={!state.connected || state.busy}
            onClick={() => {
              void (async () => {
                dispatch({ type: 'set-busy', busy: true });
                try {
                  const ok = await zeroWheel(dispatch);
                  dispatch({
                    type: 'append-log',
                    direction: ok ? 'info' : 'error',
                    message: translate(
                      locale,
                      ok ? 'dashboardWheelCenteredSaved' : 'dashboardWheelCenteredEepromFail',
                    ),
                  });
                } finally {
                  dispatch({ type: 'set-busy', busy: false });
                }
              })();
            }}
          >
            {translate(locale, 'encoderZeroWheel')}
          </button>
          <button
            type="button"
            disabled={state.busy}
            onClick={() => {
              if (window.confirm(translate(locale, 'encoderAs5047Confirm'))) {
                applyAs5047Preset(dispatch);
                dispatch({
                  type: 'append-log',
                  direction: 'info',
                  message: translate(locale, 'calAs5047PresetStaged'),
                });
              }
            }}
          >
            {translate(locale, 'encoderAs5047Preset')}
          </button>
          <button
            type="button"
            disabled={state.busy}
            onClick={() => {
              if (window.confirm(translate(locale, 'encoderMt6835Confirm'))) {
                applyMt6835Preset(dispatch);
                dispatch({
                  type: 'append-log',
                  direction: 'info',
                  message: translate(locale, 'calMt6835PresetStaged'),
                });
              }
            }}
          >
            {translate(locale, 'encoderMt6835Preset')}
          </button>
          <button type="button" disabled={state.busy} onClick={() => setNtcOpen(true)}>
            {translate(locale, 'ntcOpenCalc')}
          </button>
        </div>
      </Card>
      {profile === 'mt6835' ? <Mt6835DiagnosticsPanel /> : <As5047DiagnosticsPanel />}
      {profile !== 'mt6835' && profile !== 'as5047' ? <Mt6835DiagnosticsPanel /> : null}
      {ntcOpen ? <NtcCalculatorModal onClose={() => setNtcOpen(false)} /> : null}
    </>
  );
}
