import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { db } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema.js';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, ...event }) => {
	const userId = getUserId(event);
	const query = url.searchParams.get('q')?.trim();
	if (!query || query.length < 1) return json([]);

	const pattern = `%${query}%`;
	const results = db
		.select({
			id: users.id,
			displayName: users.displayName,
			email: users.email
		})
		.from(users)
		.where(
			sql`(${users.id} != ${userId}) AND (${users.displayName} LIKE ${pattern} OR ${users.email} LIKE ${pattern})`
		)
		.limit(10)
		.all();

	return json(results);
};
