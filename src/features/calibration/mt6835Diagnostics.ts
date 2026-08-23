import { executeOpenFFBoard } from '../board/BoardProtocol';

export interface Mt6835Status {
  boot: number;
  hyst0: number;
  overspeed: number;
  weakfield: number;
  undervolt: number;
  cal: string;
  raw: string;
}

function parseKeyValues(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(/\s+/)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    out[part.slice(0, eq).toLowerCase()] = part.slice(eq + 1);
  }
  return out;
}

export async function fetchMt6835Status(): Promise<Mt6835Status | null> {
  const raw = await executeOpenFFBoard('sys.mtstatus');
  if (!raw || raw.includes('N/A') || raw.includes('FAIL')) {
    return null;
  }
  const kv = parseKeyValues(raw);
  return {
    boot: Number(kv.boot) || 0,
    hyst0: Number(kv.hyst0) || 0,
    overspeed: Number(kv.overspeed) || 0,
    weakfield: Number(kv.weakfield) || 0,
    undervolt: Number(kv.undervolt) || 0,
    cal: kv.cal ?? 'unknown',
    raw,
  };
}

export async function setMt6835Zero(): Promise<string> {
  return executeOpenFFBoard('sys.mtzero');
}

export async function burnMt6835Eeprom(): Promise<string> {
  return executeOpenFFBoard('sys.mteeprom');
}

export async function readMt6835Register(addrHex: string): Promise<string> {
  return executeOpenFFBoard(`sys.mtread=${addrHex}`);
}

export async function writeMt6835Register(addrHex: string, valHex: string): Promise<string> {
  return executeOpenFFBoard(`sys.mtwrite=${addrHex} ${valHex}`);
}
