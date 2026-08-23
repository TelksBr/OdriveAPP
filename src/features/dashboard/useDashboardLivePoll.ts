import { useCallback, useEffect, useRef, useState } from 'react';
import { readField } from '../board/BoardProtocol';
import { getFieldByPath } from '../config/fieldCatalog';
import { parseReplyNumber } from '../inputs/analogAxisMath';
import {
  emptyGpioConfigCache,
  emptyGpioRaw,
  mergeFieldConfig,
  readInputConfigCache,
  type GpioConfigCache,
  type GpioInputMode,
} from '../inputs/inputConfigCache';
import { GPIO_CHANNELS } from '../../domain/gpioPinout';
import { parseTorqueReply } from '../inputs/parseTorque';
import { serialService } from '../serial/SerialService';
import { publishWheelPosition } from '../wheel/sharedWheelPosition';
import {
  buildGpioQueue,
  emptyDashboardMetrics,
  METRIC_ROTATION,
  parsePosition,
  pollDashboardMetric,
  type DashboardMetricsRaw,
} from './dashboardPollCore';

const CONFIG_POLL_MS = 2000;
const GPIO_LIST = GPIO_CHANNELS;

/** One serial command per tick — position-heavy, analog GPIO prioritized. */
const SLOT_ORDER = ['pos', 'gpio', 'pos', 'torque', 'pos', 'gpio', 'metric'] as const;
type Slot = (typeof SLOT_ORDER)[number];

export interface GpioInputState {
  gpio: number;
  mode: GpioInputMode;
  idx: number | null;
  raw: number | null;
  min: number;
  max: number;
}

export interface DashboardLivePollState {
  positionDegRef: React.MutableRefObject<number | null>;
  torqueNm: number | null;
  maxTorqueNm: number | null;
  gpioInputs: GpioInputState[];
  metrics: DashboardMetricsRaw;
  polling: boolean;
}

function fieldFor(path: string) {
  const field = getFieldByPath(path);
  if (!field) {
    throw new Error(`Missing field: ${path}`);
  }
  return field;
}

function gpioInputsFromConfig(
  config: GpioConfigCache,
  raw: Record<number, number | null>,
): GpioInputState[] {
  return GPIO_LIST.flatMap((gpio) => {
    const entry = config.gpios[gpio];
    if (!entry || entry.mode === '0') {
      return [];
    }
    return [
      {
        gpio,
        mode: entry.mode,
        idx: entry.idx,
        raw: raw[gpio] ?? null,
        min: entry.min,
        max: entry.max,
      },
    ];
  });
}

/**
 * Single serial scheduler for all dashboard live data (position, torque, GPIO, metrics).
 */
