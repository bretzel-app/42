import type { Db } from './db/index.js';
import { userPreferences } from './db/schema.js';
import { eq } from 'drizzle-orm';

export function getPreferences(db: Db, userId: number): Record<string, string> {
	const rows = db
		.select({ key: userPreferences.key, value: userPreferences.value })
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId))
		.all();

	const result: Record<string, string> = {};
	for (const row of rows) {
		result[row.key] = row.value;
	}
	return result;
}

export function upsertPreferences(
	db: Db,
	userId: number,
	prefs: Record<string, string>
): Record<string, string> {
	const now = new Date();
	for (const [key, value] of Object.entries(prefs)) {
		db.insert(userPreferences)
			.values({ userId, key, value, updatedAt: now })
			.onConflictDoUpdate({
				target: [userPreferences.userId, userPreferences.key],
				set: { value, updatedAt: now }
			})
			.run();
	}
	return getPreferences(db, userId);
}
