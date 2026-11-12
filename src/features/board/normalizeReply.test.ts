import { describe, expect, test } from 'bun:test';
import { isOdriveErrorReply } from '../serial/odriveErrors';
import {
  assertReadback,
  normalizeReply,
} from './normalizeReply';
import type { ConfigField } from '../config/fieldCatalog';

function field(partial: Pick<ConfigField, 'path' | 'type' | 'protocol'>): ConfigField {
  return {
    label: partial.path,
    description: '',
    ...partial,
  };
}

describe('isOdriveErrorReply', () => {
  test('matches firmware error tokens', () => {
    expect(isOdriveErrorReply('error')).toBe(true);
    expect(isOdriveErrorReply('Error: invalid')).toBe(true);
    expect(isOdriveErrorReply('invalid property')).toBe(true);
    expect(isOdriveErrorReply('not implemented')).toBe(true);
    expect(isOdriveErrorReply('err_axis')).toBe(true);
    expect(isOdriveErrorReply('[axis.maxtq=bad|ERR]')).toBe(true);
    expect(isOdriveErrorReply('[axis.maxtq=bad|invalid property]')).toBe(true);
  });

  test('ignores numeric and version replies', () => {
    expect(isOdriveErrorReply('0')).toBe(false);
    expect(isOdriveErrorReply('1.0.0-rc12')).toBe(false);
    expect(isOdriveErrorReply('OK')).toBe(false);
  });
});

describe('normalizeReply', () => {
  test('keeps enum 0/1 as digits', () => {
    expect(normalizeReply('0')).toBe('0');
    expect(normalizeReply('1')).toBe('1');
    expect(normalizeReply('2', field({ path: 'gpio.1.mode', type: 'enum', protocol: 'openffboard' }))).toBe('2');
    expect(normalizeReply('1', field({ path: 'gpio.1.mode', type: 'enum', protocol: 'openffboard' }))).toBe('1');
  });

  test('maps 0/1 to bool only for bool fields', () => {
    const boolField = field({ path: 'axis.invert', type: 'bool', protocol: 'openffboard' });
    expect(normalizeReply('0', boolField)).toBe('false');
    expect(normalizeReply('1', boolField)).toBe('true');
    expect(normalizeReply('[cls|1]', boolField)).toBe('true');
  });

  test('keeps True/False and OpenFFBoard wrappers', () => {
    expect(normalizeReply('True')).toBe('true');
    expect(normalizeReply('False')).toBe('false');
    expect(normalizeReply('[sys|1.0.0]')).toBe('1.0.0');
    expect(normalizeReply('OK')).toBe('OK');
  });

  test('throws on ODrive error lines', () => {
    expect(() => normalizeReply('invalid property')).toThrow(/invalid property/i);
  });
});

describe('assertReadback', () => {
  test('accepts gpio mode 0/1 after read', () => {
    const mode = field({ path: 'gpio.1.mode', type: 'enum', protocol: 'openffboard' });
    expect(() => assertReadback(mode, '1', '1')).not.toThrow();
    expect(() => assertReadback(mode, '0', '0')).not.toThrow();
    expect(() => assertReadback(mode, '1', 'true')).toThrow();
  });

  test('accepts bool tokens equivalently', () => {
    const flag = field({ path: 'axis.invert', type: 'bool', protocol: 'openffboard' });
    expect(() => assertReadback(flag, 'true', '1')).not.toThrow();
    expect(() => assertReadback(flag, 'false', '0')).not.toThrow();
    expect(() => assertReadback(flag, 'true', 'false')).toThrow();
  });

  test('compares ints without bool coercion', () => {
    const idx = field({ path: 'gpio.1.idx', type: 'int', protocol: 'openffboard' });
    expect(() => assertReadback(idx, '0', '0')).not.toThrow();
    expect(() => assertReadback(idx, '1', '1')).not.toThrow();
  });
});
