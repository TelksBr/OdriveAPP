import { GPIO_CHANNELS, gpioIsAnalog, type GpioChannelId } from '../../domain/gpioPinout';
import { getFieldByPath, type ConfigField } from '../config/fieldCatalog';
import { translate, type Locale } from '../../i18n/messages';

export { GPIO_CHANNELS, gpioIsAnalog };
export type { GpioChannelId };

export type ChannelFieldKey = 'mode' | 'idx' | 'invert' | 'amin' | 'amax' | 'cur' | 'filt';

export interface GpioChannel {
  gpio: GpioChannelId;
  fields: {
    mode: ConfigField;
    idx: ConfigField;
    invert: ConfigField;
    cur: ConfigField;
    amin?: ConfigField;
    amax?: ConfigField;
    filt?: ConfigField;
  };
}

export function createGpioChannel(gpio: GpioChannelId): GpioChannel {
  return {
    gpio,
    fields: {
      mode: findGpioField(gpio, 'mode'),
      idx: findGpioField(gpio, 'idx'),
      invert: findGpioField(gpio, 'invert'),
      cur: findGpioField(gpio, 'cur'),
      amin: findOptionalGpioField(gpio, 'amin'),
      amax: findOptionalGpioField(gpio, 'amax'),
      filt: findOptionalGpioField(gpio, 'filt'),
    },
  };
}

export function findGpioField(gpio: GpioChannelId, name: ChannelFieldKey): ConfigField {
  const field = getFieldByPath(`gpio.${gpio}.${name}`);
  if (!field) {
    throw new Error(`Missing GPIO field gpio.${gpio}.${name}`);
  }
  return field;
}

function findOptionalGpioField(gpio: GpioChannelId, name: ChannelFieldKey): ConfigField | undefined {
  return getFieldByPath(`gpio.${gpio}.${name}`);
}

export const GPIO_WRITABLE_FIELDS: ChannelFieldKey[] = ['mode', 'idx', 'invert', 'amin', 'amax'];

export function writableChannelFields(channel: GpioChannel): ConfigField[] {
  return GPIO_WRITABLE_FIELDS.flatMap((key) => {
    const field = channel.fields[key];
    return field ? [field] : [];
  });
}

export function channelFields(channel: GpioChannel): ConfigField[] {
  return Object.values(channel.fields).filter((field): field is ConfigField => Boolean(field));
}

export function channelValue(
  channel: GpioChannel,
  key: ChannelFieldKey,
  values: Record<string, string>,
): string {
  const field = channel.fields[key];
  if (!field) {
    return '';
  }
  return values[field.path] ?? '';
}

export function parseChannelNumber(value: string): number | undefined {
  if (value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function channelModeLabel(locale: Locale, mode: string): string {
  if (mode === 'thermistor') return translate(locale, 'inputModeThermistor');
  if (mode === '1') return translate(locale, 'inputModeButton');
  if (mode === '2') return translate(locale, 'inputModeAnalog');
  if (mode === '3') return translate(locale, 'inputModeZero');
  return translate(locale, 'inputModeDisabled');
}

const HID_AXIS_KEYS = ['inputHidAxisRx', 'inputHidAxisRy', 'inputHidAxisRz', 'inputHidAxisSlider'] as const;

function hidAxisLabel(locale: Locale, idx: number | null): string | null {
  if (idx === null || idx < 0 || idx > 3) {
    return null;
  }
  return translate(locale, HID_AXIS_KEYS[idx]);
}

/** Human-readable label for a GPIO input on the dashboard (HID axis / button / zero). */
export function gpioInputLabel(
  locale: Locale,
  gpio: number,
  mode: string,
  idx: number | null,
): string {
  const gpioTag = translate(locale, 'dashboardGpioInput', { n: gpio });

  if (mode === '2') {
    const axis = hidAxisLabel(locale, idx);
    return axis ? `${axis} · ${gpioTag}` : gpioTag;
  }
  if (mode === '1' && idx !== null) {
    return `${translate(locale, 'inputButtonIndex', { n: idx })} · ${gpioTag}`;
  }
  if (mode === '3') {
    return `${translate(locale, 'inputModeZero')} · ${gpioTag}`;
  }
  return gpioTag;
}
