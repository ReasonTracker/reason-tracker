export function resolveNonNegativeFinite(value: number): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`Expected a finite non-negative number: ${value}`);
	}

	return value;
}
