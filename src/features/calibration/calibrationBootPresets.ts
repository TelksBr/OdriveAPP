import type { Dispatch } from 'react';
import type { AppAction } from '../../app/types';
import { writePaths, writePathsNow } from './calibrationPresets';
import { assessCalibrationIntegrity } from './calibrationIntegrity';

export interface BootPersistEntry {
  path: string;
  labelKey: string;
  value: string | boolean;
}

export type BootPresetId = 'persistReady' | 'autoCalEveryBoot';

export interface BootFlagDef {
  path: string;
  labelKey: string;
  group: 'precal' | 'startup' | 'limits' | 'index';
  persistReady: boolean;
  autoCalEveryBoot: boolean;
}

/** All boot-related flags — user-controllable, not hardcoded per cal action. */
export const BOOT_FLAG_DEFS: BootFlagDef[] = [
  {
    path: 'axis0.motor.config.pre_calibrated',
    labelKey: 'calBootMotorPreCal',
    group: 'precal',
    persistReady: true,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.encoder.config.pre_calibrated',
    labelKey: 'calBootEncoderPreCal',
    group: 'precal',
    persistReady: true,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.config.startup_motor_calibration',
    labelKey: 'calBootStartupMotorCal',
    group: 'startup',
    persistReady: false,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.config.startup_encoder_offset_calibration',
    labelKey: 'calBootStartupEncoderOffset',
    group: 'startup',
    persistReady: false,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.config.startup_encoder_index_search',
    labelKey: 'calBootStartupIndexSearch',
    group: 'startup',
    persistReady: false,
    autoCalEveryBoot: false,
  },
  {
    path: 'axis0.config.startup_closed_loop_control',
    labelKey: 'calBootStartupClosedLoop',
    group: 'startup',
    persistReady: true,
    autoCalEveryBoot: true,
  },
  {
    path: 'axis0.encoder.config.use_index',
    labelKey: 'calBootUseIndex',
    group: 'index',
    persistReady: false,
    autoCalEveryBoot: false,
  },
  {
    path: 'axis0.controller.config.enable_vel_limit',
    labelKey: 'calBootDisableVelLimit',
    group: 'limits',
    persistReady: false,
    autoCalEveryBoot: false,
  },
  {
    path: 'axis0.controller.config.enable_overspeed_error',
    labelKey: 'calBootDisableOverspeed',
    group: 'limits',
    persistReady: false,
    autoCalEveryBoot: false,
  },
  {
    path: 'axis0.controller.config.enable_torque_mode_vel_limit',
    labelKey: 'calBootDisableTorqueVelLimit',
    group: 'limits',
    persistReady: false,
    autoCalEveryBoot: false,
  },
];

export function bootPresetEntries(
  preset: BootPresetId,
  fieldValues?: Record<string, string>,
): BootPersistEntry[] {
  const incrementalNoZ = fieldValues ? isIncrementalEncoderWithoutIndex(fieldValues) : false;
  return BOOT_FLAG_DEFS.map((def) => {
    let value = preset === 'persistReady' ? def.persistReady : def.autoCalEveryBoot;
    if (preset === 'persistReady' && incrementalNoZ) {
      if (def.path === 'axis0.config.startup_encoder_offset_calibration') {
        value = true;
      }
      if (def.path === 'axis0.encoder.config.pre_calibrated') {
        value = false;
      }
    }
    return {
      path: def.path,
      labelKey: def.labelKey,
      value,
    };
  });
}

export type EncoderArchitecture = 'incremental_no_z' | 'incremental_abz' | 'spi_absolute';

/** FFB needs torque passthrough after erase — catalog default is 1, NVM may not be. */
export const FFB_CONTROLLER_MODE_WRITES: { path: string; value: string }[] = [
  { path: 'axis0.controller.config.control_mode', value: '1' },
  { path: 'axis0.controller.config.input_mode', value: '1' },
];

const POST_CAL_LIMITS: BootPersistEntry[] = [
  { path: 'axis0.controller.config.enable_vel_limit', labelKey: 'calBootDisableVelLimit', value: false },
  { path: 'axis0.controller.config.enable_overspeed_error', labelKey: 'calBootDisableOverspeed', value: false },
  { path: 'axis0.controller.config.enable_torque_mode_vel_limit', labelKey: 'calBootDisableTorqueVelLimit', value: false },
];