export function useDashboardLivePoll(
  connected: boolean,
  fieldValues: Record<string, string>,
  paused = false,
): DashboardLivePollState {
  const [torqueNm, setTorqueNm] = useState<number | null>(null);
  const [gpioInputs, setGpioInputs] = useState<GpioInputState[]>([]);
  const [maxTorqueNm, setMaxTorqueNm] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetricsRaw>(emptyDashboardMetrics());
  const [polling, setPolling] = useState(false);

  const positionDegRef = useRef<number | null>(null);
  const configRef = useRef<GpioConfigCache | null>(null);
  const gpioRawRef = useRef<Record<number, number | null>>(emptyGpioRaw());
  const generationRef = useRef(0);
  const rafRef = useRef(0);
  const slotRef = useRef(0);
  const gpioQueueRef = useRef<number[]>([]);
  const gpioQueueIndexRef = useRef(0);
  const metricIndexRef = useRef(0);
  const fieldValuesRef = useRef(fieldValues);
  fieldValuesRef.current = fieldValues;

  const refreshConfig = useCallback(async (generation: number) => {
    if (generation !== generationRef.current) {
      return;
    }
    try {
      const values = fieldValuesRef.current;
      const base = configRef.current ?? mergeFieldConfig(emptyGpioConfigCache(), values);
      const config = mergeFieldConfig(await readInputConfigCache(base), values);
      if (generation !== generationRef.current) {
        return;
      }
      configRef.current = config;
      gpioQueueRef.current = buildGpioQueue(config.gpios, GPIO_LIST);
      gpioQueueIndexRef.current = 0;
      setMaxTorqueNm(config.maxTorqueNm);
      setGpioInputs(gpioInputsFromConfig(config, gpioRawRef.current));
    } catch {
      // keep previous GPIO snapshot — do not wipe the dashboard
    }
  }, []);

  const runSlot = useCallback(async (slot: Slot, generation: number) => {
    if (generation !== generationRef.current) {
      return;
    }
    if (slot === 'pos') {
      try {
        const raw = await serialService.sendCommand('axis.curpos?', true, 500, false);
        const value = parsePosition(raw);
        if (value !== null && generation === generationRef.current) {
          positionDegRef.current = value;
          publishWheelPosition(value);
        }
      } catch {
        // keep previous sample
      }
      return;
    }

    if (slot === 'torque') {
      try {
        const raw = await serialService.sendCommand('T', true, 500, false);
        const scale = configRef.current?.maxTorqueNm ?? undefined;
        const value = parseTorqueReply(raw, scale);
        if (value !== null && generation === generationRef.current) {
          setTorqueNm(value);
        }
      } catch {
        // keep previous sample
      }
      return;
    }

    if (slot === 'metric') {
      const key = METRIC_ROTATION[metricIndexRef.current % METRIC_ROTATION.length];
      metricIndexRef.current += 1;
      try {
        const patch = await pollDashboardMetric(key);
        if (generation === generationRef.current) {
          setMetrics((prev) => ({ ...prev, ...patch }));
        }
      } catch {
        // keep previous metrics
      }
      return;
    }

    const config = configRef.current;
    if (!config) {
      return;
    }

    const analogGpios = GPIO_LIST.filter((g) => config.gpios[g]?.mode === '2');
    if (analogGpios.length > 0) {
      for (const gpio of analogGpios) {
        if (generation !== generationRef.current) {
          break;
        }
        try {
          const rawStr = await readField(fieldFor(`gpio.${gpio}.cur`));
          gpioRawRef.current[gpio] = parseReplyNumber(rawStr);
        } catch {
          // keep previous raw sample
        }
      }
      if (generation === generationRef.current) {
        setGpioInputs(gpioInputsFromConfig(config, gpioRawRef.current));
      }
    } else {
      const queue = gpioQueueRef.current;
      if (queue.length > 0) {
        const gpio = queue[gpioQueueIndexRef.current % queue.length];
        gpioQueueIndexRef.current += 1;
        try {
          const rawStr = await readField(fieldFor(`gpio.${gpio}.cur`));
          if (generation !== generationRef.current) {
            return;
          }
          gpioRawRef.current[gpio] = parseReplyNumber(rawStr);
          setGpioInputs(gpioInputsFromConfig(config, gpioRawRef.current));
        } catch {
          // keep previous raw sample
        }
      }
    }
  }, []);

  useEffect(() => {
    if (configRef.current) {
      const merged = mergeFieldConfig(configRef.current, fieldValues);
      configRef.current = merged;
      gpioQueueRef.current = buildGpioQueue(merged.gpios, GPIO_LIST);
      setMaxTorqueNm(merged.maxTorqueNm);
      setGpioInputs(gpioInputsFromConfig(merged, gpioRawRef.current));
    }
  }, [fieldValues]);

  useEffect(() => {
    if (!connected || paused) {
      generationRef.current += 1;
      setPolling(false);
      setTorqueNm(null);
      setGpioInputs([]);
      setMaxTorqueNm(null);
      setMetrics(emptyDashboardMetrics());
      positionDegRef.current = null;
      configRef.current = null;
      gpioRawRef.current = emptyGpioRaw();
      slotRef.current = 0;
      gpioQueueRef.current = [];
      gpioQueueIndexRef.current = 0;
      metricIndexRef.current = 0;
      return undefined;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setPolling(true);
    void refreshConfig(generation);

    const runLoop = async () => {
      if (generation !== generationRef.current) {
        return;
      }
      const slot = SLOT_ORDER[slotRef.current % SLOT_ORDER.length];
      slotRef.current += 1;
      await runSlot(slot, generation);
      if (generation === generationRef.current) {
        rafRef.current = requestAnimationFrame(() => void runLoop());
      }
    };

    rafRef.current = requestAnimationFrame(() => void runLoop());
    const configId = window.setInterval(() => void refreshConfig(generation), CONFIG_POLL_MS);

    return () => {
      generationRef.current += 1;
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(configId);
      setPolling(false);
    };
  }, [connected, paused, refreshConfig, runSlot]);

  return {
    positionDegRef,
    torqueNm,
    maxTorqueNm,
    gpioInputs,
    metrics,
    polling,
  };
}
