import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { getTrip, updateTrip, deleteTrip } from '$lib/server/trips-service.js';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	const trip = getTrip(params.id, userId);
	if (!trip) throw error(404, 'Trip not found');
	return json(trip);
};

export const PATCH: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);
	const data = await request.json();
	const trip = updateTrip(params.id, data, userId);
	if (!trip) throw error(404, 'Trip not found');
	return json(trip);
};

export const DELETE: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	const success = deleteTrip(params.id, userId);
	if (!success) throw error(404, 'Trip not found');
	return json({ success: true });
};
