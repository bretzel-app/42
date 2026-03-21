import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { listSettlements, createSettlement } from '$lib/server/settlements-service.js';
import { canAccessTrip } from '$lib/server/collaborators.js';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	const { canAccess } = canAccessTrip(params.id, userId);
	if (!canAccess) throw error(404, 'Not found');
	return json(listSettlements(params.id));
};

export const POST: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);
	const { canAccess } = canAccessTrip(params.id, userId);
	if (!canAccess) throw error(404, 'Not found');
	const data = await request.json();

	if (!data.fromMemberId) throw error(400, 'fromMemberId is required');
	if (!data.toMemberId) throw error(400, 'toMemberId is required');
	if (data.amount === undefined || data.amount === null) throw error(400, 'amount is required');

	const settlement = createSettlement({
		tripId: params.id,
		fromMemberId: data.fromMemberId,
		toMemberId: data.toMemberId,
		amount: data.amount,
		date: data.date ? new Date(data.date) : undefined,
		note: data.note
	});

	return json(settlement, { status: 201 });
};
