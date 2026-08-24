import { decodeErr, ERR_BITS_AXIS, ERR_BITS_ODRIVE, type DecodedError } from '../live/errorDecoder';
import { serialService } from '../serial/SerialService';

export type DashboardMetricKey = 'vbus' | 'axisState' | 'iq' | 'fetTemp' | 'motorTemp' | 'errOdrv' | 'errAxis';

export const METRIC_ROTATION: DashboardMetricKey[] = ['vbus', 'axisState', 'iq', 'fetTemp', 'motorTemp', 'errOdrv', 'errAxis'];

export const VBUS_WARN_V = 20;

export interface DashboardMetricsRaw {
  vbusV: number | null;
  axisState: string | null;
  iqA: number | null;
  fetTempC: number | null;
  motorTempC: number | null;
  odrvError: DecodedError | null;
  axisError: DecodedError | null;
}

export function emptyDashboardMetrics(): DashboardMetricsRaw {
  return {
    vbusV: null,
    axisState: null,
    iqA: null,
    fetTempC: null,
    motorTempC: null,
    odrvError: null,
    axisError: null,
  };
}

export function parsePosition(raw: string): number | null {
  const match = raw.match(/\|(-?\d+(?:\.\d+)?)\]/) ?? raw.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const value = parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

export async function pollDashboardMetric(key: DashboardMetricKey): Promise<Partial<DashboardMetricsRaw>> {
  switch (key) {
    case 'vbus': {
      const raw = await serialService.sendCommand('r vbus_voltage', true, 1000, false);
      const value = parseFloat(raw.trim());
      return { vbusV: Number.isFinite(value) ? value : null };
    }
    case 'axisState': {
      const raw = await serialService.sendCommand('r axis0.current_state', true, 1000, false);
      return { axisState: raw.trim() || null };
    }
    case 'iq': {
      const raw = await serialService.sendCommand('r axis0.motor.current_control.Iq_measured', true, 1000, false);
      const value = parseFloat(raw.trim());
      return { iqA: Number.isFinite(value) ? value : null };
    }
    case 'fetTemp': {
      try {
        const raw = await serialService.sendCommand('sys.temp?', true, 1000, false);
        const match = raw.match(/\|(-?\d+(?:\.\d+)?)\]/) ?? raw.match(/(-?\d+(?:\.\d+)?)/);
        const value = match ? parseFloat(match[1]) : parseFloat(raw.trim());
        return { fetTempC: Number.isFinite(value) ? value : null };
      } catch {
        const raw = await serialService.sendCommand('r axis0.motor.fet_thermistor.temperature', true, 1000, false);
        const value = parseFloat(raw.trim());
        return { fetTempC: Number.isFinite(value) ? value : null };
      }
    }
    case 'motorTemp': {
      try {
        const raw = await serialService.sendCommand('sys.motortemp?', true, 1000, false);
        const match = raw.match(/\|(-?\d+(?:\.\d+)?)\]/) ?? raw.match(/(-?\d+(?:\.\d+)?)/);
        const value = match ? parseFloat(match[1]) : parseFloat(raw.trim());
        return { motorTempC: Number.isFinite(value) ? value : null };
      } catch {
        const raw = await serialService.sendCommand('r axis0.motor.motor_thermistor.temperature', true, 1000, false);
        const value = parseFloat(raw.trim());
        return { motorTempC: Number.isFinite(value) ? value : null };
      }
    }
    case 'errOdrv': {
      const raw = await serialService.sendCommand('r error', true, 1000, false);
      return { odrvError: decodeErr(raw, ERR_BITS_ODRIVE) };
    }
    case 'errAxis': {
      const raw = await serialService.sendCommand('r axis0.error', true, 1000, false);
      return { axisError: decodeErr(raw, ERR_BITS_AXIS) };
    }
    default:
      return {};
  }
}

export function metricsErrorOk(metrics: DashboardMetricsRaw): boolean | null {
  if (!metrics.odrvError || !metrics.axisError) {
    return null;
  }
  return metrics.odrvError.ok && metrics.axisError.ok;
}

export function firstActiveError(metrics: DashboardMetricsRaw): string | null {
  for (const entry of [metrics.odrvError, metrics.axisError]) {
    if (entry && !entry.ok && entry.bits.length > 0) {
      return entry.bits[0];
    }
  }
  return null;
}

/** Weighted GPIO queue — analog channels appear twice per round. */
export function buildGpioQueue(
  gpios: Record<number, { mode: string }>,
  gpioList: readonly number[],
): number[] {
  const analog = gpioList.filter((gpio) => gpios[gpio]?.mode === '2');
  const other = gpioList.filter((gpio) => {
    const mode = gpios[gpio]?.mode;
    return mode === '1' || mode === '3';
  });

  const queue: number[] = [];
  for (const gpio of analog) {
    queue.push(gpio, gpio);
  }
  for (const gpio of other) {
    queue.push(gpio);
  }
  return queue;
}
