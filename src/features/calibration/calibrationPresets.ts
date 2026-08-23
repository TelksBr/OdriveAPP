import type { Dispatch } from 'react';
import type { AppAction } from '../../app/types';
import { getFieldByPath, type ConfigField } from '../config/fieldCatalog';
import { readField, applyField, applyFieldNow } from '../board/BoardProtocol';
import { persistFfbEeprom } from '../board/fieldApply';
import { markOdriveRamPending } from '../board/persistPending';
import { serialService } from '../serial/SerialService';
import { readAllFields } from '../board/unifiedSave';
import { as5047EncoderTargets, mt6835EncoderTargets } from './calibrationTargets';
import { applyBootPreset } from './calibrationBootPresets';
import { sleep } from '../../shared/sleep';

export function fieldByPath(path: string): ConfigField | undefined {
  return getFieldByPath(path);
}

export async function writePath(
  path: string,
  value: string | boolean,
  dispatch: Dispatch<AppAction>,
  options?: { markNvmPending?: boolean },
): Promise<boolean> {
  const field = fieldByPath(path);
  if (!field || field.readonly) {
    return false;
  }
  const normalized = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
  const applied = await applyField(field, normalized);
  dispatch({ type: 'append-log', direction: 'rx', message: `${path} = ${applied}` });
  dispatch({ type: 'set-field', path, value: applied, dirty: false });
  if (options?.markNvmPending !== false) {
    markOdriveRamPending(dispatch, field);
  }
  return true;
}

export async function writePaths(
  specs: { path: string; value: string | boolean }[],
  dispatch: Dispatch<AppAction>,
): Promise<{ ok: number; fail: number; errors: string[] }> {
  return serialService.runAtomic(() => writePathsNow(specs, dispatch));
}

/** For use inside an existing serialService.runAtomic() — no nested queue lock. */
export async function writePathsNow(
  specs: { path: string; value: string | boolean }[],
  dispatch: Dispatch<AppAction>,
  options?: { markNvmPending?: boolean; retries?: number },
): Promise<{ ok: number; fail: number; errors: string[] }> {
  let ok = 0;
  let fail = 0;
  const errors: string[] = [];
  const retries = options?.retries ?? 0;

  for (const spec of specs) {
    let applied = false;
    let lastError = 'unknown';
    for (let attempt = 0; attempt <= retries && !applied; attempt += 1) {
      if (attempt > 0) {
        await sleep(400);
      }
      try {
        const field = fieldByPath(spec.path);
        if (!field || field.readonly) {
          lastError = 'field missing or readonly';
          break;
        }
        const normalized = typeof spec.value === 'boolean' ? (spec.value ? 'true' : 'false') : spec.value;
        const readback = await applyFieldNow(field, normalized, true);
        dispatch({ type: 'append-log', direction: 'rx', message: `${spec.path} = ${readback}` });
        dispatch({ type: 'set-field', path: spec.path, value: readback, dirty: false });
        if (options?.markNvmPending !== false) {
          markOdriveRamPending(dispatch, field);
        }
        ok += 1;
        applied = true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!applied) {
      fail += 1;
      errors.push(`${spec.path}: ${lastError}`);
    }
  }
  return { ok, fail, errors };
}

export function markDirtyPaths(
  specs: { path: string; value: string | boolean }[],
  dispatch: Dispatch<AppAction>,
): void {
  for (const spec of specs) {
    const normalized = typeof spec.value === 'boolean' ? (spec.value ? 'true' : 'false') : spec.value;
    dispatch({ type: 'set-field', path: spec.path, value: normalized, dirty: true });
  }
}

export function applyAs5047Preset(dispatch: React.Dispatch<AppAction>): void {
  const specs = as5047EncoderTargets.map((entry) => {
    if (entry.match.kind === 'bool') {
      return { path: entry.path, value: entry.match.value };
    }
    if (entry.match.kind === 'exact') {
      return { path: entry.path, value: entry.match.value };
    }
    return { path: entry.path, value: '' };
  });
  markDirtyPaths(
    [
      ...specs,
      { path: 'axis0.encoder.config.pre_calibrated', value: false },
    ],
    dispatch,
  );
  dispatch({ type: 'set-field', path: 'axis0.encoder.is_ready', value: 'false', dirty: false });
  dispatch({ type: 'set-field', path: 'axis0.encoder.config.pre_calibrated', value: 'false', dirty: true });
  dispatch({ type: 'set-nvm-pending', pending: true });
}

export function applyMt6835Preset(dispatch: React.Dispatch<AppAction>): void {
  const specs = mt6835EncoderTargets.map((entry) => {
    if (entry.match.kind === 'bool') {
      return { path: entry.path, value: entry.match.value };
    }
    if (entry.match.kind === 'exact') {
      return { path: entry.path, value: entry.match.value };
    }
    return { path: entry.path, value: '' };
  });
  markDirtyPaths(
    [
      ...specs,
      { path: 'axis0.encoder.config.pre_calibrated', value: false },
    ],
    dispatch,
  );
  dispatch({ type: 'set-field', path: 'axis0.encoder.is_ready', value: 'false', dirty: false });
  dispatch({ type: 'set-field', path: 'axis0.encoder.config.pre_calibrated', value: 'false', dirty: true });
  dispatch({ type: 'set-nvm-pending', pending: true });
}

export async function applyPersistReadyBoot(
  dispatch: React.Dispatch<AppAction>,
  fieldValues?: Record<string, string>,
): Promise<{ ok: number; fail: number; skipped?: string[] }> {
  return applyBootPreset('persistReady', dispatch, fieldValues);
}

/** @deprecated Use applyPersistReadyBoot — old name kept for Quick Start imports. */
export async function markPrecalibrated(
  dispatch: React.Dispatch<AppAction>,
  fieldValues?: Record<string, string>,
): Promise<{ ok: number; fail: number; skipped?: string[] }> {
  return applyPersistReadyBoot(dispatch, fieldValues);
}

async function tryReconnect(maxAttempts = 12, delayMs = 1000): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (await serialService.reconnectKnownPort()) {
        return true;
      }
    } catch {
      // retry while board reboots
    }
    await sleep(delayMs);
  }
  return false;
}

