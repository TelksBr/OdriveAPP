import { afterEach, describe, expect, test } from 'bun:test';
import { SerialService } from './SerialService';

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('SerialService ODrive writes', () => {
  test('does not lose an immediate firmware error while sending a write', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { hostname: 'localhost', protocol: 'http:' },
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
      },
    });

    const service = new SerialService();
    const internals = service as unknown as {
      writer: { write: (data: Uint8Array) => Promise<void> };
      consumeChunk: (chunk: string) => void;
    };
    internals.writer = {
      write: async () => {
        // Model a device whose error reply is already readable as soon as the
        // host write completes. The read loop may run before the write promise
        // continuation, so the command must be pending before bytes are sent.
        internals.consumeChunk('ERROR invalid property\r\n');
      },
    };

    await expect(service.writeOdriveNow('w axis0.invalid 1', false)).rejects.toThrow(
      'ERROR invalid property',
    );
  });
});
