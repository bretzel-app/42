import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { listMembers, createMember } from '$lib/server/members-service.js';
import { canAccessTrip } from '$lib/server/collaborators.js';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	return json(listMembers(params.id, userId));
};

export const POST: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);
	const { canAccess } = canAccessTrip(params.id, userId);
	if (!canAccess) throw error(404, 'Not found');

	const data = await request.json();

	if (!data.name || !data.name.trim()) {
		throw error(400, 'Name is required');
	}

	const member = createMember(
		{ tripId: params.id, name: data.name.trim(), userId: data.userId ?? null },
		userId
	);
	return json(member, { status: 201 });
};
