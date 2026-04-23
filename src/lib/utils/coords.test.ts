import { describe, it, expect } from 'vitest';
import { sanitizeCoords, parseLatLng } from './coords.js';

describe('sanitizeCoords', () => {
	it('returns valid numeric coordinates unchanged', () => {
		expect(sanitizeCoords(48.8566, 2.3522)).toEqual({ latitude: 48.8566, longitude: 2.3522 });
	});

	// Regression: when the user did not capture a location, the form sent
	// `{ latitude: null, longitude: null }`. The old implementation did
	// `Number(null) === 0`, which passed the bounds check, so every expense
	// silently persisted (0, 0) — Null Island.
	it('returns null for both coordinates when either is null', () => {
		expect(sanitizeCoords(null, null)).toEqual({ latitude: null, longitude: null });
		expect(sanitizeCoords(null, 2.35)).toEqual({ latitude: null, longitude: null });
		expect(sanitizeCoords(48.86, null)).toEqual({ latitude: null, longitude: null });
	});

	// Regression: clearing the location in the edit form sends nulls in the
	// PATCH body; the sanitizer must not coerce those back to (0, 0).
	it('returns null when coordinates are undefined', () => {
		expect(sanitizeCoords(undefined, undefined)).toEqual({
			latitude: null,
			longitude: null
		});
	});

	it('returns null for out-of-range coordinates', () => {
		expect(sanitizeCoords(95, 0)).toEqual({ latitude: null, longitude: null });
		expect(sanitizeCoords(0, 200)).toEqual({ latitude: null, longitude: null });
	});

	it('returns null for non-numeric strings', () => {
		expect(sanitizeCoords('abc', 'def')).toEqual({ latitude: null, longitude: null });
	});

	it('parses numeric strings (JSON round-trip safety)', () => {
		expect(sanitizeCoords('48.8566', '2.3522')).toEqual({
			latitude: 48.8566,
			longitude: 2.3522
		});
	});

	it('accepts (0, 0) when explicitly provided as numbers', () => {
		// Null Island is a legitimate coordinate when deliberately selected.
		expect(sanitizeCoords(0, 0)).toEqual({ latitude: 0, longitude: 0 });
	});
});

describe('parseLatLng', () => {
	it('parses a standard "lat,lng" string', () => {
		expect(parseLatLng('38.141677,13.082805')).toEqual({ lat: 38.141677, lng: 13.082805 });
	});

	it('tolerates whitespace around the numbers and separator', () => {
		expect(parseLatLng('  48.8566 , 2.3522  ')).toEqual({ lat: 48.8566, lng: 2.3522 });
	});

	it('accepts a semicolon separator', () => {
		expect(parseLatLng('48.8566; 2.3522')).toEqual({ lat: 48.8566, lng: 2.3522 });
	});

	it('accepts negative coordinates', () => {
		expect(parseLatLng('-33.8688,-151.2093')).toEqual({ lat: -33.8688, lng: -151.2093 });
	});

	it('returns null for empty or whitespace-only input', () => {
		expect(parseLatLng('')).toBeNull();
		expect(parseLatLng('   ')).toBeNull();
	});

	it('returns null when the separator is missing', () => {
		expect(parseLatLng('38.141677')).toBeNull();
	});

	it('returns null when more than two values are supplied', () => {
		expect(parseLatLng('38.14,13.08,0')).toBeNull();
	});

	it('returns null when either side is non-numeric', () => {
		expect(parseLatLng('abc,13.08')).toBeNull();
		expect(parseLatLng('38.14,xyz')).toBeNull();
	});

	it('returns null when either side is empty', () => {
		expect(parseLatLng(',13.08')).toBeNull();
		expect(parseLatLng('38.14,')).toBeNull();
	});

	it('returns null for non-string input', () => {
		expect(parseLatLng(null)).toBeNull();
		expect(parseLatLng(undefined)).toBeNull();
		expect(parseLatLng(42)).toBeNull();
	});
});
