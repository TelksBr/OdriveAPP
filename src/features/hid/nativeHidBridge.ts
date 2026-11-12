import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isDesktopApp } from '../serial/nativeSerialBridge';

export interface NativeHidDeviceDetail {
  path: string;
  vendor_id: number;
  product_id: number;
  manufacturer_string?: string;
  product_string?: string;
  serial_number?: string;
  usage_page: number;
  usage: number;
}

export async function nativeListHidDevices(): Promise<NativeHidDeviceDetail[]> {
  if (!isDesktopApp()) return [];
  return invoke<NativeHidDeviceDetail[]>('list_hid_devices');
}

export async function nativeConnectHid(vid?: number, pid?: number): Promise<string> {
  if (!isDesktopApp()) throw new Error('Not running in native desktop mode');
  return invoke<string>('connect_hid', { vid, pid });
}

export async function nativeDisconnectHid(): Promise<void> {
  if (!isDesktopApp()) return;
  return invoke<void>('disconnect_hid');
}

export async function nativeSendHidReport(reportId: number, data: Uint8Array | number[]): Promise<void> {
  if (!isDesktopApp()) throw new Error('Not running in native desktop mode');
  const bytes = Array.from(data);
  return invoke<void>('send_hid_report', { reportId, data: bytes });
}

export async function nativeOnHidReport(callback: (data: Uint8Array) => void): Promise<UnlistenFn> {
  if (!isDesktopApp()) return () => undefined;
  return listen<{ reports: number[][] }>('hid-input-report', (event) => {
    dispatchNativeHidReportBatch(event.payload.reports, callback);
  });
}

export function dispatchNativeHidReportBatch(
  reports: readonly (readonly number[])[],
  callback: (data: Uint8Array) => void,
): void {
  for (const report of reports) {
    callback(new Uint8Array(report));
  }
}

export async function nativeOnHidDisconnected(callback: () => void): Promise<UnlistenFn> {
  if (!isDesktopApp()) return () => undefined;
  return listen('hid-disconnected', callback);
}

