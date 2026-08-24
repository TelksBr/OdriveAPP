import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import {
  isPresetSynced,
  getPostCalibrationPreset,
  detectEncoderArchitecture,
} from './calibrationBootPresets';
import {
  applyPostCalibrationPresetAndSave,
  canArmClosedLoop,
  isPostCalibrationPersisted,
  readCalibrationLiveStatus,
  type CalibrationLiveStatus,
} from './calibrationFinalize';
import { mergeCalFlag } from './calibrationStatus';
import { toast, toastSticky, toastStickyClose } from '../../shared/toastActions';
import type { SaveProgress } from '../board/unifiedSave';

const FINALIZE_STICKY_ID = 'cal-finalize-progress';

const saveProgressKey: Record<SaveProgress, string> = {
  writing_changes: 'saveWritingChanges',
  disarming: 'saveDisarming',
  persisting_ffb: 'savePersistingFfb',
  persisting_odrive: 'savePersistingOdrive',
  rebooting: 'saveRebooting',
  reconnecting: 'saveReconnecting',
  reading_back: 'saveReadingBack',
};

interface CalibrationFinalizeCardProps {
  index: number;
  onStatusChange?: (status: CalibrationLiveStatus) => void;
  /** Bump after motor/encoder cal so we re-read the board. */
  refreshToken?: number;
}

export function CalibrationFinalizeCard({ index, onStatusChange, refreshToken = 0 }: CalibrationFinalizeCardProps) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<CalibrationLiveStatus | null>(null);
  const busyRef = useRef(state.busy);
  busyRef.current = state.busy;

  const fv = state.fieldValues;
  const arch = detectEncoderArchitecture(fv);
  const preset = getPostCalibrationPreset(fv);
  const motorOk = mergeCalFlag(fv, 'axis0.motor.is_calibrated', live?.motorCalibrated);
  const encOk = mergeCalFlag(fv, 'axis0.encoder.is_ready', live?.encoderReady);
  const presetSynced = isPresetSynced(preset, fv);
  const persisted = live ? isPostCalibrationPersisted(live, fv) : presetSynced && motorOk && encOk;
  const canFinalize = motorOk && encOk && !state.busy && state.connected;

  async function refreshLive() {
    if (!state.connected) {
      return;
    }
    try {
      const status = await readCalibrationLiveStatus();
      setLive(status);
      onStatusChange?.(status);
      dispatch({ type: 'set-field', path: 'axis0.motor.is_calibrated', value: status.motorCalibrated ? 'true' : 'false', dirty: false });
      dispatch({ type: 'set-field', path: 'axis0.encoder.is_ready', value: status.encoderReady ? 'true' : 'false', dirty: false });
      dispatch({
        type: 'set-field',
        path: 'axis0.motor.config.pre_calibrated',
        value: status.motorPreCalibrated ? 'true' : 'false',
        dirty: false,
      });
      dispatch({
        type: 'set-field',
        path: 'axis0.encoder.config.pre_calibrated',
        value: status.encoderPreCalibrated ? 'true' : 'false',
        dirty: false,
      });
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  useEffect(() => {
    if (!state.connected) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (!busyRef.current) {
        void refreshLive();
      }
    }, refreshToken > 0 ? 200 : 600);
    return () => window.clearTimeout(timer);
  }, [state.connected, refreshToken]);

  async function handleFinalize() {
    setRunning(true);
    dispatch({ type: 'set-busy', busy: true });
    try {
      const result = await applyPostCalibrationPresetAndSave(dispatch, fv, (step) => {
        toastSticky(dispatch, FINALIZE_STICKY_ID, translate(locale, saveProgressKey[step]), { kind: 'info' });
      });
      toastStickyClose(dispatch, FINALIZE_STICKY_ID);
      if (result.status) {
        setLive(result.status);
        onStatusChange?.(result.status);
      }
      const msgKey =
        arch === 'incremental_no_z'
          ? 'calFinalizeOkIncremental'
          : arch === 'incremental_abz'
          ? 'calFinalizeOkAbz'
          : 'calFinalizeOk';
      const msg = translate(locale, msgKey);
      dispatch({ type: 'append-log', direction: 'info', message: msg });
      toast(dispatch, msg, 'ok');
    } catch (error) {
      toastStickyClose(dispatch, FINALIZE_STICKY_ID);
      const raw = error instanceof Error ? error.message : 'calFinalizePresetFailed';
      const [key, detail] = raw.split('|', 2);
      const msg = key.startsWith('calFinalize')
        ? detail
          ? `${translate(locale, key)} (${detail})`
          : translate(locale, key)
        : raw;
      dispatch({ type: 'append-log', direction: 'error', message: msg });
      toast(dispatch, msg, 'error');
    } finally {
      setRunning(false);
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  const archBadgeKey =
    arch === 'incremental_no_z'
      ? 'encoderArchOptABadge'
      : arch === 'incremental_abz'
      ? 'encoderArchOptBBadge'
      : 'encoderArchOptCBadge';

  const archHintKey =
    arch === 'incremental_no_z'
      ? 'calFinalizeHintIncremental'
      : arch === 'incremental_abz'
      ? 'calFinalizeHintAbz'
      : 'calFinalizeHint';

  const archBootNoteKey =
    arch === 'incremental_no_z'
      ? 'calFinalizeBootNoteIncremental'
      : arch === 'incremental_abz'
      ? 'calFinalizeBootNoteAbz'
      : 'calFinalizeBootNote';

  return (
    <Card
      title={`${index}. ${translate(locale, 'calFinalizeTitle')}`}
      description={translate(locale, 'calFinalizeDesc')}
    >
      <div className="cal-workflow-head">
        <span className={`cal-workflow-badge${persisted ? ' ok' : ''}`}>
          {persisted ? translate(locale, 'calFlowStatusDone') : translate(locale, 'calFlowStatusPending')}
        </span>
        <span className="cal-workflow-badge">
          {translate(locale, archBadgeKey)}
        </span>
        <button type="button" className="linkish" disabled={!state.connected || state.busy} onClick={() => void refreshLive()}>
          {translate(locale, 'calRefreshStatus')}
        </button>
      </div>

      <ul className="cal-finalize-checklist">
        <li className={motorOk ? 'ok' : 'warn'}>
          {translate(locale, 'calStatusMotorCal')}: {motorOk ? '✓' : '—'}
        </li>
        <li className={encOk ? 'ok' : 'warn'}>
          {translate(locale, 'calStatusEncoderReady')}: {encOk ? '✓' : '—'}
        </li>
        <li className={presetSynced ? 'ok' : ''}>
          {translate(locale, 'calFinalizePresetLabel')}: {presetSynced ? '✓' : '—'}
        </li>
      </ul>

      <p className="cal-workflow-prereq">
        {translate(locale, archHintKey)}
      </p>

      <ul className="cal-workflow-preset-list">
        {preset.map((entry) => (
          <li key={entry.path}>
            <code>{entry.path}</code>
            <span>= {typeof entry.value === 'boolean' ? (entry.value ? 'true' : 'false') : entry.value}</span>
          </li>
        ))}
      </ul>

      <div className="cal-workflow-actions">
        <button
          type="button"
          className="ok"
          disabled={!canFinalize || running}
          onClick={() => void handleFinalize()}
        >
          {running ? translate(locale, 'calFlowBtnPersisting') : translate(locale, 'calFinalizeBtn')}
        </button>
      </div>

      {live && canArmClosedLoop(live) && persisted ? (
        <p className="cal-workflow-prereq ok">
          {translate(locale, archBootNoteKey)}
        </p>
      ) : null}
    </Card>
  );
}

