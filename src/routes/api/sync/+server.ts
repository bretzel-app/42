import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { processSyncPush, getChangesSince } from '$lib/sync/server.js';
import { getUserId } from '$lib/server/api-utils.js';
import { db } from '$lib/server/db/index.js';

export const POST: RequestHandler = async ({ request, ...event }) => {
	const userId = getUserId(event);
	const { changes } = await request.json();

	if (!Array.isArray(changes)) {
		return json({ error: 'Invalid changes' }, { status: 400 });
	}

	await processSyncPush(db, changes, userId);
	return json({ success: true });
};

export const GET: RequestHandler = async ({ url, ...event }) => {
	const userId = getUserId(event);
	const since = parseInt(url.searchParams.get('since') || '0', 10);
	const changes = await getChangesSince(db, since, userId);
	return json(changes);
};
