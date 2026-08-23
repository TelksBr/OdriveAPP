import { toCenteredPercent, toLinearPercent } from './analogAxisMath';

export interface AnalogFilterOptions {
  /** EMA weight for raw ADC samples (lower = smoother, slower). */
  rawAlpha: number;
  /** EMA weight applied after percent conversion. */
  percentAlpha: number;
  /** Integer label only changes when smoothed value moves this far past the displayed step. */
  percentHysteresis: number;
  /** Values below this percent are shown as 0 (resting deadband). */
  deadbandPercent: number;
}

export const LINEAR_ANALOG_FILTER: AnalogFilterOptions = {
  rawAlpha: 0.12,
  percentAlpha: 0.16,
  percentHysteresis: 0.8,
  deadbandPercent: 0.4,
};

export const FAST_ANALOG_FILTER: AnalogFilterOptions = {
  rawAlpha: 0.55,
  percentAlpha: 0.65,
  percentHysteresis: 0.5,
  deadbandPercent: 0.3,
};

export const CENTERED_ANALOG_FILTER: AnalogFilterOptions = {
  rawAlpha: 0.18,
  percentAlpha: 0.2,
  percentHysteresis: 0.9,
  deadbandPercent: 0.5,
};

export interface LinearAnalogDisplay {
  barPercent: number | null;
  labelPercent: number | null;
  smoothedRaw: number | null;
}

export interface CenteredAnalogDisplay {
  barPercent: number | null;
  smoothedRaw: number | null;
}

function ema(prev: number | null, next: number, alpha: number): number {
  return prev === null ? next : prev + (next - prev) * alpha;
}

function stabilizeRoundedPercent(
  smoothed: number,
  displayed: number | null,
  hysteresis: number,
): number {
  const rounded = Math.round(smoothed);
  if (displayed === null) {
    return rounded;
  }
  if (rounded === displayed) {
    return displayed;
  }
  if (Math.abs(smoothed - displayed) >= hysteresis) {
    return rounded;
  }
  return displayed;
}

function applyDeadband(percent: number, deadband: number): number {
  return Math.abs(percent) <= deadband ? 0 : percent;
}

export class LinearAnalogDisplayFilter {
  private rawEma: number | null = null;
  private percentEma: number | null = null;
  private labelPercent: number | null = null;
  private boundsKey = '';
  private readonly options: AnalogFilterOptions;

  constructor(options: AnalogFilterOptions = LINEAR_ANALOG_FILTER) {
    this.options = options;
  }

  reset(): void {
    this.rawEma = null;
    this.percentEma = null;
    this.labelPercent = null;
    this.boundsKey = '';
  }

  push(raw: number | null, min: number, max: number): LinearAnalogDisplay {
    const boundsKey = `${min}:${max}`;
    if (boundsKey !== this.boundsKey) {
      this.boundsKey = boundsKey;
      this.rawEma = null;
      this.percentEma = null;
      this.labelPercent = null;
    }

    if (raw === null || !Number.isFinite(raw)) {
      this.reset();
      return { barPercent: null, labelPercent: null, smoothedRaw: null };
    }

    this.rawEma = ema(this.rawEma, raw, this.options.rawAlpha);
    const linear = toLinearPercent(this.rawEma, min, max);
    if (linear === null) {
      return { barPercent: null, labelPercent: null, smoothedRaw: this.rawEma };
    }

    const deadbanded = applyDeadband(linear, this.options.deadbandPercent);
    this.percentEma = ema(this.percentEma, deadbanded, this.options.percentAlpha);
    this.labelPercent = stabilizeRoundedPercent(
      this.percentEma,
      this.labelPercent,
      this.options.percentHysteresis,
    );

    return {
      barPercent: this.percentEma,
      labelPercent: this.labelPercent,
      smoothedRaw: this.rawEma,
    };
  }
}

export class CenteredAnalogDisplayFilter {
  private rawEma: number | null = null;
  private percentEma: number | null = null;
  private rangeKey = '';
  private readonly options: AnalogFilterOptions;

  constructor(options: AnalogFilterOptions = CENTERED_ANALOG_FILTER) {
    this.options = options;
  }

  reset(): void {
    this.rawEma = null;
    this.percentEma = null;
    this.rangeKey = '';
  }

  push(raw: number | null, maxAbs: number): CenteredAnalogDisplay {
    const rangeKey = String(maxAbs);
    if (rangeKey !== this.rangeKey) {
      this.rangeKey = rangeKey;
      this.rawEma = null;
      this.percentEma = null;
    }

    if (raw === null || !Number.isFinite(raw)) {
      this.reset();
      return { barPercent: null, smoothedRaw: null };
    }

    this.rawEma = ema(this.rawEma, raw, this.options.rawAlpha);
    const centered = toCenteredPercent(this.rawEma, maxAbs);
    if (centered === null) {
      return { barPercent: null, smoothedRaw: this.rawEma };
    }

    const deadbanded = applyDeadband(centered, this.options.deadbandPercent);
    this.percentEma = ema(this.percentEma, deadbanded, this.options.percentAlpha);

    return {
      barPercent: this.percentEma,
      smoothedRaw: this.rawEma,
    };
  }
}
