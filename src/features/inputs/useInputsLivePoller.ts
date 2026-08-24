import { useEffect, useRef, useState } from 'react';
import { readField } from '../board/BoardProtocol';
import type { GpioChannel } from './gpioChannel';

/**
 * Polls live `cur` and `filt` for every channel as fast as the serial port allows
 * (~60 Hz target). Values are kept in local state to avoid flooding the global store.
 */
export function useInputsLivePoller(
  channels: GpioChannel[],
  connected: boolean,
  paused = false,
  thermistorEnabled = false,
): { liveValues: Record<string, string>; motorTempC: number | null; polling: boolean } {
  const [liveValues, setLiveValues] = useState<Record<string, string>>({});
  const [motorTempC, setMotorTempC] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const generationRef = useRef(0);
  const rafRef = useRef<number>(0);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const loopCountRef = useRef(0);

  useEffect(() => {
    if (!connected || paused) {
      generationRef.current += 1;
      setPolling(false);
      cancelAnimationFrame(rafRef.current);
      return undefined;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setPolling(true);

    const runLoop = async () => {
      if (generation !== generationRef.current) {
        return;
      }

      const updates: Record<string, string> = {};
      const liveFields = channelsRef.current.flatMap((ch) =>
        [ch.fields.cur, ch.fields.filt].filter((field): field is NonNullable<typeof field> => Boolean(field)),
      );
      for (const field of liveFields) {
        if (generation !== generationRef.current) {
          break;
        }
        try {
          const value = await readField(field);
          updates[field.path] = value;
        } catch {
          // skip timeout/disconnect; loop stops when generation changes
        }
      }

      // Poll motor temperature every ~10 frames when thermistor is active
      loopCountRef.current += 1;
      if (thermistorEnabled && loopCountRef.current % 10 === 0) {
        try {
          const raw = await readField({
            path: 'axis0.motor.motor_thermistor.temperature',
            label: 'Motor temperature',
            type: 'readonly',
            protocol: 'odrive',
            readonly: true,
            description: '',
          });
          const parsed = parseFloat(raw.trim());
          if (Number.isFinite(parsed)) {
            setMotorTempC(parsed);
          }
        } catch {
          // ignore transient errors
        }
      }

      if (generation === generationRef.current && Object.keys(updates).length > 0) {
        setLiveValues((prev) => ({ ...prev, ...updates }));
      }

      if (generation === generationRef.current) {
        rafRef.current = requestAnimationFrame(() => void runLoop());
      }
    };

    rafRef.current = requestAnimationFrame(() => void runLoop());

    return () => {
      generationRef.current += 1;
      setPolling(false);
      cancelAnimationFrame(rafRef.current);
    };
  }, [connected, paused, thermistorEnabled]);

  return { liveValues, motorTempC, polling };
}
