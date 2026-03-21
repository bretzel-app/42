import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { getMember, updateMember, deleteMember } from '$lib/server/members-service.js';
import { canAccessTrip } from '$lib/server/collaborators.js';

export const PATCH: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);
	const { canAccess } = canAccessTrip(params.id, userId);
	if (!canAccess) throw error(404, 'Not found');
	const data = await request.json();
	const member = updateMember(params.memberId, data, userId);
	if (!member) throw error(404, 'Member not found');
	return json(member);
};

export const DELETE: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	const { canAccess } = canAccessTrip(params.id, userId);
	if (!canAccess) throw error(404, 'Not found');
	const member = getMember(params.memberId);
	if (!member) throw error(404, 'Member not found');

	const success = deleteMember(params.memberId, params.id);
	if (!success) throw error(400, 'Cannot delete this member');
	return json({ success: true });
};
