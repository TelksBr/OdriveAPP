import { describe, expect, test } from 'bun:test';
import { matchesSerialReply } from './serialReply';

describe('matchesSerialReply', () => {
  test('requires a matching OpenFFBoard command echo', () => {
    expect(matchesSerialReply('axis.maxtq?', '[axis.maxtq?|25]')).toBe(true);
    expect(matchesSerialReply('axis.maxtq?', '[axis.invert?|0]')).toBe(false);
    expect(matchesSerialReply('axis.maxtq?', 'boot: ready')).toBe(false);
  });

  test('keeps plain ODrive replies compatible', () => {
    expect(matchesSerialReply('r axis0.encoder.pos_estimate', '123.5')).toBe(true);
    expect(matchesSerialReply('r axis0.encoder.pos_estimate', '[axis.maxtq?|25]')).toBe(false);
  });
});
