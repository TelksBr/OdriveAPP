import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { axisStateLabel } from '../../i18n/fieldMeta';
import { SectionHeader } from '../../shared/ui';
import { calibrationAxisActions } from './calibrationActions';
import { clearErrors, runAxisState } from './calibrationRunner';
import { applyAs5047Preset, zeroWheel } from './calibrationPresets';
import { detectEncoderProfile } from './calibrationTargets';
import { CalibrationWorkflowCard } from './CalibrationWorkflowCard';
import { CalibrationFinalizeCard } from './CalibrationFinalizeCard';
import { AnticogWorkflowCard } from './AnticogWorkflowCard';
import { MechanicalCenterPanel } from './MechanicalCenterPanel';
import { EncoderTypeSelectorCard } from './EncoderTypeSelectorCard';
import {
  calibrationRunWorkflows,
  closedLoopWorkflow,
  optionalCalibrationWorkflows,
} from './calibrationWorkflows';
import { type CalibrationLiveStatus } from './calibrationFinalize';
import { mergeCalFlag } from './calibrationStatus';
import { parseBoolField, isPresetSynced, getPostCalibrationPreset } from './calibrationBootPresets';
import { NtcCalculatorModal } from './NtcCalculatorModal';

export function CalibrationPage() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [ntcOpen, setNtcOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<CalibrationLiveStatus | null>(null);
  const [calRefreshToken, setCalRefreshToken] = useState(0);

  const bumpCalStatus = () => setCalRefreshToken((token) => token + 1);

  const fv = state.fieldValues;
  const axisState = fv['axis0.current_state'] ?? '—';
  const motorOk = mergeCalFlag(fv, 'axis0.motor.is_calibrated', liveStatus?.motorCalibrated);
  const encOk = mergeCalFlag(fv, 'axis0.encoder.is_ready', liveStatus?.encoderReady);
  const useIndex = parseBoolField(fv['axis0.encoder.config.use_index']);
  const encoderProfile = detectEncoderProfile(fv['axis0.encoder.config.mode']);
  const incrementalNoIndex = encoderProfile === 'incremental' && !useIndex;
  const finalized = isPresetSynced(getPostCalibrationPreset(fv), fv) && motorOk && encOk;
  const canClosedLoop = finalized || (motorOk && encOk);

  async function handleIdle() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await runAxisState(1, 5000, false);
      dispatch({
        type: 'append-log',
        direction: result.ok ? 'info' : 'error',
        message: result.ok ? translate(locale, 'setupToastStateDone') : translate(locale, 'setupToastStateFail'),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function handleClearErrors() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      await clearErrors();
      dispatch({ type: 'append-log', direction: 'info', message: 'sc' });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  async function runAdvanced(stateNum: number, timeoutMs: number) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await runAxisState(stateNum, timeoutMs, true);
      dispatch({
        type: 'append-log',
        direction: result.ok ? 'info' : 'error',
        message: result.ok
          ? translate(locale, 'setupToastStateDone')
          : `${translate(locale, 'setupToastStateFail')} (${result.reason ?? 'unknown'}${result.detail ? `: ${result.detail}` : ''})`,
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  let step = 1;
  const nextStep = () => step++;

  return (
    <div className="page-stack cal-page">
      <SectionHeader
        title={translate(locale, 'tabCalibration')}
        description={translate(locale, 'calFlowPageDesc')}
      />

      <div className="cal-workflow-status">
        <div className="cal-status-item">
          <span className="lbl">{translate(locale, 'calStatusAxisState')}</span>
          <span className="val">
            {axisState} <span className="muted">({axisStateLabel(locale, axisState)})</span>
          </span>
        </div>
        <div className="cal-status-item">
          <span className="lbl">{translate(locale, 'calStatusMotorCal')}</span>
          <span className={`val ${motorOk ? 'ok' : 'warn'}`}>
            {motorOk ? translate(locale, 'liveValueTrue') : translate(locale, 'liveValueFalse')}
          </span>
        </div>
        <div className="cal-status-item">
          <span className="lbl">{translate(locale, 'calStatusEncoderReady')}</span>
          <span className={`val ${encOk ? 'ok' : 'warn'}`}>
            {encOk ? translate(locale, 'liveValueTrue') : translate(locale, 'liveValueFalse')}
          </span>
        </div>
        <div className="cal-workflow-status-actions">
          <button type="button" className="warn" disabled={!state.connected || state.busy} onClick={() => void handleClearErrors()}>
            {translate(locale, 'setupErrClear')}
          </button>
          <button type="button" disabled={!state.connected || state.busy} onClick={() => void handleIdle()}>
            {translate(locale, 'calActionIdle')}
          </button>
        </div>
      </div>

      <p className="cal-flow-intro">{translate(locale, 'calFlowIntro')}</p>

      {/* Seletor de Arquitetura de Encoder e Inicialização */}
      <EncoderTypeSelectorCard onArchitectureChanged={bumpCalStatus} />

      {calibrationRunWorkflows.map((workflow) => {
        const idx = nextStep();
        if (workflow.id === 'encoder') {
          return (
            <CalibrationWorkflowCard key={workflow.id} workflow={workflow} index={idx} onCalComplete={bumpCalStatus}>
              <div className="cal-workflow-tools">
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
                  disabled={!state.connected || state.busy}
                  onClick={() => {
                    void (async () => {
                      dispatch({ type: 'set-busy', busy: true });
                      try {
                        await zeroWheel(dispatch);
                      } finally {
                        dispatch({ type: 'set-busy', busy: false });
                      }
                    })();
                  }}
                >
                  {translate(locale, 'encoderZeroWheel')}
                </button>
              </div>
              <p className="cal-workflow-prereq muted">{translate(locale, 'calFfbCenterHint')}</p>
              {useIndex ? <MechanicalCenterPanel /> : null}
              {incrementalNoIndex ? (
                <p className="cal-workflow-prereq muted">{translate(locale, 'encoderIncrementalWarn')}</p>
              ) : null}
            </CalibrationWorkflowCard>
          );
        }
        return <CalibrationWorkflowCard key={workflow.id} workflow={workflow} index={idx} onCalComplete={bumpCalStatus} />;
      })}

      <CalibrationFinalizeCard index={nextStep()} onStatusChange={setLiveStatus} refreshToken={calRefreshToken} />

      <CalibrationWorkflowCard
        workflow={closedLoopWorkflow}
        index={nextStep()}
        canRun={canClosedLoop}
        disabledReasonKey={canClosedLoop ? undefined : 'calFlowClosedLoopBlocked'}
      />

      {optionalCalibrationWorkflows.map((workflow) => (
        <CalibrationWorkflowCard key={workflow.id} workflow={workflow} index={nextStep()} />
      ))}

      <AnticogWorkflowCard index={nextStep()} />

      <details className="cal-advanced-details">
        <summary>{translate(locale, 'calAdvancedTitle')}</summary>
        <p className="cal-workflow-prereq">{translate(locale, 'calAdvancedDesc')}</p>
        <div className="cal-workflow-actions">
          {(['full-cal', 'lockin', 'homing'] as const).map((id) => {
            const action = calibrationAxisActions.find((item) => item.id === id);
            if (!action) {
              return null;
            }
            return (
              <button
                key={id}
                type="button"
                className={action.tone === 'danger' ? 'danger' : 'warn'}
                disabled={!state.connected || state.busy}
                onClick={() => void runAdvanced(action.state, action.timeoutMs)}
              >
                {translate(locale, action.labelKey)}
              </button>
            );
          })}
          <button type="button" disabled={state.busy} onClick={() => setNtcOpen(true)}>
            {translate(locale, 'ntcOpenCalc')}
          </button>
        </div>
      </details>

      {ntcOpen ? <NtcCalculatorModal onClose={() => setNtcOpen(false)} /> : null}
    </div>
  );
}
