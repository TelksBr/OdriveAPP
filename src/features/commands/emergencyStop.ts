export type SerialCommand = (
  command: string,
  expectReply?: boolean,
  timeoutMs?: number,
  log?: boolean,
) => Promise<string>;

/** Write IDLE, then confirm the axis is actually idle before reporting success. */
export async function requestAndConfirmIdle(sendCommand: SerialCommand): Promise<void> {
  await sendCommand('w axis0.requested_state 1', false, 2000, false);
  const reply = await sendCommand('r axis0.current_state', true, 2000, false);
  const value = reply.trim().replace(/^\[|\]$/g, '').split(/[|\s]/).filter(Boolean).at(-1);
  if (value !== '1') {
    throw new Error(`Motor did not enter IDLE (current_state=${value ?? (reply.trim() || 'unknown')})`);
  }
}

/** Run both independent stop paths and report every failed path to the caller. */
export async function runEmergencyStop(actions: {
  requestIdle: () => Promise<void>;
  stopFfb: () => Promise<void>;
}): Promise<void> {
  const results = await Promise.allSettled([actions.requestIdle(), actions.stopFfb()]);
  const errors = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const action = index === 0 ? 'Motor IDLE' : 'HID FFB stop';
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return [`${action}: ${message}`];
  });
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}
