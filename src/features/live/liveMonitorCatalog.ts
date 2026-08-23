export type LiveMonitorGroup = 'power' | 'axis' | 'motor' | 'encoder' | 'controller' | 'ffb' | 'system';

export type LiveFieldFormat =
  | 'raw'
  | 'bool'
  | 'axisState'
  | 'voltage'
  | 'voltageMv'
  | 'current'
  | 'tempC'
  | 'turns'
  | 'turnsPerSec'
  | 'radians'
  | 'torque'
  | 'velocity'
  | 'position'
  | 'degrees'
  | 'degPerSec'
  | 'degPerSec2';

export interface LiveMonitorField {
  id: string;
  labelKey: string;
  cmd: string;
  group: LiveMonitorGroup;
  format: LiveFieldFormat;
}

/** Matches odrive-wheel.html Debug tab live monitor + FFB bridge values. */
export const LIVE_MONITOR_FIELDS: LiveMonitorField[] = [
  { id: 'vbus_voltage', labelKey: 'liveFieldVbusVoltage', cmd: 'r vbus_voltage', group: 'power', format: 'voltage' },
  { id: 'ibus', labelKey: 'liveFieldIbus', cmd: 'r ibus', group: 'power', format: 'current' },
  { id: 'ibrake', labelKey: 'liveFieldIBrake', cmd: 'r brake_resistor_current', group: 'power', format: 'current' },

  { id: 'current_state', labelKey: 'liveFieldAxisState', cmd: 'r axis0.current_state', group: 'axis', format: 'axisState' },
  { id: 'requested_state', labelKey: 'liveFieldRequestedState', cmd: 'r axis0.requested_state', group: 'axis', format: 'axisState' },

  { id: 'motor_cal', labelKey: 'liveFieldMotorCalibrated', cmd: 'r axis0.motor.is_calibrated', group: 'motor', format: 'bool' },
  { id: 'motor_armed', labelKey: 'liveFieldMotorArmed', cmd: 'r axis0.motor.is_armed', group: 'motor', format: 'bool' },
  { id: 'iq_meas', labelKey: 'liveFieldIqMeasured', cmd: 'r axis0.motor.current_control.Iq_measured', group: 'motor', format: 'current' },
  { id: 'id_meas', labelKey: 'liveFieldIdMeasured', cmd: 'r axis0.motor.current_control.Id_measured', group: 'motor', format: 'current' },
  { id: 'iq_sp', labelKey: 'liveFieldIqSetpoint', cmd: 'r axis0.motor.current_control.Iq_setpoint', group: 'motor', format: 'current' },
  { id: 'fet_temp', labelKey: 'liveFieldFetTemp', cmd: 'r axis0.motor.fet_thermistor.temperature', group: 'motor', format: 'tempC' },
  { id: 'motor_temp', labelKey: 'liveFieldMotorTemp', cmd: 'r axis0.motor.motor_thermistor.temperature', group: 'motor', format: 'tempC' },

  { id: 'enc_ready', labelKey: 'liveFieldEncoderReady', cmd: 'r axis0.encoder.is_ready', group: 'encoder', format: 'bool' },
  { id: 'enc_index', labelKey: 'liveFieldEncoderIndex', cmd: 'r axis0.encoder.index_found', group: 'encoder', format: 'bool' },
  { id: 'enc_pos', labelKey: 'liveFieldEncoderPos', cmd: 'r axis0.encoder.pos_estimate', group: 'encoder', format: 'turns' },
  { id: 'enc_vel', labelKey: 'liveFieldEncoderVel', cmd: 'r axis0.encoder.vel_estimate', group: 'encoder', format: 'turnsPerSec' },
  { id: 'enc_shadow', labelKey: 'liveFieldEncoderShadow', cmd: 'r axis0.encoder.shadow_count', group: 'encoder', format: 'raw' },
  { id: 'enc_cpr', labelKey: 'liveFieldEncoderCpr', cmd: 'r axis0.encoder.count_in_cpr', group: 'encoder', format: 'raw' },
  { id: 'enc_phase', labelKey: 'liveFieldEncoderPhase', cmd: 'r axis0.encoder.phase', group: 'encoder', format: 'radians' },

  { id: 'ctrl_torque', labelKey: 'liveFieldTorqueSetpoint', cmd: 'r axis0.controller.torque_setpoint', group: 'controller', format: 'torque' },
  { id: 'ctrl_vel', labelKey: 'liveFieldVelSetpoint', cmd: 'r axis0.controller.vel_setpoint', group: 'controller', format: 'velocity' },
  { id: 'ctrl_pos', labelKey: 'liveFieldPosSetpoint', cmd: 'r axis0.controller.pos_setpoint', group: 'controller', format: 'position' },
  { id: 'ctrl_input_torque', labelKey: 'liveFieldInputTorque', cmd: 'r axis0.controller.input_torque', group: 'controller', format: 'torque' },

  { id: 'ffb_pos', labelKey: 'liveFieldWheelPosition', cmd: 'axis.curpos?', group: 'ffb', format: 'degrees' },
  { id: 'ffb_spd', labelKey: 'liveFieldVelocity', cmd: 'axis.curspd?', group: 'ffb', format: 'degPerSec' },
  { id: 'ffb_torque', labelKey: 'liveFieldFfbTorque', cmd: 'axis.curtorque?', group: 'ffb', format: 'raw' },
  { id: 'ffb_maxtorque', labelKey: 'liveFieldMaxTorque', cmd: 'axis.maxtorque?', group: 'ffb', format: 'torque' },
  { id: 'ffb_accel', labelKey: 'liveFieldWheelAccel', cmd: 'axis.curaccel?', group: 'ffb', format: 'degPerSec2' },
  { id: 'ffb_active', labelKey: 'liveFieldFfbActive', cmd: 'main.ffbactive?', group: 'ffb', format: 'bool' },
  { id: 'enc_zhits', labelKey: 'liveFieldZHits', cmd: 'axis.zhits?', group: 'encoder', format: 'raw' },
  { id: 'enc_zglitch', labelKey: 'liveFieldZGlitch', cmd: 'axis.zglitch?', group: 'encoder', format: 'raw' },

  { id: 'sys_fw', labelKey: 'liveFieldFirmware', cmd: 'sys.swver?', group: 'system', format: 'raw' },
  { id: 'sys_hw', labelKey: 'liveFieldHardware', cmd: 'sys.hwtype?', group: 'system', format: 'raw' },
  { id: 'sys_uid', labelKey: 'liveFieldUid', cmd: 'sys.uid?', group: 'system', format: 'raw' },
  { id: 'sys_devid', labelKey: 'liveFieldDevid', cmd: 'sys.devid?', group: 'system', format: 'raw' },
  { id: 'sys_uptime', labelKey: 'liveFieldUptime', cmd: 'sys.uptime?', group: 'system', format: 'raw' },
  { id: 'sys_heap', labelKey: 'liveFieldFreeHeap', cmd: 'sys.heap?', group: 'system', format: 'raw' },
];

export const LIVE_MONITOR_GROUP_ORDER: LiveMonitorGroup[] = [
  'power',
  'axis',
  'motor',
  'encoder',
  'controller',
  'ffb',
  'system',
];

export const DEVICE_INFO_FIELDS = [
  { id: 'hw', labelKey: 'liveDeviceHw', paths: ['hw_version_major', 'hw_version_minor', 'hw_version_variant'] as const },
  { id: 'sn', labelKey: 'liveDeviceSerial', paths: ['serial_number'] as const },
  { id: 'ucl', labelKey: 'liveDeviceConfigLoaded', paths: ['user_config_loaded'] as const },
] as const;

export const DIAG_CMDS = ['d', 'D', 'C', 'T', 'E', 'I', 'R', 'M'] as const;
