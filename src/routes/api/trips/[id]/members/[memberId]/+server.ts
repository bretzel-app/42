import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { getMember, updateMember, deleteMember } from '$lib/server/members-service.js';
import { canAccessTrip } from '$lib/server/collaborators.js';

export const PATCH: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);

	if (!canAccessTrip(params.id, userId).canAccess) {
		throw error(403, 'Not authorized to access this trip');
	}

	// Verify member belongs to this trip
	const existing = getMember(params.memberId);
	if (!existing) throw error(404, 'Member not found');
	if (existing.tripId !== params.id) throw error(404, 'Member not found');

	const data = await request.json();
	const member = updateMember(params.memberId, data, userId);
	if (!member) throw error(404, 'Member not found');
	return json(member);
};

export const DELETE: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);

	if (!canAccessTrip(params.id, userId).canAccess) {
		throw error(403, 'Not authorized to access this trip');
	}

	const member = getMember(params.memberId);
	if (!member) throw error(404, 'Member not found');
	if (member.tripId !== params.id) throw error(404, 'Member not found');

	const success = deleteMember(params.memberId, params.id);
	if (!success) throw error(400, 'Cannot delete this member');
	return json({ success: true });
};
