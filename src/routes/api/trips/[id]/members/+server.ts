import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { getUser } from '$lib/server/auth.js';
import { listMembers, createMember } from '$lib/server/members-service.js';
import { canAccessTrip } from '$lib/server/collaborators.js';
import { getTrip } from '$lib/server/trips-service.js';
import { isEmailConfigured, sendTripInvitationEmail } from '$lib/server/email.js';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	return json(listMembers(params.id, userId));
};

export const POST: RequestHandler = async ({ params, request, url, ...event }) => {
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

	// Send trip invitation email if the member is linked to a real user
	if (isEmailConfigured() && data.userId) {
		const targetUser = getUser(data.userId);
		const inviter = getUser(userId);
		const trip = getTrip(params.id, userId);
		if (targetUser?.email && inviter && trip) {
			sendTripInvitationEmail(
				targetUser.email,
				targetUser.displayName,
				inviter.displayName,
				trip.name,
				trip.destination,
				url.origin
			).catch(() => {});
		}
	}

	return json(member, { status: 201 });
};
