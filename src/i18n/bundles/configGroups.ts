import type { Locale } from '../messages';

const groupMeta: Record<string, Record<Locale, { title: string; description: string }>> = {
  psu: {
    pt: { title: 'PSU / Freio', description: 'Limites de alimentação, resistor de freio e divisor VBUS (sys.vbusdiv).' },
    en: { title: 'PSU / Brake', description: 'Power supply limits, brake resistor, and VBUS divider (sys.vbusdiv).' },
    es: { title: 'PSU / Freno', description: 'Límites de alimentación, resistencia de freno y divisor VBUS (sys.vbusdiv).' },
  },
  axis: {
    pt: { title: 'Eixo 0', description: 'Estado atual vs. solicitado, boot e closed loop.' },
    en: { title: 'Axis 0', description: 'Current vs. requested state, startup, and closed-loop defaults.' },
    es: { title: 'Eje 0', description: 'Estado actual vs. solicitado, inicio y valores por defecto en lazo cerrado.' },
  },
  motor: {
    pt: { title: 'Motor', description: 'Calibração, constante de torque e limites de corrente.' },
    en: { title: 'Motor', description: 'Motor calibration, torque constant, and current limits.' },
    es: { title: 'Motor', description: 'Calibración del motor, constante de par y límites de corriente.' },
  },
  encoder: {
    pt: { title: 'Encoder', description: 'Modo, CPR, direção e flags de calibração.' },
    en: { title: 'Encoder', description: 'Encoder mode, CPR, direction, and calibration flags.' },
    es: { title: 'Encoder', description: 'Modo de encoder, CPR, dirección y banderas de calibración.' },
  },
  controller: {
    pt: { title: 'Controlador', description: 'Modo de controle e parâmetros de torque para FFB.' },
    en: { title: 'Controller', description: 'Controller mode and torque-mode parameters for FFB operation.' },
    es: { title: 'Controlador', description: 'Modo de control y parámetros de modo par para operación FFB.' },
  },
  'motor-thermistor': {
    pt: { title: 'Termistor motor', description: 'Monitoramento NTC offboard e coeficientes do polinômio.' },
    en: { title: 'Motor thermistor', description: 'Offboard NTC monitoring and polynomial coefficients.' },
    es: { title: 'Termistor del motor', description: 'Monitoreo NTC externo y coeficientes polinómicos.' },
  },
  'fet-thermistor': {
    pt: { title: 'Termistor FET', description: 'Limites de temperatura onboard do gate driver / MOSFETs.' },
    en: { title: 'FET thermistor', description: 'Onboard gate driver / MOSFET temperature limits.' },
    es: { title: 'Termistor FET', description: 'Límites de temperatura integrados del driver / MOSFETs.' },
  },
  'ffb-wheel': {
    pt: { title: 'Volante FFB', description: 'Parâmetros FFB do volante persistidos com sys.save! (EEPROM S1+S2).' },
    en: { title: 'FFB Wheel', description: 'Wheel FFB parameters persisted by sys.save! (EEPROM S1+S2).' },
    es: { title: 'Volante FFB', description: 'Parámetros FFB del volante guardados con sys.save! (EEPROM S1+S2).' },
  },
  'ffb-effects': {
    pt: { title: 'Efeitos FFB', description: 'Ganhos master e por efeito do EffectsCalculator.' },
    en: { title: 'FFB Effects', description: 'Master and per-effect gains from the EffectsCalculator.' },
    es: { title: 'Efectos FFB', description: 'Ganancias general y por efecto del EffectsCalculator.' },
  },
  'ffb-filters': {
    pt: { title: 'Filtros FFB', description: 'Parâmetros de filtro passa-baixa biquad por tipo de efeito.' },
    en: { title: 'FFB Filters', description: 'Biquad low-pass filter parameters exposed by EffectsCalculator.' },
    es: { title: 'Filtros FFB', description: 'Parámetros de filtro paso bajo biquad expuestos por EffectsCalculator.' },
  },
  inputs: {
    pt: { title: 'Entradas', description: 'GPIOs configuráveis como botão, eixo analógico ou zerar volante.' },
    en: { title: 'Inputs', description: 'GPIO joystick inputs exposed as buttons, analog axes, or zero-wheel trigger.' },
    es: { title: 'Entradas', description: 'Entradas GPIO expuestas como botones, ejes analógicos o centrado de volante.' },
  },
  system: {
    pt: { title: 'Sistema', description: 'Identidade da placa (versão, hardware, heap). Divisor VBUS está em PSU / Freio.' },
    en: { title: 'System', description: 'Board identity (version, hardware, heap). VBUS divider is under PSU / Brake.' },
    es: { title: 'Sistema', description: 'Identidad de la placa (versión, hardware, heap). El divisor VBUS está en PSU / Freno.' },
  },
  live: {
    pt: { title: 'Telemetria ao vivo', description: 'Valores somente leitura para painéis de observação.' },
    en: { title: 'Live telemetry', description: 'Read-only runtime values for observe panels.' },
    es: { title: 'Telemetría en vivo', description: 'Valores de solo lectura en tiempo real para paneles de observación.' },
  },
};

export function translateGroupTitle(locale: Locale, groupId: string, fallback: string): string {
  return groupMeta[groupId]?.[locale]?.title ?? fallback;
}

export function translateGroupDescription(locale: Locale, groupId: string, fallback: string): string {
  return groupMeta[groupId]?.[locale]?.description ?? fallback;
}
