import { describe, expect, test } from 'bun:test';
import { requestAndConfirmIdle, runEmergencyStop } from './emergencyStop';

describe('emergency stop', () => {
  test('confirms IDLE only after the current axis state reads 1', async () => {
    const commands: string[] = [];
    await requestAndConfirmIdle(async (command) => {
      commands.push(command);
      return command.startsWith('r ') ? '1\r\n' : '';
    });
    expect(commands).toEqual(['w axis0.requested_state 1', 'r axis0.current_state']);
  });

  test('does not claim IDLE when the motor remains in closed loop', async () => {
    await expect(requestAndConfirmIdle(async (command) => command.startsWith('r ') ? '8' : ''))
      .rejects.toThrow('current_state=8');
  });

  test('attempts HID stop even when the serial stop fails and reports both failures', async () => {
    let hidStopAttempted = false;
    await expect(runEmergencyStop({
      requestIdle: async () => { throw new Error('COM write failed'); },
      stopFfb: async () => { hidStopAttempted = true; throw new Error('HID disconnected'); },
    })).rejects.toThrow('Motor IDLE: COM write failed; HID FFB stop: HID disconnected');
    expect(hidStopAttempted).toBe(true);
  });
});
