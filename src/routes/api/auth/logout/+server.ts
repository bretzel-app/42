import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { deleteSession } from '$lib/server/auth.js';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('session');
	if (token) {
		await deleteSession(token);
	}
	cookies.delete('session', { path: '/' });
	return json({ success: true });
};
