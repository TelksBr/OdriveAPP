/** Match echoed OpenFFBoard replies and keep plain ODrive replies compatible. */
export function matchesSerialReply(command: string, line: string): boolean {
  const request = command.trim();
  const response = line.trim();
  const openFfBoardCommand = request.includes('.') && /[?!=]$/.test(request);
  const wrapped = response.match(/^\[([^|\]]+)\|/);

  if (openFfBoardCommand) {
    return wrapped?.[1] === request;
  }

  return wrapped === null;
}
