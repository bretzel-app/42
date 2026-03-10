import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { getUserId } from '$lib/server/api-utils.js';
import { getPreferences, upsertPreferences } from '$lib/server/preferences.js';

export const GET: RequestHandler = async (event) => {
	const userId = getUserId(event);
	const prefs = getPreferences(db, userId);
	return json(prefs);
};

export const PUT: RequestHandler = async ({ request, ...event }) => {
	const userId = getUserId(event);
	const body: Record<string, string> = await request.json();
	const updated = upsertPreferences(db, userId, body);
	return json(updated);
};
