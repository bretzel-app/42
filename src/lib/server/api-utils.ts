import { error } from '@sveltejs/kit';
import type { Db } from './db/index.js';
import { trips } from './db/schema.js';
import { eq, and } from 'drizzle-orm';

type EventWithLocals = {
	locals: App.Locals;
};

export function getUserId(event: EventWithLocals): number {
	if (!event.locals.user) throw error(401, 'Unauthorized');
	return event.locals.user.id;
}

export function requireAdmin(event: EventWithLocals) {
	const user = event.locals.user;
	if (!user || user.role !== 'admin') throw error(403, 'Forbidden');
	return user;
}

/**
 * Verify a trip belongs to a user and return it.
 */
export function getTripForUser(db: Db, tripId: string, userId: number) {
	const trip = db
		.select()
		.from(trips)
		.where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
		.get();
	if (!trip) throw error(404, 'Not found');
	return trip;
}