export async function eraseAndReconnect(
  onProgress?: (phase: 'erasing' | 'rebooting' | 'reconnecting' | 'reading') => void,
): Promise<{ reconnected: boolean; values?: Record<string, string> }> {
  await serialService.runAtomic(async () => {
    onProgress?.('erasing');
    await serialService.commandNow('se', true, 8000);
    onProgress?.('rebooting');
    await serialService.disconnect().catch(() => undefined);
  });

  await sleep(5000);
  onProgress?.('reconnecting');
  const reconnected = await tryReconnect();
  if (!reconnected) {
    return { reconnected: false };
  }

  await sleep(500);
  onProgress?.('reading');
  const values = await readAllFields();
  return { reconnected: true, values };
}

/** Capture FFB logical center (axis.zeroenc!) and optionally persist to FFB EEPROM (sys.save!). */
export async function zeroWheel(
  dispatch: React.Dispatch<AppAction>,
  options?: { persistEeprom?: boolean },
): Promise<boolean> {
  const reply = await serialService.sendCommand('axis.zeroenc!', true, 3000);
  dispatch({ type: 'append-log', direction: 'info', message: `axis.zeroenc! → ${reply}` });
  if (options?.persistEeprom === false) {
    return true;
  }
  const ok = await persistFfbEeprom();
  dispatch({
    type: 'append-log',
    direction: ok ? 'info' : 'error',
    message: ok ? 'sys.save! (zeroOffset EEPROM)' : 'sys.save! failed — zeroOffset RAM only',
  });
  return ok;
}

export async function readAnticogProgress(): Promise<{ index: number; valid: boolean; axisErr: number }> {
  const [indexRaw, validRaw, axisErrRaw] = await Promise.all([
    readField(fieldByPath('axis0.controller.config.anticogging.index')!),
    serialService.sendCommand('r axis0.controller.anticogging_valid', true, 2500, false),
    serialService.sendCommand('r axis0.error', true, 2500, false),
  ]);
  const index = Number(indexRaw.trim().split(/\s+/)[0]);
  const valid = validRaw.trim().toLowerCase() === 'true' || validRaw.trim() === '1';
  const axisErr = Number(axisErrRaw.trim().split(/\s+/)[0]);
  return {
    index: Number.isFinite(index) ? index : 0,
    valid,
    axisErr: Number.isFinite(axisErr) ? axisErr : 0,
  };
}
