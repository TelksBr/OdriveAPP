import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface NativePortDetail {
  name: string;
  vid?: number;
  pid?: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
}

export interface SimGameInfo {
  id: string;
  name: string;
  executable: string;
}

export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    'isTauri' in window ||
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    window.location.hostname === 'tauri.localhost' ||
    window.location.protocol === 'tauri:' ||
    isTauri()
  );
}

export async function nativeListPorts(): Promise<NativePortDetail[]> {
  if (!isDesktopApp()) return [];
  return invoke<NativePortDetail[]>('list_serial_ports');
}

export async function nativeConnectSerial(portName: string, baudRate = 115200): Promise<string> {
  if (!isDesktopApp()) throw new Error('Not running in native desktop mode');
  return invoke<string>('connect_serial', { portName, baudRate });
}

export async function nativeDisconnectSerial(): Promise<void> {
  if (!isDesktopApp()) return;
  return invoke<void>('disconnect_serial');
}

export async function nativeWriteSerial(data: string): Promise<void> {
  if (!isDesktopApp()) throw new Error('Not running in native desktop mode');
  return invoke<void>('write_serial', { data });
}

export async function nativeAutoProbeOdrive(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  return invoke<string | null>('auto_probe_odrive');
}

export async function nativeOnSerialRx(callback: (line: string) => void): Promise<UnlistenFn> {
  if (!isDesktopApp()) return () => undefined;
  return listen<{ line: string }>('serial-rx', (event) => {
    callback(event.payload.line);
  });
}

export async function nativeOnSerialDisconnected(callback: () => void): Promise<UnlistenFn> {
  if (!isDesktopApp()) return () => undefined;
  return listen('serial-disconnected', () => {
    callback();
  });
}

export async function nativeEmergencyStop(): Promise<void> {
  if (!isDesktopApp()) return;
  return invoke<void>('emergency_stop');
}

export async function nativeDetectRunningSim(): Promise<SimGameInfo | null> {
  if (!isDesktopApp()) return null;
  return invoke<SimGameInfo | null>('detect_running_sim');
}

