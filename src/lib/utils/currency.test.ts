import { describe, it, expect } from 'vitest';
import { formatAmount, parseToCents, convertToHomeCurrency } from './currency.js';

describe('formatAmount', () => {
	it('formats cents to two-decimal string', () => {
		expect(formatAmount(4750)).toBe('47.50');
		expect(formatAmount(100)).toBe('1.00');
		expect(formatAmount(0)).toBe('0.00');
		expect(formatAmount(99)).toBe('0.99');
	});
});

describe('parseToCents', () => {
	it('parses standard decimal input', () => {
		expect(parseToCents('47.50')).toBe(4750);
		expect(parseToCents('1')).toBe(100);
		expect(parseToCents('0.99')).toBe(99);
	});

	it('handles comma as decimal separator', () => {
		expect(parseToCents('47,50')).toBe(4750);
	});

	it('strips non-numeric characters', () => {
		expect(parseToCents('$47.50')).toBe(4750);
		expect(parseToCents('EUR 100')).toBe(10000);
	});

	it('returns 0 for invalid input', () => {
		expect(parseToCents('')).toBe(0);
		expect(parseToCents('abc')).toBe(0);
	});
});

describe('convertToHomeCurrency', () => {
	it('converts using exchange rate', () => {
		// 100 USD * 1.08 rate = 108 EUR
		expect(convertToHomeCurrency(10000, '1.08')).toBe(10800);
	});

	it('returns original amount for rate of 1', () => {
		expect(convertToHomeCurrency(5000, '1')).toBe(5000);
	});

	it('returns original amount for invalid rate', () => {
		expect(convertToHomeCurrency(5000, 'invalid')).toBe(5000);
		expect(convertToHomeCurrency(5000, '0')).toBe(5000);
		expect(convertToHomeCurrency(5000, '-1')).toBe(5000);
	});

	it('rounds to nearest cent', () => {
		expect(convertToHomeCurrency(333, '1.5')).toBe(500); // 333 * 1.5 = 499.5 -> 500
	});
});
