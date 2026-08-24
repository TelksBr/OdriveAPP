export interface NtcThermistorPreset {
  id: 'ntc10k' | 'ntc100k';
  labelKey: 'inputsThermistorNtc10k' | 'inputsThermistorNtc100k';
  poly0: string;
  poly1: string;
  poly2: string;
  poly3: string;
  tempLimitLower: string;
  tempLimitUpper: string;
}

export const NTC_10K_PRESET: NtcThermistorPreset = {
  id: 'ntc10k',
  labelKey: 'inputsThermistorNtc10k',
  poly0: '363.939',
  poly1: '-462.154',
  poly2: '307.551',
  poly3: '-27.726',
  tempLimitLower: '80.0',
  tempLimitUpper: '100.0',
};

export const NTC_100K_PRESET: NtcThermistorPreset = {
  id: 'ntc100k',
  labelKey: 'inputsThermistorNtc100k',
  poly0: '662.839',
  poly1: '-841.532',
  poly2: '560.103',
  poly3: '-50.493',
  tempLimitLower: '80.0',
  tempLimitUpper: '100.0',
};

export const NTC_PRESETS = [NTC_10K_PRESET, NTC_100K_PRESET] as const;
