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
