import { HANDSHAKE_COMMAND, HANDSHAKE_TIMEOUT_MS, isControlPortReply, unwrapControlReply } from './serialPortProbe';
import { isOdriveErrorReply } from './odriveErrors';
import { matchesSerialReply } from './serialReply';
import { sleep } from '../../shared/sleep';
import {
  isDesktopApp,
  nativeAutoProbeOdrive,
  nativeConnectSerial,
  nativeDisconnectSerial,
  nativeListPorts,
  nativeOnSerialDisconnected,
  nativeOnSerialRx,
  nativeQuerySerial,
  nativeWriteSerial,
} from './nativeSerialBridge';

export type SerialEvent =
  | { type: 'connected'; firmware?: string }
  | { type: 'disconnected' }
  | { type: 'rx'; line: string; command?: string }
  | { type: 'tx'; line: string }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string }
  | { type: 'desync'; message: string }
  | { type: 'link-dead'; message: string };

export type ConnectOptions = {
  port?: SerialPort;
  portName?: string;
  /** When true (manual Connect), fall back to the browser port picker. Auto-reconnect must pass false. */
  allowPicker?: boolean;
};

type SerialListener = (event: SerialEvent) => void;

type PendingKind = 'reply' | 'silent-write';

interface PendingCommand {
  command: string;
  kind: PendingKind;
  expectReply: boolean;
  log: boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeoutId: number;
}

const WATCHDOG_FAILURES = 5;

export class SerialService {
  private port: SerialPort | null = null;
  private authorizedPort: SerialPort | null = null;
  private authorizedPortInfo: SerialPortInfo | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private listeners = new Set<SerialListener>();
  private pending: PendingCommand[] = [];
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private readBuffer = '';
  private closing = false;
  private live = false;
  private consecutiveTimeouts = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private sessionOp: Promise<unknown> = Promise.resolve();
  private unlistenNativeRx: (() => void) | null = null;
  private unlistenNativeDisconnect: (() => void) | null = null;
  private dfuMode = false;
  private nativeWrite = nativeWriteSerial;

  setDfuMode(active: boolean): void {
    this.dfuMode = active;
  }

  isDfuMode(): boolean {
    return this.dfuMode;
  }

  /** True only after `sys.swver?` handshake succeeds — not merely after `port.open()`. */
  get isConnected(): boolean {
    return this.live;
  }

  get activePort(): SerialPort | null {
    return this.port;
  }

  ownsPort(port: SerialPort): boolean {
    return this.port === port;
  }

  subscribe(listener: SerialListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(options: ConnectOptions = {}): Promise<void> {
    return this.exclusive(() => this.connectNow(options));
  }

  /**
   * Reconnect after reboot or USB drop — granted ports only, never the picker.
   * True only when handshake succeeds. An open COM without a reply is a failure.
   */
  async reconnectKnownPort(maxAttempts = 12, delayMs = 1000): Promise<boolean> {
    return this.exclusive(() => this.reconnectKnownPortNow(maxAttempts, delayMs));
  }

  async disconnect(): Promise<void> {
    return this.exclusive(() => this.teardown({ emitDisconnected: true }));
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.sessionOp.then(fn, fn);
    this.sessionOp = run.then(() => undefined, () => undefined);
    return run;
  }

  private async connectNow(options: ConnectOptions): Promise<void> {
    if (isDesktopApp()) {
      await this.connectNative(options.portName);
      return;
    }
    if (!navigator.serial) {
      throw new Error('Web Serial is not available');
    }
    if (this.live) {
      return;
    }

    const allowPicker = options.allowPicker ?? true;
    if (options.port) {
      this.logInfo(`connect: using provided port handle (${this.describePort(options.port)})`);
      await this.openAndHandshake(options.port);
      return;
    }

    const ports = await navigator.serial.getPorts();
    this.logInfo(`connect: ${ports.length} granted port(s) — ${this.describeGrantedPorts(ports)}`);
    const ordered = this.orderGrantedPorts(ports);
    let lastError: Error | undefined;
    for (const port of ordered) {
      try {
        this.logInfo(`connect: handshake on ${this.describePort(port)}`);
        await this.openAndHandshake(port);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logInfo(`connect: handshake failed on ${this.describePort(port)} — ${lastError.message}`);
      }
    }

    if (!allowPicker) {
      throw lastError ?? new Error('serialNoLivePort');
    }

    this.logInfo('connect: no live granted port — opening browser picker');
    try {
      const picked = await navigator.serial.requestPort();
      await this.openAndHandshake(picked);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new Error('serialConnectCancelled');
      }
      throw error;
    }
  }

