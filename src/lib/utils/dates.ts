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
 * Format date to YYYY-MM-DD for input[type="date"]
 */
export function toDateInput(date: Date): string {
	const d = new Date(date);
	return d.toISOString().split('T')[0];
}

/**
 * Parse YYYY-MM-DD string to Date
 */
export function fromDateInput(value: string): Date {
	return new Date(value + 'T00:00:00');
}
