import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

// Regression: expense dates were being shifted by a day when the user's
// timezone was east of UTC. The create form saved a Date at local midnight
// (`fromDateInput`) but the edit form read the UTC calendar date
// (`toDateInput` via `toISOString`), so the picker re-opened on the previous
// day. Both helpers must use local-calendar semantics.
describe('toDateInput / fromDateInput round-trip (timezone-sensitive)', () => {
	const originalTZ = process.env.TZ;

	// `process.env.X = undefined` stringifies to `'undefined'`, which would
	// pin every subsequent test to an invalid timezone. Delete when unset.
	function restoreTZ() {
		if (originalTZ === undefined) delete process.env.TZ;
		else process.env.TZ = originalTZ;
	}

	describe('in UTC+05:00 (east of UTC)', () => {
		beforeAll(() => {
			process.env.TZ = 'Asia/Karachi';
		});
		afterAll(restoreTZ);

		it('preserves the picked date across a round-trip', () => {
			expect(toDateInput(fromDateInput('2026-04-22'))).toBe('2026-04-22');
		});

		it('returns the local calendar date, not the UTC date', () => {
			// Local midnight Apr 22 in UTC+5 is Apr 21 19:00 UTC.
			// `toDateInput` must still report Apr 22.
			const localMidnight = new Date(2026, 3, 22, 0, 0, 0);
			expect(toDateInput(localMidnight)).toBe('2026-04-22');
		});
	});

	describe('in UTC-05:00 (west of UTC)', () => {
		beforeAll(() => {
			process.env.TZ = 'America/New_York';
		});
		afterAll(restoreTZ);

		it('preserves the picked date across a round-trip', () => {
			expect(toDateInput(fromDateInput('2026-04-22'))).toBe('2026-04-22');
		});

		it('returns the local calendar date for a late-night local time', () => {
			// Local 23:30 Apr 22 in UTC-5 is 04:30 UTC Apr 23.
			const localLateNight = new Date(2026, 3, 22, 23, 30, 0);
			expect(toDateInput(localLateNight)).toBe('2026-04-22');
		});
	});
});
