/**
 * Sanitize latitude/longitude for persistence.
 *
 * Returns `{ latitude: null, longitude: null }` whenever either coordinate is
 * missing, nullish, non-numeric, or out of range — so optional location capture
 * stays genuinely optional. Without an explicit null-guard, `Number(null)` is
 * `0`, which is a valid coordinate (Null Island), and absent locations would
 * silently persist as (0, 0).
 */
export function sanitizeCoords(
	lat: unknown,
	lng: unknown
): { latitude: number | null; longitude: number | null } {
	if (lat == null || lng == null) {
		return { latitude: null, longitude: null };
	}
	const latNum = typeof lat === 'number' ? lat : Number(lat);
	const lngNum = typeof lng === 'number' ? lng : Number(lng);
	if (
		Number.isFinite(latNum) &&
		Number.isFinite(lngNum) &&
		latNum >= -90 &&
		latNum <= 90 &&
		lngNum >= -180 &&
		lngNum <= 180
	) {
		return { latitude: latNum, longitude: lngNum };
	}
	return { latitude: null, longitude: null };
}

/**
 * Parse a single-field "lat,lng" coordinate string (e.g. "38.141677,13.082805")
 * into two numbers. Tolerates whitespace and accepts either a comma or a
 * semicolon as separator — matches the format users copy from Google Maps,
 * Apple Maps, or OpenStreetMap URLs.
 *
 * Returns `null` if the input is not a well-formed pair of finite numbers.
 * Range validation is intentionally left to `sanitizeCoords` so both paths
 * (geolocation capture and manual entry) share one source of truth.
 */
export function parseLatLng(input: unknown): { lat: number; lng: number } | null {
	if (typeof input !== 'string') return null;
	const trimmed = input.trim();
	if (!trimmed) return null;
	const parts = trimmed.split(/[,;]/).map((p) => p.trim());
	if (parts.length !== 2) return null;
	const [latStr, lngStr] = parts;
	if (!latStr || !lngStr) return null;
	const lat = Number(latStr);
	const lng = Number(lngStr);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return { lat, lng };
}
