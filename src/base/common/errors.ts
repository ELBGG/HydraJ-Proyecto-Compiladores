export function illegalState(message?: string): Error {
  return new Error(message ? `Illegal state: ${message}` : 'Illegal state');
}

export function illegalArgument(message?: string): Error {
  return new Error(message ? `Illegal argument: ${message}` : 'Illegal argument');
}
