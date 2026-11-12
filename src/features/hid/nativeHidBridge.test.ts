import { describe, expect, test } from 'bun:test';
import { dispatchNativeHidReportBatch } from './nativeHidBridge';

describe('native HID telemetry batches', () => {
  test('dispatches every report in the original order to telemetry listeners', () => {
    const delivered: number[][] = [];
    dispatchNativeHidReportBatch([[1, 10], [1, 20], [1, 30]], (report) => {
      delivered.push(Array.from(report));
    });
    expect(delivered).toEqual([[1, 10], [1, 20], [1, 30]]);
  });
});
