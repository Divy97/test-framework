/**
 * Deterministic half-up rounding to fixed decimals. `Math.round` is stable across
 * platforms, and all eval scores are non-negative, so this never hits the
 * negative-half-up edge case. Keeping scores rounded keeps serialized JSON
 * byte-stable instead of leaking float noise like `0.8200000000000001`.
 */
export function round4(value: number): number {
	return Math.round(value * 10000) / 10000;
}

export function round1(value: number): number {
	return Math.round(value * 10) / 10;
}
