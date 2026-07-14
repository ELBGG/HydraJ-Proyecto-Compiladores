export function localize(_key: string | number, message: string, ...args: unknown[]): string {
  return format(message, args);
}

/**
 * Substitutes `{n}` placeholders in `message` with `String(args[n])`.
 * An out-of-range index (e.g. `{2}` with only two args) is left as-is
 * rather than throwing.
 */
function format(message: string, args: unknown[]): string {
  return message.replace(/\{(\d+)\}/g, (match, index: string) => {
    const i = Number(index);
    return i < args.length ? String(args[i]) : match;
  });
}
