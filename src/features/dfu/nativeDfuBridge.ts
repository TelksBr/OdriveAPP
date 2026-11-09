import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isDesktopApp } from '../serial/nativeSerialBridge';

export interface NativeDfuDeviceInfo {
  name: string;
  serial_number?: string;
  port: string;
  programmer_found: boolean;
}

export interface DfuProgressPayload {
  message: string;
  progress?: number;
}

export async function nativeDetectDfuDevice(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  try {
    const info = await invoke<NativeDfuDeviceInfo | null>('detect_dfu_device');
    if (info) {
      return info.name || 'STM32 BOOTLOADER';
    }
  } catch (err) {
    console.error('Failed to detect DFU device natively:', err);
  }
  return null;
}

export async function nativeFlashFirmware(
  binary: ArrayBuffer,
  onProgress: (message: string, progress?: number) => void
): Promise<string> {
  if (!isDesktopApp()) {
    throw new Error('Native DFU flasher is only available in Desktop App');
  }

  let unlistenFn: (() => void) | null = null;
  try {
    unlistenFn = await listen<DfuProgressPayload>('dfu-progress', (event) => {
      onProgress(event.payload.message, event.payload.progress);
    });
  } catch {
    // Event listener registration failure (fallback to completion)
  }

  try {
    const bytes = Array.from(new Uint8Array(binary));
    const result = await invoke<string>('flash_firmware', { binaryBytes: bytes });
    return result;
  } finally {
    if (unlistenFn) {
      unlistenFn();
    }
  }
}

