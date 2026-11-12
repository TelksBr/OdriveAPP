const ODRIVE_ERROR_REPLY = /^(not implemented|invalid property|error|err(?:_|$))/i;

export function isOdriveErrorReply(reply: string): boolean {
  const token = reply.trim();
  const wrapped = token.match(/^\[[^|]*\|([\s\S]*)\]$/);
  const value = (wrapped?.[1] ?? token).trim();
  return ODRIVE_ERROR_REPLY.test(value);
}