/** Opção A: Incremental sem pino Z — calibração de offset a cada boot */
export const postCalibrationPresetIncrementalNoZ: BootPersistEntry[] = [
  { path: 'axis0.motor.config.pre_calibrated', labelKey: 'calBootMotorPreCal', value: true },
  { path: 'axis0.encoder.config.pre_calibrated', labelKey: 'calBootEncoderPreCal', value: false },
  { path: 'axis0.encoder.config.use_index', labelKey: 'calBootUseIndex', value: false },
  { path: 'axis0.config.startup_motor_calibration', labelKey: 'calBootStartupMotorCal', value: false },
  { path: 'axis0.config.startup_encoder_offset_calibration', labelKey: 'calBootStartupEncoderOffset', value: true },
  { path: 'axis0.config.startup_encoder_index_search', labelKey: 'calBootStartupIndexSearch', value: false },
  { path: 'axis0.config.startup_closed_loop_control', labelKey: 'calBootStartupClosedLoop', value: true },
  ...POST_CAL_LIMITS,
];

/** Opção B: Incremental com pino Z (ABZ) — busca de índice Z no boot */
export const postCalibrationPresetIncrementalAbz: BootPersistEntry[] = [
  { path: 'axis0.motor.config.pre_calibrated', labelKey: 'calBootMotorPreCal', value: true },
  { path: 'axis0.encoder.config.pre_calibrated', labelKey: 'calBootEncoderPreCal', value: true },
  { path: 'axis0.encoder.config.use_index', labelKey: 'calBootUseIndex', value: true },
  { path: 'axis0.config.startup_motor_calibration', labelKey: 'calBootStartupMotorCal', value: false },
  { path: 'axis0.config.startup_encoder_offset_calibration', labelKey: 'calBootStartupEncoderOffset', value: false },
  { path: 'axis0.config.startup_encoder_index_search', labelKey: 'calBootStartupIndexSearch', value: true },
  { path: 'axis0.config.startup_closed_loop_control', labelKey: 'calBootStartupClosedLoop', value: true },
  ...POST_CAL_LIMITS,
];

/** Opção C: Encoder Absoluto SPI (MT6835 / AS5047P / TLE5012B) — calibração única, boot instantâneo */
export const postCalibrationPresetSpiAbsolute: BootPersistEntry[] = [
  { path: 'axis0.motor.config.pre_calibrated', labelKey: 'calBootMotorPreCal', value: true },
  { path: 'axis0.encoder.config.pre_calibrated', labelKey: 'calBootEncoderPreCal', value: true },
  { path: 'axis0.encoder.config.use_index', labelKey: 'calBootUseIndex', value: false },
  { path: 'axis0.config.startup_motor_calibration', labelKey: 'calBootStartupMotorCal', value: false },
  { path: 'axis0.config.startup_encoder_offset_calibration', labelKey: 'calBootStartupEncoderOffset', value: false },
  { path: 'axis0.config.startup_encoder_index_search', labelKey: 'calBootStartupIndexSearch', value: false },
  { path: 'axis0.config.startup_closed_loop_control', labelKey: 'calBootStartupClosedLoop', value: true },
  ...POST_CAL_LIMITS,
];

/** Backwards compatibility alias */
export const postCalibrationPreset: BootPersistEntry[] = postCalibrationPresetSpiAbsolute;
export const postCalibrationPresetIncrementalNoIndex: BootPersistEntry[] = postCalibrationPresetIncrementalNoZ;

export function detectEncoderArchitecture(fieldValues: Record<string, string>): EncoderArchitecture {
  const mode = (fieldValues['axis0.encoder.config.mode'] ?? '').trim().split(/\s+/)[0];
  const useIndex = parseBoolField(fieldValues['axis0.encoder.config.use_index']);
  const startupEncCal = parseBoolField(fieldValues['axis0.config.startup_encoder_offset_calibration']);
  const startupIndex = parseBoolField(fieldValues['axis0.config.startup_encoder_index_search']);

  if (mode === '0') {
    if (useIndex || startupIndex) {
      return 'incremental_abz';
    }
    return 'incremental_no_z';
  }
  if (['257', '258', '259', '260', '261'].includes(mode)) {
    return 'spi_absolute';
  }
  // If startup offset cal is enabled, consider incremental_no_z
  if (startupEncCal) {
    return 'incremental_no_z';
  }
  if (startupIndex) {
    return 'incremental_abz';
  }
  return 'spi_absolute';
}

export function isIncrementalEncoderWithoutIndex(fieldValues: Record<string, string>): boolean {
  return detectEncoderArchitecture(fieldValues) === 'incremental_no_z';
}

export function getBootPresetForArchitecture(arch: EncoderArchitecture): BootPersistEntry[] {
  switch (arch) {
    case 'incremental_no_z':
      return postCalibrationPresetIncrementalNoZ;
    case 'incremental_abz':
      return postCalibrationPresetIncrementalAbz;
    case 'spi_absolute':
    default:
      return postCalibrationPresetSpiAbsolute;
  }
}

