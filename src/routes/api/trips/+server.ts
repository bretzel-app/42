import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { listTrips, createTrip } from '$lib/server/trips-service.js';

export const GET: RequestHandler = async (event) => {
	const userId = getUserId(event);
	return json(listTrips(userId));
};

export const POST: RequestHandler = async ({ request, ...event }) => {
	const userId = getUserId(event);
	const data = await request.json();

	if (!data.name) {
		throw error(400, 'Trip name is required');
	}

	const trip = createTrip(data, userId);
	return json(trip, { status: 201 });
};
