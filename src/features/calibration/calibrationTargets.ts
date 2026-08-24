import { persistReadyBoot } from './calibrationBootPresets';

export type TargetMatch =
  | { kind: 'exact'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'present' }
  | { kind: 'status'; expect: 'true' };

export type CalibrationTargetGroup = 'status' | 'encoder' | 'motor' | 'boot';

export interface CalibrationTargetEntry {
  path: string;
  labelKey: string;
  group: CalibrationTargetGroup;
  match: TargetMatch;
}

export const as5047EncoderTargets: CalibrationTargetEntry[] = [
  { path: 'axis0.encoder.config.mode', labelKey: 'calTargetEncMode', group: 'encoder', match: { kind: 'exact', value: '257' } },
  { path: 'axis0.encoder.config.cpr', labelKey: 'calTargetEncCpr', group: 'encoder', match: { kind: 'exact', value: '16384' } },
  {
    path: 'axis0.encoder.config.abs_spi_cs_gpio_pin',
    labelKey: 'calTargetEncCsPin',
    group: 'encoder',
    match: { kind: 'exact', value: '7' },
  },
  { path: 'axis0.encoder.config.use_index', labelKey: 'calTargetEncUseIndex', group: 'encoder', match: { kind: 'bool', value: false } },
];

export const mt6835EncoderTargets: CalibrationTargetEntry[] = [
  { path: 'axis0.encoder.config.mode', labelKey: 'calTargetEncMode', group: 'encoder', match: { kind: 'exact', value: '261' } },
  { path: 'axis0.encoder.config.cpr', labelKey: 'calTargetEncCpr', group: 'encoder', match: { kind: 'exact', value: '2097152' } },
  {
    path: 'axis0.encoder.config.abs_spi_cs_gpio_pin',
    labelKey: 'calTargetEncCsPin',
    group: 'encoder',
    match: { kind: 'exact', value: '7' },
  },
  { path: 'axis0.encoder.config.use_index', labelKey: 'calTargetEncUseIndex', group: 'encoder', match: { kind: 'bool', value: false } },
];

export const incrementalEncoderTargets: CalibrationTargetEntry[] = [
  { path: 'axis0.encoder.config.mode', labelKey: 'calTargetEncMode', group: 'encoder', match: { kind: 'exact', value: '0' } },
  { path: 'axis0.encoder.config.cpr', labelKey: 'calTargetEncCpr', group: 'encoder', match: { kind: 'exact', value: '8192' } },
  { path: 'axis0.encoder.config.use_index', labelKey: 'calTargetEncUseIndex', group: 'encoder', match: { kind: 'bool', value: false } },
];

export const savedCalMeasurementTargets: CalibrationTargetEntry[] = [
  {
    path: 'axis0.motor.config.phase_resistance',
    labelKey: 'calTargetPhaseResistance',
    group: 'motor',
    match: { kind: 'present' },
  },
  {
    path: 'axis0.motor.config.phase_inductance',
    labelKey: 'calTargetPhaseInductance',
    group: 'motor',
    match: { kind: 'present' },
  },
  { path: 'axis0.encoder.config.phase_offset', labelKey: 'calTargetPhaseOffset', group: 'encoder', match: { kind: 'present' } },
  {
    path: 'axis0.encoder.config.phase_offset_float',
    labelKey: 'calTargetPhaseOffsetFloat',
    group: 'encoder',
    match: { kind: 'present' },
  },
];

export const savedStatusTargets: CalibrationTargetEntry[] = [
  { path: 'axis0.motor.is_calibrated', labelKey: 'calStatusMotorCal', group: 'status', match: { kind: 'status', expect: 'true' } },
  { path: 'axis0.encoder.is_ready', labelKey: 'calStatusEncoderReady', group: 'status', match: { kind: 'status', expect: 'true' } },
  {
    path: 'axis0.motor.config.pre_calibrated',
    labelKey: 'calBootMotorPreCal',
    group: 'status',
    match: { kind: 'bool', value: true },
  },
  {
    path: 'axis0.encoder.config.pre_calibrated',
    labelKey: 'calBootEncoderPreCal',
    group: 'status',
    match: { kind: 'bool', value: true },
  },
];