export function getPostCalibrationPreset(fieldValues: Record<string, string>): BootPersistEntry[] {
  const arch = detectEncoderArchitecture(fieldValues);
  return getBootPresetForArchitecture(arch);
}

/** @deprecated use paths from post-cal presets only for finalize — not for toolbar save guards */
export function allPostCalibrationBootPaths(): string[] {
  const paths = new Set<string>();
  for (const entry of [
    ...postCalibrationPresetIncrementalNoZ,
    ...postCalibrationPresetIncrementalAbz,
    ...postCalibrationPresetSpiAbsolute,
  ]) {
    paths.add(entry.path);
  }
  return [...paths];
}

/** Recommended after successful cal + Save (closed-loop on boot; skipped if encoder is not ready). */
export const persistReadyBoot: BootPersistEntry[] = bootPresetEntries('persistReady');

/** Advanced: re-run calibrations on every boot (legacy HTML step 9). */
export const autoCalEveryBoot: BootPersistEntry[] = bootPresetEntries('autoCalEveryBoot');

/** @deprecated use persistReadyBoot */
export const fullBootPersist: BootPersistEntry[] = persistReadyBoot;

export const motorMarkPreCalibrated: BootPersistEntry[] = [
  { path: 'axis0.motor.config.pre_calibrated', labelKey: 'calBootMotorPreCal', value: true },
];

export const encoderMarkPreCalibrated: BootPersistEntry[] = [
  { path: 'axis0.encoder.config.pre_calibrated', labelKey: 'calBootEncoderPreCal', value: true },
];

export const anticogBootPersist: BootPersistEntry[] = [
  { path: 'axis0.controller.config.anticogging.pre_calibrated', labelKey: 'calBootAnticogPreCal', value: true },
  { path: 'axis0.controller.config.anticogging.anticogging_enabled', labelKey: 'calBootAnticogEnabled', value: true },
];

export async function applyBootPersist(
  entries: BootPersistEntry[],
  dispatch: Dispatch<AppAction>,
): Promise<{ ok: number; fail: number; errors: string[] }> {
  return writePaths(
    entries.map((entry) => ({ path: entry.path, value: entry.value })),
    dispatch,
  );
}

/** Inside serialService.runAtomic() — e.g. calibration finalize. */
export async function applyBootPersistNow(
  entries: BootPersistEntry[],
  dispatch: Dispatch<AppAction>,
): Promise<{ ok: number; fail: number; errors: string[] }> {
  return writePathsNow(
    entries.map((entry) => ({ path: entry.path, value: entry.value })),
    dispatch,
    { retries: 1 },
  );
}

export async function applyBootPreset(
  preset: BootPresetId,
  dispatch: Dispatch<AppAction>,
  fieldValues?: Record<string, string>,
): Promise<{ ok: number; fail: number; skipped?: string[] }> {
  let entries = bootPresetEntries(preset, fieldValues);

  if (preset === 'persistReady' && fieldValues) {
    const integrity = assessCalibrationIntegrity(fieldValues);
    const skipped: string[] = [];
    entries = entries.map((entry) => {
      if (entry.path === 'axis0.encoder.config.pre_calibrated' && !integrity.encoderReady) {
        skipped.push('encoderPreCal');
        return { ...entry, value: false };
      }
      if (entry.path === 'axis0.motor.config.pre_calibrated' && !integrity.motorCalibrated) {
        skipped.push('motorPreCal');
        return { ...entry, value: false };
      }
      if (entry.path === 'axis0.config.startup_closed_loop_control' && !integrity.encoderReady) {
        skipped.push('closedLoop');
        return { ...entry, value: false };
      }
      return entry;
    });
    if (skipped.length > 0) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: `Boot preset guarded: skipped ${skipped.join(', ')} — calibrate first`,
      });
    }
    const result = await applyBootPersist(entries, dispatch);
    return { ...result, skipped };
  }

  return applyBootPersist(entries, dispatch);
}

export function parseBoolField(raw: string | undefined): boolean {
  const token = (raw ?? '').trim().toLowerCase().split(/\s+/)[0];
  return token === 'true' || token === '1';
}

export function isPresetSynced(preset: BootPersistEntry[], fieldValues: Record<string, string>): boolean {
  return preset.every((entry) => {
    const raw = fieldValues[entry.path];
    if (typeof entry.value === 'boolean') {
      return parseBoolField(raw) === entry.value;
    }
    return (raw ?? '').trim() === String(entry.value);
  });
}