  private async reconnectKnownPortNow(maxAttempts: number, delayMs: number): Promise<boolean> {
    if (this.dfuMode) {
      return false;
    }
    if (isDesktopApp()) {
      if (this.live) {
        return true;
      }
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          this.logInfo(`reconnect native attempt ${attempt + 1}/${maxAttempts}`);
          await this.connectNative();
          this.logInfo('reconnect: native success');
          return true;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logInfo(`reconnect: attempt failed — ${msg}`);
          await sleep(delayMs);
        }
      }
      return false;
    }

    if (!navigator.serial) {
      return false;
    }
    if (this.live) {
      return true;
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const ports = await navigator.serial.getPorts();
      this.logInfo(`reconnect attempt ${attempt + 1}/${maxAttempts}: ${ports.length} granted — ${this.describeGrantedPorts(ports)}`);
      const ordered = this.orderGrantedPorts(ports);
      if (ordered.length === 0) {
        this.logInfo('reconnect: no granted ports');
      }
      for (const port of ordered) {
        try {
          this.logInfo(`reconnect: handshake on ${this.describePort(port)}`);
          await this.openAndHandshake(port);
          this.logInfo('reconnect: success');
          return true;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logInfo(`reconnect: handshake failed — ${msg}`);
        }
      }
      await sleep(delayMs);
    }

    this.logInfo(`reconnect: failed after ${maxAttempts} attempts`);
    return false;
  }

  async sendCommand(command: string, expectReply = true, timeoutMs = 2000, log = true): Promise<string> {
    return this.enqueue(() => this.sendCommandNow(command, expectReply, timeoutMs, log));
  }

  /** Runs as one queue item — use commandNow() inside to avoid interleaved polling. */
  runAtomic<T>(operation: () => Promise<T>): Promise<T> {
    return this.enqueue(operation);
  }

  commandNow(command: string, expectReply = true, timeoutMs = 2000, log = true): Promise<string> {
    return this.sendCommandNow(command, expectReply, timeoutMs, log);
  }

  /**
   * ODrive `w` commands are silent on success; rejections arrive within ~80 ms.
   * Non-error RX during the window is logged as unsolicited — not treated as ACK.
   * Returns undefined on success; rejects on an error line.
   */
  writeOdrive(command: string, log = true): Promise<string | undefined> {
    return this.enqueue(() => this.writeOdriveNow(command, log));
  }

  private async sendRawLine(line: string): Promise<void> {
    if (isDesktopApp()) {
      await this.nativeWrite(`${line}\n`);
      return;
    }
    if (!this.writer) {
      throw new Error('Serial is not connected');
    }
    await this.writer.write(this.encoder.encode(`${line}\n`));
  }

  async writeOdriveNow(command: string, log = true): Promise<string | undefined> {
    if (!isDesktopApp() && !this.writer) {
      throw new Error('Serial is not connected');
    }

    const cleanCommand = command.trim();
    if (!cleanCommand) {
      return undefined;
    }

    if (log) {
      this.emit({ type: 'tx', line: cleanCommand });
    }

    return new Promise<string | undefined>((resolve, reject) => {
      const entry: PendingCommand = {
        command: cleanCommand,
        kind: 'silent-write',
        expectReply: true,
        log,
        resolve: () => {
          resolve(undefined);
        },
        reject,
        timeoutId: 0,
      };

      // Register before transmitting: firmware can return an ODrive error
      // immediately, including before the transport write promise resolves.
      this.pending.push(entry);

      void this.sendRawLine(cleanCommand).then(() => {
        // A fast error reply can settle and remove the pending entry before the
        // write promise resolves. Only arm the silent-success timeout if it is
        // still waiting for a response.
        if (!this.pending.includes(entry)) return;
        entry.timeoutId = window.setTimeout(() => {
          const index = this.pending.indexOf(entry);
          if (index >= 0) {
            this.pending.splice(index, 1);
          }
          resolve(undefined);
        }, 80);
      }).catch((error: unknown) => {
        const index = this.pending.indexOf(entry);
        if (index >= 0) {
          this.pending.splice(index, 1);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  private async openAndHandshake(port: SerialPort): Promise<void> {
    await this.teardown({ emitDisconnected: this.live });

    this.port = port;
    await this.openPort(port);

    if (!this.port.readable || !this.port.writable) {
      await this.teardown({ emitDisconnected: false });
      throw new Error('Serial port did not expose readable/writable streams');
    }

    this.closing = false;
    this.readBuffer = '';
    this.consecutiveTimeouts = 0;
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    void this.readLoop();

    try {
      const raw = await this.commandNow(HANDSHAKE_COMMAND, true, HANDSHAKE_TIMEOUT_MS, true);
      if (!isControlPortReply(raw)) {
        throw new Error('serialHandshakeFailed');
      }
      this.live = true;
      this.consecutiveTimeouts = 0;
      this.authorizedPort = port;
      this.authorizedPortInfo = this.readPortInfo(port);
      this.emit({ type: 'connected', firmware: unwrapControlReply(raw) });
    } catch (error) {
      await this.teardown({ emitDisconnected: false });
      if (error instanceof Error && error.message === 'serialHandshakeFailed') {
        throw error;
      }
      throw new Error('serialHandshakeFailed');
    }
  }

  private async openPort(port: SerialPort): Promise<void> {
    try {
      await port.open({ baudRate: 115200, bufferSize: 4096 });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'InvalidStateError') {
        await port.close().catch(() => undefined);
        await port.open({ baudRate: 115200, bufferSize: 4096 });
        return;
      }
      throw error;
    }
  }

  private async teardown(options: { emitDisconnected: boolean }): Promise<void> {
    const wasLive = this.live;
    this.live = false;
    this.closing = true;
    this.consecutiveTimeouts = 0;
    this.queue = Promise.resolve();
    this.rejectPending(new Error('Serial disconnected'));

    const reader = this.reader;
    const writer = this.writer;
    const port = this.port;
    this.reader = null;
    this.writer = null;
    this.port = null;

    if (reader) {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }

    if (writer) {
      writer.releaseLock();
    }

    if (port) {
      await port.close().catch(() => undefined);
    }

    if (isDesktopApp()) {
      if (this.unlistenNativeRx) {
        this.unlistenNativeRx();
        this.unlistenNativeRx = null;
      }
      if (this.unlistenNativeDisconnect) {
        this.unlistenNativeDisconnect();
        this.unlistenNativeDisconnect = null;
      }
      await nativeDisconnectSerial().catch(() => undefined);
    }

    if (options.emitDisconnected && wasLive) {
      this.emit({ type: 'disconnected' });
    }
  }

  private async connectNative(targetPortName?: string): Promise<void> {
    await this.teardown({ emitDisconnected: this.live });
    this.logInfo('connect: scanning native serial ports');

    let portName = targetPortName;
    if (!portName) {
      const saved = localStorage.getItem('wheelforge-selected-com-port');
      const ports = await nativeListPorts();
      if (saved && ports.some((p) => p.name === saved)) {
        portName = saved;
      } else {
        const probed = await nativeAutoProbeOdrive().catch(() => null);
        if (probed && ports.some((p) => p.name === probed)) {
          portName = probed;
        }
      }
    }

    if (!portName) {
      throw new Error('serialNoLivePort');
    }

    this.logInfo(`connect: native connecting to ${portName}`);

    if (this.unlistenNativeRx) {
      this.unlistenNativeRx();
    }
    this.unlistenNativeRx = await nativeOnSerialRx((line) => {
      this.resolveNext(line);
    });

    if (this.unlistenNativeDisconnect) {
      this.unlistenNativeDisconnect();
    }
    this.unlistenNativeDisconnect = await nativeOnSerialDisconnected(() => {
      void this.teardown({ emitDisconnected: true });
    });

    await nativeConnectSerial(portName);
    this.closing = false;
    this.readBuffer = '';
    this.consecutiveTimeouts = 0;

    try {
      const raw = await this.commandNow(HANDSHAKE_COMMAND, true, HANDSHAKE_TIMEOUT_MS, true);
      if (!isControlPortReply(raw)) {
        throw new Error('serialHandshakeFailed');
      }
      this.live = true;
      this.consecutiveTimeouts = 0;
      localStorage.setItem('wheelforge-selected-com-port', portName);
      this.emit({ type: 'connected', firmware: unwrapControlReply(raw) });
    } catch (error) {
      if (localStorage.getItem('wheelforge-selected-com-port') === portName) {
        localStorage.removeItem('wheelforge-selected-com-port');
      }
      await this.teardown({ emitDisconnected: false });
      if (error instanceof Error && error.message === 'serialHandshakeFailed') {
        throw error;
      }
      throw new Error('serialHandshakeFailed');
    }
  }

  /** Prefer the last live control handle, then matching USB ids, then remaining granted ports. Always handshake. */
  private orderGrantedPorts(ports: SerialPort[]): SerialPort[] {
    const seen = new Set<SerialPort>();
    const ordered: SerialPort[] = [];
    const push = (port: SerialPort | undefined) => {
      if (port && !seen.has(port)) {
        seen.add(port);
        ordered.push(port);
      }
    };

    if (this.authorizedPort && ports.includes(this.authorizedPort)) {
      push(this.authorizedPort);
    }
    if (this.authorizedPortInfo) {
      for (const port of ports) {
        if (this.matchesAuthorizedInfo(port)) {
          push(port);
        }
      }
    }
    for (const port of ports) {
      push(port);
    }
    return ordered;
  }

  private logInfo(message: string): void {
    if (import.meta.env.DEV) {
      console.info(`[serial] ${message}`);
    }
    this.emit({ type: 'info', message });
  }

  private describeGrantedPorts(ports: SerialPort[]): string {
    if (ports.length === 0) {
      return 'none';
    }
    return ports.map((port) => this.describePort(port)).join('; ');
  }

  private describePort(port: SerialPort): string {
    return this.formatPortInfo(this.readPortInfo(port)) ?? 'unknown USB id';
  }

  private formatPortInfo(info: SerialPortInfo | null): string | null {
    if (!info || (info.usbVendorId === undefined && info.usbProductId === undefined)) {
      return null;
    }
    const vendor = typeof info.usbVendorId === 'number' ? `0x${info.usbVendorId.toString(16)}` : '?';
    const product = typeof info.usbProductId === 'number' ? `0x${info.usbProductId.toString(16)}` : '?';
    return `${vendor}:${product}`;
  }

  private readPortInfo(port: SerialPort): SerialPortInfo | null {
    try {
      const info = port.getInfo();
      if (!info || (info.usbVendorId === undefined && info.usbProductId === undefined)) {
        return null;
      }
      return info;
    } catch {
      return null;
    }
  }

  private matchesAuthorizedInfo(port: SerialPort): boolean {
    if (!this.authorizedPortInfo) {
      return false;
    }
    const info = this.readPortInfo(port);
    if (!info) {
      return false;
    }
    return (
      info.usbVendorId === this.authorizedPortInfo.usbVendorId &&
      info.usbProductId === this.authorizedPortInfo.usbProductId
    );
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async sendCommandNow(command: string, expectReply = true, timeoutMs = 2000, log = true): Promise<string> {
    if (!isDesktopApp() && !this.writer) {
      throw new Error('Serial is not connected');
    }

    const cleanCommand = command.trim();
    if (!cleanCommand) {
      return '';
    }

    if (!expectReply) {
      if (log) {
        this.emit({ type: 'tx', line: cleanCommand });
      }
      await this.sendRawLine(cleanCommand);
      return '';
    }

    if (isDesktopApp()) {
      if (log) {
        this.emit({ type: 'tx', line: cleanCommand });
      }
      try {
        const reply = await nativeQuerySerial(cleanCommand, timeoutMs);
        this.consecutiveTimeouts = 0;
        if (log) {
          this.emit({ type: 'rx', line: reply, command: cleanCommand });
        }
        return reply;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.consecutiveTimeouts += 1;
        if (this.consecutiveTimeouts >= 5) {
          this.emit({ type: 'link-dead', message: 'Múltiplos timeouts seriais consecutivos' });
        }
        throw new Error(msg);
      }
    }

    return new Promise<string>((resolve, reject) => {
      const entry: PendingCommand = {
        command: cleanCommand,
        kind: 'reply',
        expectReply,
        log,
        resolve,
        reject,
        timeoutId: 0,
      };

      entry.timeoutId = window.setTimeout(() => {
        this.rejectOnePending(entry, `Timeout waiting for reply to: ${cleanCommand}`);
      }, timeoutMs);
      this.pending.push(entry);

      if (log) {
        this.emit({ type: 'tx', line: cleanCommand });
      }
      void this.sendRawLine(cleanCommand).catch((error: unknown) => {
        this.rejectOnePending(entry, error instanceof Error ? error.message : String(error));
      });
    });
  }

  private async readLoop(): Promise<void> {
    while (this.reader && !this.closing) {
      try {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.consumeChunk(this.decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        if (!this.closing) {
          this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
        break;
      }
    }

    if (!this.closing) {
      await this.teardown({ emitDisconnected: true });
    }
  }

  private consumeChunk(chunk: string): void {
    this.readBuffer += chunk;
    const lines = this.readBuffer.split(/\r?\n/);
    this.readBuffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      this.resolveNext(line);
    }
  }

  private resolveNext(line: string): void {
    const next = this.pending[0];
    if (!next) {
      this.emit({ type: 'rx', line });
      return;
    }

    if (!matchesSerialReply(next.command, line)) {
      this.emit({ type: 'rx', line });
      return;
    }

    if (next.kind === 'silent-write') {
      if (isOdriveErrorReply(line)) {
        this.pending.shift();
        window.clearTimeout(next.timeoutId);
        if (next.log) {
          this.emit({ type: 'rx', line, command: next.command });
        }
        next.reject(new Error(line.trim()));
        return;
      }
      this.emit({ type: 'rx', line });
      return;
    }

    this.pending.shift();
    window.clearTimeout(next.timeoutId);
    this.consecutiveTimeouts = 0;
    if (next.log) {
      this.emit({ type: 'rx', line, command: next.command });
    }
    next.resolve(line);
  }

  private rejectPending(error: Error): void {
    this.flushPendingQueue(error.message);
  }

  /** Reject a single timed-out command without aborting the rest of the queue. */
  private rejectOnePending(entry: PendingCommand, reason: string): void {
    const index = this.pending.indexOf(entry);
    if (index < 0) {
      return;
    }
    this.pending.splice(index, 1);
    window.clearTimeout(entry.timeoutId);
    this.readBuffer = '';
    this.emit({ type: 'desync', message: reason });
    entry.reject(new Error(reason));
    this.noteTimeout();
  }

  private noteTimeout(): void {
    if (!this.live) {
      return;
    }
    this.consecutiveTimeouts += 1;
    if (this.consecutiveTimeouts >= WATCHDOG_FAILURES) {
      this.consecutiveTimeouts = 0;
      this.emit({ type: 'link-dead', message: 'Watchdog: board stopped answering' });
      void this.teardown({ emitDisconnected: true });
    }
  }

  private flushPendingQueue(reason: string): void {
    for (const pending of this.pending) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
    this.pending = [];
    this.readBuffer = '';
  }

  private emit(event: SerialEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const serialService = new SerialService();
