import { useEffect, useRef, useState, type RefObject } from 'react';
import { toCenteredPercent, toLinearPercent } from './analogAxisMath';
import {
  CenteredAnalogDisplayFilter,
  FAST_ANALOG_FILTER,
  LINEAR_ANALOG_FILTER,
  LinearAnalogDisplayFilter,
  type CenteredAnalogDisplay,
  type LinearAnalogDisplay,
} from './analogDisplayFilter';

export function useLinearAnalogDisplay(
  value: number | null,
  min: number,
  max: number,
  smooth: boolean,
  fast = false,
): LinearAnalogDisplay {
  const filterRef = useRef(new LinearAnalogDisplayFilter(fast ? FAST_ANALOG_FILTER : LINEAR_ANALOG_FILTER));
  const [display, setDisplay] = useState<LinearAnalogDisplay>({
    barPercent: null,
    labelPercent: null,
    smoothedRaw: null,
  });

  useEffect(() => {
    if (!smooth) {
      if (value === null || !Number.isFinite(value)) {
        setDisplay({ barPercent: null, labelPercent: null, smoothedRaw: null });
        return;
      }
      const percent = toLinearPercent(value, min, max);
      const label = percent === null ? null : Math.round(percent);
      setDisplay({ barPercent: percent, labelPercent: label, smoothedRaw: value });
      filterRef.current.reset();
      return;
    }

    setDisplay(filterRef.current.push(value, min, max));
  }, [value, min, max, smooth]);

  return display;
}

export function useCenteredAnalogDisplay(
  value: number | null,
  maxAbs: number,
  smooth: boolean,
): CenteredAnalogDisplay & { displayRaw: number | null } {
  const filterRef = useRef(new CenteredAnalogDisplayFilter());
  const [display, setDisplay] = useState<CenteredAnalogDisplay & { displayRaw: number | null }>({
    barPercent: null,
    smoothedRaw: null,
    displayRaw: null,
  });

  useEffect(() => {
    if (!smooth) {
      if (value === null || !Number.isFinite(value)) {
        setDisplay({ barPercent: null, smoothedRaw: null, displayRaw: null });
        return;
      }
      const percent = toCenteredPercent(value, maxAbs);
      setDisplay({ barPercent: percent, smoothedRaw: value, displayRaw: value });
      filterRef.current.reset();
      return;
    }

    const next = filterRef.current.push(value, maxAbs);
    setDisplay({ ...next, displayRaw: next.smoothedRaw });
  }, [value, maxAbs, smooth]);

  return display;
}

/** rAF-driven display — reads a live ref every frame (matches 3D wheel viewer). */
export function useCenteredAnalogDisplayFromRef(
  valueRef: RefObject<number | null>,
  maxAbs: number,
  enabled: boolean,
): CenteredAnalogDisplay & { displayRaw: number | null } {
  const [display, setDisplay] = useState<CenteredAnalogDisplay & { displayRaw: number | null }>({
    barPercent: null,
    smoothedRaw: null,
    displayRaw: null,
  });
  const rafRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setDisplay({ barPercent: null, smoothedRaw: null, displayRaw: null });
      return;
    }

    const tick = () => {
      const value = valueRef.current;
      if (value === null || !Number.isFinite(value)) {
        setDisplay({ barPercent: null, smoothedRaw: null, displayRaw: null });
      } else {
        const barPercent = toCenteredPercent(value, maxAbs);
        setDisplay({ barPercent, smoothedRaw: value, displayRaw: value });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, maxAbs, valueRef]);

  return display;
}
