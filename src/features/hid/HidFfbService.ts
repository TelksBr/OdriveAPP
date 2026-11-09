import { isDesktopApp } from '../serial/nativeSerialBridge';
import {
  nativeConnectHid,
  nativeDisconnectHid,
  nativeOnHidReport,
  nativeSendHidReport,
} from './nativeHidBridge';

const OPENFFBOARD_VENDOR_ID  = 0x1209;
const ODRIVE_WHEEL_PRODUCT_ID = 0x0d40;

/* ── HID PID block and type assignments ─────────────────────────────────── */
// Each "block" is a slot in the firmware's effect pool.
// Types come from the USB HID PID spec (1=CF, 2=Ramp, 4=Sine, 8=Spring, 9=Damper, 11=Friction).
export type EffectKey = 'cf' | 'sp' | 'da' | 'fr' | 'si' | 'ra';
export const EFFECT_KEYS: EffectKey[] = ['cf', 'sp', 'da', 'fr', 'si', 'ra'];

const BLOCK: Record<EffectKey, number> = { cf: 1, sp: 2, da: 3, fr: 4, si: 6, ra: 7 };
const TYPE: Record<EffectKey, number> = { cf: 1, sp: 8, da: 9, fr: 11, si: 4, ra: 1 };

/** Lab ramp: stepped Constant Force over this window (safer than firmware HID Ramp). */
const RAMP_DURATION_MS = 5000;
const RAMP_STEPS = 50;
/** Lab ramp slider clamp — avoids violent snaps on direct-drive wheels. */
export const RAMP_LAB_MAX_PCT = 15;

export function clampRampLabPct(pct: number): number {
  return Math.max(-RAMP_LAB_MAX_PCT, Math.min(RAMP_LAB_MAX_PCT, pct));
}

export interface EffectParams {
  /** 0–100 for condition effects (spring, damper, friction). */
  pct?: number;
  /** −100…+100 for constant force and ramp end level. */
  magnitudePct?: number;
  /** Sine frequency in Hz (lab slider 5–60). */
  frequencyHz?: number;
}

/* ── Low-level report builders (matching our HID descriptor) ─────────────── */

function i16Bytes(v: number): [number, number] {
  const n = v & 0xffff;
  return [n & 0xff, (n >> 8) & 0xff];
}

function u16Bytes(v: number): [number, number] {
  const n = v & 0xffff;
  return [n & 0xff, (n >> 8) & 0xff];
}

// 0x01  SET_EFFECT_REPORT — 17 bytes (incl. enableAxis + direction; zeroed for 1-axis wheel)
function buildSetEffect(blockIdx: number, type: number, durationMs = 0xffff, gain = 255): Uint8Array {
  return new Uint8Array([
    blockIdx, type,
    durationMs & 0xff, (durationMs >> 8) & 0xff,
    0, 0,    // TriggerRepeatInterval
    0, 0,    // SamplePeriod
    0, 0,    // StartDelay
    gain,
    0,       // TriggerButton
    0,       // enableAxis
    0, 0,    // directionX
    0, 0,    // directionY
  ]);
}

// 0x03  SET_CONDITION_REPORT — 14 bytes (Spring / Damper / Friction)
function buildCondition(blockIdx: number, posCoef: number, negCoef = posCoef): Uint8Array {
  return new Uint8Array([
    blockIdx,
    0x00,
    ...i16Bytes(0),
    ...i16Bytes(posCoef), ...i16Bytes(negCoef),
    ...i16Bytes(0x7fff), ...i16Bytes(0x7fff),
    ...i16Bytes(0),
  ]);
}

// 0x04  SET_PERIODIC_REPORT — 11 bytes (Sine, square, triangle, …)
function buildPeriodic(blockIdx: number, magnitude: number, periodMs: number, offset = 0, phase = 0): Uint8Array {
  const period = Math.max(1, Math.min(0x7fff, Math.round(periodMs)));
  return new Uint8Array([
    blockIdx,
    ...u16Bytes(magnitude & 0xffff),
    ...i16Bytes(offset),
    ...u16Bytes(phase & 0xffff),
    period & 0xff, (period >> 8) & 0xff, (period >> 16) & 0xff, (period >> 24) & 0xff,
  ]);
}

