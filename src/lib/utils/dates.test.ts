import { describe, it, expect } from 'vitest';
import { tripDurationDays, toDateInput, fromDateInput } from './dates.js';

describe('tripDurationDays', () => {
	it('returns inclusive day count', () => {
		const start = new Date('2025-03-10');
		const end = new Date('2025-03-15');
		expect(tripDurationDays(start, end)).toBe(6); // 10,11,12,13,14,15
	});

	it('returns 1 for same-day trip', () => {
		const date = new Date('2025-03-10');
		expect(tripDurationDays(date, date)).toBe(1);
	});

	it('returns minimum 1 even for invalid range', () => {
		const start = new Date('2025-03-15');
		const end = new Date('2025-03-10');
		expect(tripDurationDays(start, end)).toBe(1);
	});
});

describe('toDateInput', () => {
	it('formats date to YYYY-MM-DD', () => {
		const date = new Date('2025-03-10T12:00:00Z');
		expect(toDateInput(date)).toBe('2025-03-10');
	});
});

describe('fromDateInput', () => {
	it('parses YYYY-MM-DD to Date', () => {
		const date = fromDateInput('2025-03-10');
		expect(date.getFullYear()).toBe(2025);
		expect(date.getMonth()).toBe(2); // 0-indexed
		expect(date.getDate()).toBe(10);
	});
});
