import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { requireAdmin } from '$lib/server/api-utils.js';
import { getUser, deleteUser, updateUserRole, resetPassword, revokeAllSessions } from '$lib/server/auth.js';
import { isEmailConfigured, sendPasswordResetEmail, sendRoleChangedEmail } from '$lib/server/email.js';

export const PATCH: RequestHandler = async ({ params, request, url, ...event }) => {
	const admin = requireAdmin(event);
	const userId = parseInt(params.id, 10);
	const body = await request.json();

	const user = getUser(userId);
	if (!user) throw error(404, 'User not found');

	if (body.role !== undefined) {
		if (userId === admin.id && body.role !== 'admin') {
			throw error(400, 'Cannot change your own role');
		}
		updateUserRole(userId, body.role);
		if (isEmailConfigured()) {
			sendRoleChangedEmail(user.email, user.displayName, body.role, url.origin).catch(() => {});
		}
	}

	if (body.newPassword !== undefined) {
		if (body.newPassword.length < 8) {
			throw error(400, 'Password must be at least 8 characters');
		}
		await resetPassword(userId, body.newPassword);
		if (isEmailConfigured()) {
			sendPasswordResetEmail(user.email, user.displayName, url.origin).catch(() => {});
		}
	}

	if (body.revokeSessions) {
		revokeAllSessions(userId);
	}

	const updated = getUser(userId);
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params, ...event }) => {
	const admin = requireAdmin(event);
	const userId = parseInt(params.id, 10);

	if (userId === admin.id) {
		throw error(400, 'Cannot delete your own account');
	}

	const user = getUser(userId);
	if (!user) throw error(404, 'User not found');

	await deleteUser(userId);
	return json({ success: true });
};
