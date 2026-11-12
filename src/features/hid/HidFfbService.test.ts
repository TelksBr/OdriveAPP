import { describe, expect, test } from 'bun:test';
import {
  buildSetEffectReport,
  effectGainPctToHidGain,
  HidFfbService,
  type EffectKey,
} from './HidFfbService';

function createTestService() {
  const reports: Array<{ reportId: number; data: number[] }> = [];
  const service = new HidFfbService();
  const internals = service as unknown as {
    device: { opened: boolean; sendReport: (reportId: number, data: Uint8Array) => Promise<void> } | null;
    running: Record<EffectKey, boolean>;
  };
  internals.device = {
    opened: true,
    sendReport: async (reportId, data) => reports.push({ reportId, data: Array.from(data) }),
  };
  internals.running = { cf: false, sp: false, da: false, fr: false, si: false, ra: false };
  return { service, reports };
}

describe('HID PID effect gain', () => {
  test('maps the Lab percentage to the normalized Set Effect gain byte', () => {
    expect(effectGainPctToHidGain(0)).toBe(0);
    expect(effectGainPctToHidGain(50)).toBe(128);
    expect(effectGainPctToHidGain(100)).toBe(255);
    expect(effectGainPctToHidGain(-10)).toBe(0);
    expect(effectGainPctToHidGain(110)).toBe(255);
    expect(effectGainPctToHidGain(Number.NaN)).toBe(255);
  });

  test('writes the selected gain to the Set Effect report without shifting other fields', () => {
    const report = buildSetEffectReport(4, 11, 0xffff, 128);

    expect(report).toHaveLength(17);
    expect(report[0]).toBe(4);
    expect(report[1]).toBe(11);
    expect(report[10]).toBe(128);
    expect(Array.from(report.slice(11))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test('updates a running effect gain in place without restarting it', async () => {
    const { service, reports } = createTestService();
    await service.startEffect('fr', { pct: 20, effectGainPct: 50 });
    expect(reports.map((report) => report.reportId)).toEqual([0x01, 0x03, 0x0a]);
    expect(reports[0].data[10]).toBe(128);

    reports.length = 0;
    await service.updateEffectGain('fr', 0);

    expect(reports.map((report) => report.reportId)).toEqual([0x01]);
    expect(reports[0].data[10]).toBe(0);
    expect(service.isRunning('fr')).toBe(true);
  });
});