// 0x05  SET_CONSTANT_FORCE_REPORT — 3 bytes
function buildConstantForce(blockIdx: number, magnitudeS16: number): Uint8Array {
  return new Uint8Array([blockIdx, ...i16Bytes(magnitudeS16)]);
}

// 0x0A  EFFECT_OPERATION_REPORT — 3 bytes  (op: 1=Start, 2=StartSolo, 3=Stop)
function buildOp(blockIdx: number, op: number, loopCount = 1): Uint8Array {
  return new Uint8Array([blockIdx, op, loopCount]);
}

// pct 0..100 → HID coefficient 0..32767
export function pctToCoef(pct: number): number {
  return Math.round((Math.max(0, Math.min(100, pct)) / 100) * 0x7fff);
}

export function pctToMagnitude(pct: number): number {
  return Math.round((Math.max(-100, Math.min(100, pct)) / 100) * 0x7fff);
}

/** Map lab frequency slider (Hz) to HID period field (ms). */
export function hzToPeriodMs(hz: number): number {
  const clamped = Math.max(5, Math.min(60, hz));
  return Math.round(1000 / clamped);
}

/** Wheel position in degrees from HID input report 0x01 (X axis at byte offset 8). */
export function parseWheelPositionFromReport(event: { reportId: number; data: DataView }, halfRangeDeg: number): number | null {
  if (event.reportId !== 0x01 || event.data.byteLength < 10) {
    return null;
  }
  const x = event.data.getInt16(8, true);
  return (x / 32767) * halfRangeDeg;
}

type ConnectionListener = (connected: boolean, deviceName: string, unplugged?: boolean) => void;

const EMPTY_RUNNING: Record<EffectKey, boolean> = {
  cf: false, sp: false, da: false, fr: false, si: false, ra: false,
};

/* ── Service ─────────────────────────────────────────────────────────────── */
export class HidFfbService {
  private device: HIDDevice | null = null;
  private nativeConnected = false;
  private nativeDeviceName = '';
  private nativeUnlisten: (() => void) | null = null;
  private nativeInputListeners = new Set<(event: { reportId: number; data: DataView }) => void>();
  private running: Record<EffectKey, boolean> = { ...EMPTY_RUNNING };
  private connectionListeners = new Set<ConnectionListener>();
  private disconnectHandler: (() => void) | null = null;
  private rampStepTimer: ReturnType<typeof setTimeout> | null = null;
  private rampTargetMag = 0;
  private rampStep = 0;

  private clearRampTimer(): void {
    if (this.rampStepTimer !== null) {
      clearTimeout(this.rampStepTimer);
      this.rampStepTimer = null;
    }
    this.rampStep = 0;
    this.rampTargetMag = 0;
  }

