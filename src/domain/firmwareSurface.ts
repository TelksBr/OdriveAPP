/**
 * Snapshot of Odrive-Wheel OpenFFBoard commands from cmd_table.cpp.
 * CI compares this to fieldCatalog + commandRegistry. Regenerate via
 * `bun scripts/check-firmware-surface.ts` when the firmware table changes.
 */

export interface FirmwareCommand {
  cls: string;
  cmd: string;
}

/** Instances accepted by gpio.N.* (GPIO 5 is invalid on MKS). */
export const FIRMWARE_GPIO_INSTANCES = [1, 2, 3, 4, 6] as const;

/**
 * Stubs / Configurator handshake — do not require a catalog field.
 * sys.temp is always 25; sys.reboot! does not reset (use sr).
 */
export const FIRMWARE_STUB_COMMANDS = new Set([
  'main.id',
  'main.hidrate',
  'main.cfrate',
  'main.hidsendspd',
  'main.errors',
  'main.lsbtn',
  'main.btntypes',
  'main.lsain',
  'main.aintypes',
  'sys.lsmain',
  'sys.lsactive',
  'sys.heapfree',
  'sys.cmdinfo',
  'sys.signature',
  'sys.debug',
  'sys.main',
  'sys.errors',
  'sys.errorsclr',
  'sys.format',
  'sys.flashdump',
  'sys.vext',
  'sys.reboot',
  'sys.mtread',
  'sys.mtwrite',
  'axis.drvtype',
  'axis.enctype',
  'odrv.connected',
  'odrv.canid',
  'odrv.canspd',
  'odrv.maxtorque',
]);

/** Duplicate readouts — catalog already exposes an equivalent path. */
export const FIRMWARE_ALIAS_COMMANDS = new Set([
  'axis.pos',
  'sys.heapfree',
  'sys.vint',
]);

/** EXEC (or GET+EXEC) actions exposed via commandRegistry, not config fields. */
export const FIRMWARE_ACTION_COMMANDS = new Set([
  'axis.zeroenc',
  'axis.anticogcal',
  'sys.save',
  'sys.eetest',
  'sys.eeformat',
  'sys.encraw',
  'sys.magnet',
  'sys.ping',
  'sys.temp',
  'sys.motortemp',
  'sys.mtzero',
  'sys.mteeprom',
  'sys.mtstatus',
  'sys.fxtest',
  'sys.errorsclr',
  'sys.reboot',
  'sys.format',
]);

