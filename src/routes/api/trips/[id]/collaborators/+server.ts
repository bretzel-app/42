import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId, requireTripAccess } from '$lib/server/api-utils.js';
import { db } from '$lib/server/db/index.js';
import { getUser } from '$lib/server/auth.js';
import {
	fetchCollaborators,
	addCollaborator,
	removeCollaborator,
	canAccessTrip
} from '$lib/server/collaborators.js';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	requireTripAccess(db, params.id, userId);
	return json(fetchCollaborators(params.id));
};

export const POST: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);
	const { trip, isOwner } = requireTripAccess(db, params.id, userId);
	if (!isOwner) throw error(403, 'Only the trip owner can add collaborators');

	const { userId: targetUserId } = await request.json();
	if (!targetUserId) throw error(400, 'userId is required');
	if (targetUserId === userId) throw error(400, 'Cannot add yourself');

	const target = getUser(targetUserId);
	if (!target) throw error(404, 'User not found');

	const { canAccess } = canAccessTrip(params.id, targetUserId);
	if (canAccess) throw error(400, 'User already has access');

	addCollaborator(params.id, targetUserId, userId);
	return json(fetchCollaborators(params.id), { status: 201 });
};

export const DELETE: RequestHandler = async ({ params, url, ...event }) => {
	const userId = getUserId(event);
	const { trip, isOwner } = requireTripAccess(db, params.id, userId);

	const targetParam = url.searchParams.get('userId');
	if (!targetParam) throw error(400, 'userId parameter is required');

	const targetUserId = targetParam === 'self' ? userId : parseInt(targetParam, 10);
	if (isNaN(targetUserId)) throw error(400, 'Invalid userId');

	// Collaborators can only remove themselves
	if (!isOwner && targetUserId !== userId) {
		throw error(403, 'Only the trip owner can remove other collaborators');
	}

	removeCollaborator(params.id, targetUserId);
	return json(fetchCollaborators(params.id));
};
