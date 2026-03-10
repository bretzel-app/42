/**
 * Format a number with locale-aware separators.
 */
export function formatNumber(value: number, decimals: number = 0): string {
	return new Intl.NumberFormat(undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	}).format(value);
}

/**
 * Format a percentage (e.g., 0.75 -> "75%")
 */
export function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}