export const FIRMWARE_OPENFFBOARD_COMMANDS: FirmwareCommand[] = [
  { cls: 'main', cmd: 'id' },
  { cls: 'sys', cmd: 'lsmain' },
  { cls: 'sys', cmd: 'lsactive' },
  { cls: 'sys', cmd: 'heapfree' },
  { cls: 'sys', cmd: 'cmdinfo' },
  { cls: 'sys', cmd: 'temp' },
  { cls: 'sys', cmd: 'motortemp' },
  { cls: 'main', cmd: 'hidrate' },
  { cls: 'main', cmd: 'cfrate' },
  { cls: 'main', cmd: 'ffbactive' },
  { cls: 'main', cmd: 'hidsendspd' },
  { cls: 'main', cmd: 'errors' },
  { cls: 'main', cmd: 'lsbtn' },
  { cls: 'main', cmd: 'btntypes' },
  { cls: 'main', cmd: 'lsain' },
  { cls: 'main', cmd: 'aintypes' },
  { cls: 'fx', cmd: 'spring' },
  { cls: 'fx', cmd: 'damper' },
  { cls: 'fx', cmd: 'friction' },
  { cls: 'fx', cmd: 'inertia' },
  { cls: 'fx', cmd: 'master' },
  { cls: 'fx', cmd: 'filterCfFreq' },
  { cls: 'fx', cmd: 'filterCfQ' },
  { cls: 'fx', cmd: 'filterFrFreq' },
  { cls: 'fx', cmd: 'filterFrQ' },
  { cls: 'fx', cmd: 'filterDaFreq' },
  { cls: 'fx', cmd: 'filterDaQ' },
  { cls: 'fx', cmd: 'filterInFreq' },
  { cls: 'fx', cmd: 'filterInQ' },
  { cls: 'axis', cmd: 'range' },
  { cls: 'axis', cmd: 'maxtorque' },
  { cls: 'axis', cmd: 'fxratio' },
  { cls: 'axis', cmd: 'invert' },
  { cls: 'axis', cmd: 'ffbinvert' },
  { cls: 'axis', cmd: 'drvtype' },
  { cls: 'axis', cmd: 'enctype' },
  { cls: 'axis', cmd: 'pos' },
  { cls: 'axis', cmd: 'idlespring' },
  { cls: 'axis', cmd: 'axisdamper' },
  { cls: 'axis', cmd: 'axisinertia' },
  { cls: 'axis', cmd: 'axisfriction' },
  { cls: 'axis', cmd: 'esgain' },
  { cls: 'axis', cmd: 'esdamp' },
  { cls: 'axis', cmd: 'maxtorquerate' },
  { cls: 'axis', cmd: 'expo' },
  { cls: 'axis', cmd: 'exposcale' },
  { cls: 'axis', cmd: 'zeroenc' },
  { cls: 'axis', cmd: 'zeroofs' },
  { cls: 'axis', cmd: 'zhits' },
  { cls: 'axis', cmd: 'zglitch' },
  { cls: 'axis', cmd: 'gpiofilt' },
  { cls: 'axis', cmd: 'gpiofiltf' },
  { cls: 'axis', cmd: 'gpioautocal' },
  { cls: 'axis', cmd: 'anticogcal' },
  { cls: 'axis', cmd: 'curtorque' },
  { cls: 'axis', cmd: 'curpos' },
  { cls: 'axis', cmd: 'curspd' },
  { cls: 'axis', cmd: 'curaccel' },
  { cls: 'sys', cmd: 'swver' },
  { cls: 'sys', cmd: 'hwtype' },
  { cls: 'sys', cmd: 'uid' },
  { cls: 'sys', cmd: 'signature' },
  { cls: 'sys', cmd: 'debug' },
  { cls: 'sys', cmd: 'main' },
  { cls: 'sys', cmd: 'devid' },
  { cls: 'sys', cmd: 'errors' },
  { cls: 'sys', cmd: 'errorsclr' },
  { cls: 'sys', cmd: 'format' },
  { cls: 'sys', cmd: 'flashdump' },
  { cls: 'sys', cmd: 'vint' },
  { cls: 'sys', cmd: 'vext' },
  { cls: 'sys', cmd: 'heap' },
  { cls: 'sys', cmd: 'save' },
  { cls: 'sys', cmd: 'savestat' },
  { cls: 'sys', cmd: 'eetest' },
  { cls: 'sys', cmd: 'eedump' },
  { cls: 'sys', cmd: 'eeformat' },
  { cls: 'sys', cmd: 'vbusdiv' },
  { cls: 'gpio', cmd: 'mode' },
  { cls: 'gpio', cmd: 'idx' },
  { cls: 'gpio', cmd: 'invert' },
  { cls: 'gpio', cmd: 'amin' },
  { cls: 'gpio', cmd: 'amax' },
  { cls: 'gpio', cmd: 'cur' },
  { cls: 'gpio', cmd: 'filt' },
  { cls: 'sys', cmd: 'reboot' },
  { cls: 'sys', cmd: 'uptime' },
  { cls: 'sys', cmd: 'ping' },
  { cls: 'sys', cmd: 'encraw' },
  { cls: 'sys', cmd: 'magnet' },
  { cls: 'sys', cmd: 'mtread' },
  { cls: 'sys', cmd: 'mtwrite' },
  { cls: 'sys', cmd: 'mtzero' },
  { cls: 'sys', cmd: 'mteeprom' },
  { cls: 'sys', cmd: 'mtstatus' },
  { cls: 'sys', cmd: 'fxtest' },
  { cls: 'odrv', cmd: 'vbus' },
  { cls: 'odrv', cmd: 'connected' },
  { cls: 'odrv', cmd: 'canid' },
  { cls: 'odrv', cmd: 'canspd' },
  { cls: 'odrv', cmd: 'maxtorque' },
];

export function firmwareKey(cls: string, cmd: string): string {
  return `${cls}.${cmd}`;
}

/** Map a catalog path (gpio.1.mode, axis.maxtorque) to class.cmd. */
export function catalogPathToFirmwareKey(path: string): string | null {
  const parts = path.split('.');
  if (parts.length < 2) {
    return null;
  }
  if (parts[0] === 'gpio') {
    if (parts.length < 3) {
      return null;
    }
    return firmwareKey('gpio', parts.slice(2).join('.'));
  }
  return firmwareKey(parts[0]!, parts.slice(1).join('.'));
}

export function parseCmdTableSource(source: string): FirmwareCommand[] {
  const commands: FirmwareCommand[] = [];
  const tableMatch = source.match(/const\s+CmdEntry\s+cmdtable\[\]\s*=\s*\{([\s\S]*?)\};/);
  const target = tableMatch ? tableMatch[1]! : source;
  const re = /\{\s*"(\w+)"\s*,\s*"(\w+)"\s*,/g;
  let match: RegExpExecArray | null = re.exec(target);
  while (match) {
    commands.push({ cls: match[1]!, cmd: match[2]! });
    match = re.exec(target);
  }
  return commands;
}
