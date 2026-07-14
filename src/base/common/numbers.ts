export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function rot(index: number, modulo: number): number {
  return (modulo + (index % modulo)) % modulo;
}