export const savedBootTargets: CalibrationTargetEntry[] = persistReadyBoot.map((entry) => ({
  path: entry.path,
  labelKey: entry.labelKey,
  group: 'boot' as const,
  match:
    typeof entry.value === 'boolean'
      ? { kind: 'bool' as const, value: entry.value }
      : { kind: 'exact' as const, value: String(entry.value) },
}));

export type EncoderProfile = 'as5047' | 'mt6835' | 'incremental' | 'unknown';

export function detectEncoderProfile(modeRaw: string | undefined): EncoderProfile {
  const mode = modeRaw?.trim().split(/\s+/)[0];
  if (mode === '257') return 'as5047';
  if (mode === '261') return 'mt6835';
  if (mode === '0') return 'incremental';
  return 'unknown';
}

export function encoderTargetsForProfile(profile: EncoderProfile): CalibrationTargetEntry[] {
  if (profile === 'as5047') return as5047EncoderTargets;
  if (profile === 'mt6835') return mt6835EncoderTargets;
  if (profile === 'incremental') return incrementalEncoderTargets;
  return [];
}

export function savedCalibrationTargetList(profile: EncoderProfile): CalibrationTargetEntry[] {
  return [
    ...savedStatusTargets,
    ...encoderTargetsForProfile(profile),
    ...savedCalMeasurementTargets,
    ...savedBootTargets,
  ];
}

function normalizeBool(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const token = raw.trim().toLowerCase().split(/\s+/)[0];
  if (token === '1' || token === 'true') return 'true';
  if (token === '0' || token === 'false') return 'false';
  return token;
}

export type TargetCompareResult = 'ok' | 'warn' | 'missing';

export function compareTarget(current: string | undefined, match: TargetMatch): TargetCompareResult {
  if (current === undefined || current.trim() === '' || current === '—') {
    return 'missing';
  }
  switch (match.kind) {
    case 'exact':
      return current.trim().split(/\s+/)[0] === match.value ? 'ok' : 'warn';
    case 'bool': {
      const normalized = normalizeBool(current);
      const expected = match.value ? 'true' : 'false';
      return normalized === expected ? 'ok' : 'warn';
    }
    case 'present': {
      const num = Number(current.trim().split(/\s+/)[0]);
      if (Number.isFinite(num)) {
        return num !== 0 ? 'ok' : 'warn';
      }
      return current.trim().length > 0 ? 'ok' : 'missing';
    }
    case 'status': {
      const normalized = normalizeBool(current);
      return normalized === match.expect ? 'ok' : 'warn';
    }
    default:
      return 'warn';
  }
}

import type { Locale } from '../../i18n/messages';

export function formatTargetValue(match: TargetMatch, locale: Locale): string {
  switch (match.kind) {
    case 'exact':
      return match.value;
    case 'bool':
      return match.value ? 'true' : 'false';
    case 'present':
      return locale === 'pt' ? 'medido (NVM)' : locale === 'es' ? 'medido (NVM)' : 'measured (NVM)';
    case 'status':
      return match.expect;
    default:
      return '—';
  }
}

export function formatCurrentValue(path: string, current: string | undefined, match: TargetMatch): string {
  if (current === undefined || current.trim() === '') {
    return '—';
  }
  if (match.kind === 'present') {
    const num = Number(current.trim().split(/\s+/)[0]);
    if (Number.isFinite(num) && path.includes('phase_resistance')) {
      return `${num.toFixed(4)} Ω`;
    }
    if (Number.isFinite(num) && path.includes('phase_inductance')) {
      return `${(num * 1e6).toFixed(2)} µH`;
    }
    if (Number.isFinite(num) && path.includes('phase_offset_float')) {
      return num.toFixed(6);
    }
    if (Number.isFinite(num)) {
      return String(num);
    }
  }
  if (match.kind === 'bool' || match.kind === 'status') {
    const normalized = normalizeBool(current);
    return normalized ?? current.trim().split(/\s+/)[0];
  }
  return current.trim().split(/\s+/)[0];
}