  get connected(): boolean {
    if (isDesktopApp()) {
      return this.nativeConnected;
    }
    return Boolean(this.device?.opened);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.connected, this.device?.productName ?? '');
    return () => this.connectionListeners.delete(listener);
  }

  private notifyConnection(connected: boolean, unplugged = false): void {
    const deviceName = connected
      ? (isDesktopApp() ? this.nativeDeviceName : (this.device?.productName ?? ''))
      : '';
    for (const listener of this.connectionListeners) {
      listener(connected, deviceName, unplugged);
    }
  }

  private clearRunningState(): void {
    this.clearRampTimer();
    this.running = { ...EMPTY_RUNNING };
  }

  private bindDisconnectListener(device: HIDDevice): void {
    if (this.disconnectHandler && this.device) {
      (this.device as unknown as EventTarget).removeEventListener('disconnect', this.disconnectHandler);
    }
    this.disconnectHandler = () => {
      this.device = null;
      this.clearRunningState();
      this.notifyConnection(false, true);
    };
    if ('addEventListener' in device && typeof (device as { addEventListener?: unknown }).addEventListener === 'function') {
      (device as unknown as EventTarget).addEventListener('disconnect', this.disconnectHandler);
    }
  }

  /** Stop every firmware effect slot — ignores local running flags (firmware may still be active). */
  private async stopAllOnDevice(): Promise<void> {
    if (!this.connected) {
      return;
    }
    for (const key of EFFECT_KEYS) {
      try {
        await this.sendReport(0x0a, buildOp(BLOCK[key], 3, 0));
      } catch {
        // Device may drop mid-sequence; caller still clears local state.
      }
    }
    try {
      await this.sendReport(0x0c, new Uint8Array([0x04]));
    } catch {
      // ignore
    }
  }

  async connect(): Promise<string> {
    if (isDesktopApp()) {
      const dev = await nativeConnectHid(OPENFFBOARD_VENDOR_ID, ODRIVE_WHEEL_PRODUCT_ID);
      this.nativeConnected = true;
      this.nativeDeviceName = `OpenFFBoard FFB Wheel (${dev})`;
      if (this.nativeUnlisten) {
        this.nativeUnlisten();
      }
      this.nativeUnlisten = await nativeOnHidReport((rawBytes) => {
        if (rawBytes.length === 0) return;
        const reportId = rawBytes[0];
        const dataView = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
        const event = { reportId, data: dataView };
        for (const listener of this.nativeInputListeners) {
          listener(event);
        }
      });
      await this.sendReport(0x0c, new Uint8Array([0x01]));
      await this.sendReport(0x0d, new Uint8Array([255]));
      await this.stopAllOnDevice();
      this.clearRunningState();
      this.notifyConnection(true);
      return this.nativeDeviceName;
    }

    if (!navigator.hid) {
      throw new Error('WebHID is not available');
    }
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: OPENFFBOARD_VENDOR_ID, productId: ODRIVE_WHEEL_PRODUCT_ID }],
    });
    const device = devices[0];
    if (!device) {
      throw new Error('No compatible FFB HID device selected');
    }
    return this.attachDevice(device);
  }

  /** Re-open a device the user already approved in this browser (no picker). */
  async restoreGrantedDevice(): Promise<string | null> {
    if (!navigator.hid || this.connected) {
      return this.device?.productName ?? null;
    }
    const devices = await navigator.hid.getDevices();
    const device = devices.find(
      (entry) => entry.vendorId === OPENFFBOARD_VENDOR_ID && entry.productId === ODRIVE_WHEEL_PRODUCT_ID,
    );
    if (!device) {
      return null;
    }
    return this.attachDevice(device);
  }

  private async attachDevice(device: HIDDevice): Promise<string> {
    if (!device.opened) {
      await device.open();
    }
    this.device = device;
    await this.sendReport(0x0c, new Uint8Array([0x01]));
    await this.sendReport(0x0d, new Uint8Array([255]));
    await this.stopAllOnDevice();
    this.clearRunningState();
    this.bindDisconnectListener(device);
    this.notifyConnection(true);
    return device.productName;
  }

  async disconnect(): Promise<void> {
    if (isDesktopApp()) {
      if (this.nativeUnlisten) {
        this.nativeUnlisten();
        this.nativeUnlisten = null;
      }
      this.nativeConnected = false;
      this.nativeDeviceName = '';
      await nativeDisconnectHid().catch(() => undefined);
      this.clearRunningState();
      this.notifyConnection(false);
      return;
    }
    const device = this.device;
    try {
      if (device?.opened) {
        await this.stopAllOnDevice();
      }
    } finally {
      if (device?.opened) {
        try {
          await device.close();
        } catch {
          // ignore
        }
      }
      this.device = null;
      this.clearRunningState();
      this.notifyConnection(false);
    }
  }

  /** Start or update a specific effect. Safe to call while already running (updates parameters). */
  async startEffect(key: EffectKey, params: EffectParams = {}): Promise<void> {
    if (key === 'ra') {
      await this.startLabRamp(params);
      return;
    }

    const blockIdx = BLOCK[key];
    const type = TYPE[key];

    await this.sendReport(0x01, buildSetEffect(blockIdx, type, 0xffff, 255));

    if (key === 'cf') {
      const raw = params.magnitudePct ?? params.pct ?? 0;
      const clamped = Math.max(-100, Math.min(100, raw));
      const mag = Math.round((clamped / 100) * 0x7fff);
      await this.sendReport(0x05, buildConstantForce(blockIdx, mag));
    } else if (key === 'si') {
      const mag = pctToCoef(params.pct ?? 50);
      const periodMs = hzToPeriodMs(params.frequencyHz ?? 15);
      await this.sendReport(0x04, buildPeriodic(blockIdx, mag, periodMs));
    } else {
      const coef = pctToCoef(params.pct ?? 50);
      await this.sendReport(0x03, buildCondition(blockIdx, coef));
    }

    await this.sendReport(0x0a, buildOp(blockIdx, 1, 0));
    this.running[key] = true;
  }

  /**
   * Lab ramp: stepped Constant Force (slot 7) — avoids firmware HID Ramp quirks
   * (instant snap when SET_EFFECT report was truncated / startTime unset).
   */
  private async startLabRamp(params: EffectParams): Promise<void> {
    const blockIdx = BLOCK.ra;
    const raw = params.magnitudePct ?? params.pct ?? 0;
    const clamped = clampRampLabPct(raw);
    const targetMag = pctToMagnitude(clamped);

    this.clearRampTimer();
    if (this.device?.opened) {
      await this.sendReport(0x0a, buildOp(blockIdx, 3, 0));
    }

    await this.sendReport(0x01, buildSetEffect(blockIdx, TYPE.cf, 0xffff, 255));
    await this.sendReport(0x05, buildConstantForce(blockIdx, 0));
    await this.sendReport(0x0a, buildOp(blockIdx, 1, 0));
    this.running.ra = true;
    this.rampTargetMag = targetMag;
    this.rampStep = 0;

    if (targetMag === 0) {
      return;
    }

    const stepMs = Math.max(40, Math.round(RAMP_DURATION_MS / RAMP_STEPS));
    const scheduleStep = () => {
      this.rampStepTimer = setTimeout(() => {
        void this.advanceLabRamp(stepMs).catch(() => {
          this.running.ra = false;
          this.clearRampTimer();
        });
      }, stepMs);
    };
    scheduleStep();
  }

  private async advanceLabRamp(stepMs: number): Promise<void> {
    if (!this.connected || !this.running.ra) {
      this.clearRampTimer();
      return;
    }

    this.rampStep += 1;
    const mag = Math.round((this.rampTargetMag * this.rampStep) / RAMP_STEPS);
    await this.sendReport(0x05, buildConstantForce(BLOCK.ra, mag));

    if (this.rampStep >= RAMP_STEPS) {
      this.clearRampTimer();
      return;
    }

    this.rampStepTimer = setTimeout(() => {
      void this.advanceLabRamp(stepMs).catch(() => {
        this.running.ra = false;
        this.clearRampTimer();
      });
    }, stepMs);
  }

  async stopEffect(key: EffectKey): Promise<void> {
    if (key === 'ra') {
      this.clearRampTimer();
    }
    if (this.connected) {
      await this.sendReport(0x0a, buildOp(BLOCK[key], 3, 0));
    }
    this.running[key] = false;
  }

  async stopAll(): Promise<void> {
    await this.stopAllOnDevice();
    this.clearRunningState();
  }

  isRunning(key: EffectKey): boolean {
    return this.running[key];
  }

  get openedDevice(): HIDDevice | null {
    return this.device?.opened ? this.device : null;
  }

  onInputReport(listener: (event: { reportId: number; data: DataView }) => void): () => void {
    if (isDesktopApp()) {
      this.nativeInputListeners.add(listener);
      return () => this.nativeInputListeners.delete(listener);
    }
    const device = this.device;
    if (!device) {
      return () => undefined;
    }
    const target = device as unknown as EventTarget;
    const handler = (event: Event) => listener(event as unknown as { reportId: number; data: DataView });
    target.addEventListener('inputreport', handler);
    return () => target.removeEventListener('inputreport', handler);
  }

  /** Low-level HID output — used by Performance Test runner. */
  async sendRawReport(reportId: number, data: Uint8Array | number[]): Promise<void> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    await this.sendReport(reportId, bytes);
  }

  private async sendReport(reportId: number, data: Uint8Array): Promise<void> {
    if (isDesktopApp()) {
      if (!this.nativeConnected) {
        throw new Error('HID device is not connected');
      }
      await nativeSendHidReport(reportId, data);
      return;
    }
    if (!this.device?.opened) {
      throw new Error('HID device is not connected');
    }
    await this.device.sendReport(reportId, data);
  }
}

export const hidFfbService = new HidFfbService();
