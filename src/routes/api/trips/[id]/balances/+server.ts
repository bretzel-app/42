import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { canAccessTrip } from '$lib/server/collaborators.js';
import { getTrip } from '$lib/server/trips-service.js';
import { getBalances } from '$lib/server/settlements-service.js';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	const { canAccess } = canAccessTrip(params.id, userId);
	if (!canAccess) throw error(404, 'Not found');

	const trip = getTrip(params.id, userId);
	if (trip?.splitExpenses === false) {
		return json({ balances: [], transfers: [], members: [] });
	}

	return json(getBalances(params.id));
};
