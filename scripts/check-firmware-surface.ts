import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { boardCommands } from '../src/domain/commands/commandRegistry.ts';
import {
  catalogPathToFirmwareKey,
  FIRMWARE_ACTION_COMMANDS,
  FIRMWARE_ALIAS_COMMANDS,
  FIRMWARE_GPIO_INSTANCES,
  FIRMWARE_OPENFFBOARD_COMMANDS,
  FIRMWARE_STUB_COMMANDS,
  firmwareKey,
  parseCmdTableSource,
  type FirmwareCommand,
} from '../src/domain/firmwareSurface.ts';
import { gpioIsAnalog } from '../src/domain/gpioPinout.ts';
import { flatFields } from '../src/features/config/fieldCatalog.ts';

function firmwareKeys(list: FirmwareCommand[]): Set<string> {
  return new Set(list.map((item) => firmwareKey(item.cls, item.cmd)));
}

function findCmdTablePath(): string | null {
  const env = process.env.ODRIVE_WHEEL_FIRMWARE;
  const candidates = [
    env,
    resolve(process.cwd(), '../ODrive-Wheel-Forge/Odrive-Wheel/src/cmd_table.cpp'),
    resolve('C:/Users/Telks/Desktop/Repo/ODrive-Wheel-Forge/Odrive-Wheel/src/cmd_table.cpp'),
    resolve(process.cwd(), '../../Odrive-Wheel/Odrive-Wheel/src/cmd_table.cpp'),
    resolve(process.cwd(), '../Odrive-Wheel/Odrive-Wheel/src/cmd_table.cpp'),
    resolve('C:/Users/Telks/Desktop/Odrive-Wheel/Odrive-Wheel/src/cmd_table.cpp'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const snapshotKeys = firmwareKeys(FIRMWARE_OPENFFBOARD_COMMANDS);
const errors: string[] = [];

const cmdTablePath = findCmdTablePath();
if (cmdTablePath) {
  const parsed = parseCmdTableSource(readFileSync(cmdTablePath, 'utf8'));
  const parsedKeys = firmwareKeys(parsed);
  for (const key of parsedKeys) {
    if (!snapshotKeys.has(key)) {
      errors.push(`Snapshot missing firmware command ${key} (from ${cmdTablePath})`);
    }
  }
  for (const key of snapshotKeys) {
    if (!parsedKeys.has(key)) {
      errors.push(`Snapshot has ${key} but cmd_table.cpp does not`);
    }
  }
} else {
  console.warn('cmd_table.cpp not found — checking catalog against committed snapshot only');
}

const catalogOffb = flatFields.filter((field) => field.protocol === 'openffboard');
const catalogFirmwareKeys = new Set<string>();
const gpioInstances = new Set<number>();

for (const field of catalogOffb) {
  const key = catalogPathToFirmwareKey(field.path);
  if (!key) {
    errors.push(`Cannot map catalog path ${field.path} to firmware class.cmd`);
    continue;
  }
  catalogFirmwareKeys.add(key);
  if (!snapshotKeys.has(key)) {
    errors.push(`Catalog field ${field.path} is not in firmware snapshot (${key})`);
  }
  if (field.path.startsWith('gpio.')) {
    const inst = Number(field.path.split('.')[1]);
    if (Number.isFinite(inst)) {
      gpioInstances.add(inst);
    }
  }
}

for (const inst of FIRMWARE_GPIO_INSTANCES) {
  if (!gpioInstances.has(inst)) {
    errors.push(`Catalog is missing GPIO instance ${inst}`);
  }
}

for (const inst of gpioInstances) {
  if (!(FIRMWARE_GPIO_INSTANCES as readonly number[]).includes(inst)) {
    errors.push(`Catalog has GPIO instance ${inst} which firmware does not expose`);
  }
}

if (gpioInstances.has(6)) {
  const analogOn6 = catalogOffb.some(
    (field) => field.path.startsWith('gpio.6.') && /amin|amax|filt$/.test(field.path),
  );
  if (analogOn6) {
    errors.push('GPIO 6 is digital-only (PB2) — do not catalog amin/amax/filt');
  }
}

const registryKeys = new Set<string>();
for (const command of boardCommands) {
  const trimmed = command.command.trim();
  const offb = trimmed.match(/^([a-z]+)\.([a-z0-9]+)[!?]?$/i);
  if (offb) {
    registryKeys.add(firmwareKey(offb[1]!.toLowerCase(), offb[2]!));
  }
}

for (const item of FIRMWARE_OPENFFBOARD_COMMANDS) {
  const key = firmwareKey(item.cls, item.cmd);
  if (FIRMWARE_STUB_COMMANDS.has(key) || FIRMWARE_ALIAS_COMMANDS.has(key)) {
    continue;
  }
  if (item.cls === 'gpio') {
    const covered = [...gpioInstances].some((inst) => {
      if (item.cmd === 'amin' || item.cmd === 'amax' || item.cmd === 'filt') {
        return gpioIsAnalog(inst) && catalogFirmwareKeys.has(key);
      }
      return catalogFirmwareKeys.has(key);
    });
    if (!covered) {
      errors.push(`Firmware gpio.${item.cmd} is not in the catalog`);
    }
    continue;
  }
  if (FIRMWARE_ACTION_COMMANDS.has(key)) {
    if (!registryKeys.has(key) && !catalogFirmwareKeys.has(key)) {
      errors.push(`Firmware action ${key} is not in commandRegistry or catalog`);
    }
    continue;
  }
  if (!catalogFirmwareKeys.has(key) && !registryKeys.has(key)) {
    errors.push(`Firmware command ${key} is not in catalog or commandRegistry`);
  }
}

if (errors.length > 0) {
  console.error(`Firmware surface check failed (${errors.length}):`);
  for (const error of errors.slice(0, 60)) {
    console.error(`  ${error}`);
  }
  process.exit(1);
}

console.log(
  `firmware surface ok — ${FIRMWARE_OPENFFBOARD_COMMANDS.length} snapshot cmds, ${catalogOffb.length} OpenFFBoard fields, GPIO ${[...gpioInstances].join(',')}`,
);
