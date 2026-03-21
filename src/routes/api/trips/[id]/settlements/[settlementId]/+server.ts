import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { deleteSettlement } from '$lib/server/settlements-service.js';
import { canAccessTrip } from '$lib/server/collaborators.js';

export const DELETE: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	const { canAccess } = canAccessTrip(params.id, userId);
	if (!canAccess) throw error(404, 'Not found');
	const success = deleteSettlement(params.settlementId, params.id);
	if (!success) throw error(404, 'Settlement not found');
	return json({ success: true });
};
