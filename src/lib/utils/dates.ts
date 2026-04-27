/**
 * Get trip duration in days (inclusive).
 */
export function tripDurationDays(startDate: Date, endDate: Date): number {
	const start = new Date(startDate);
	const end = new Date(endDate);
	const diffMs = end.getTime() - start.getTime();
	return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Get number of elapsed days from start date to today (or end date if trip is over).
 */
export function elapsedDays(startDate: Date, endDate: Date): number {
	const start = new Date(startDate);
	const end = new Date(endDate);
	const now = new Date();
	const effective = now < end ? now : end;
	const diffMs = effective.getTime() - start.getTime();
	return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Human-friendly trip duration: "1 day", "5 days", "1 week", "3 weeks".
 * Uses weeks only when the day count divides evenly by 7.
 */
export function formatTripDuration(startDate: Date, endDate: Date): string {
	const days = tripDurationDays(startDate, endDate);
	if (days >= 7 && days % 7 === 0) {
		const weeks = days / 7;
		return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
	}
	return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Format a date for display (e.g., "Mar 10, 2026")
 */
export function formatDate(date: Date): string {
	return new Date(date).toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

/**
 * Format a date range (e.g., "Mar 10 - Mar 15, 2026")
 */
export function formatDateRange(startDate: Date, endDate: Date): string {
	const start = new Date(startDate);
	const end = new Date(endDate);
	const sameYear = start.getFullYear() === end.getFullYear();

	const startStr = start.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' })
	});
	const endStr = end.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	return `${startStr} - ${endStr}`;
}

/**
 * Format date to YYYY-MM-DD for input[type="date"] using local calendar
 * components. `toISOString` would shift east-of-UTC dates back a day, and
 * `fromDateInput` already parses in local time — the two must be symmetric.
 */
export function toDateInput(date: Date): string {
	const d = new Date(date);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * Parse YYYY-MM-DD string to Date (local midnight).
 */
export function fromDateInput(value: string): Date {
	return new Date(value + 'T00:00:00');
}
