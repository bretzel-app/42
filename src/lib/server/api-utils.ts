import { error } from '@sveltejs/kit';
import type { Db } from './db/index.js';
import { trips } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { canAccessTrip } from './collaborators.js';

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

/**
 * Verify a user can access a trip (owner or collaborator) and return it.
 */
export function requireTripAccess(db: Db, tripId: string, userId: number): { trip: typeof trips.$inferSelect; isOwner: boolean } {
	const { canAccess, isOwner } = canAccessTrip(tripId, userId);
	if (!canAccess) throw error(404, 'Not found');
	const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
	if (!trip) throw error(404, 'Not found');
	return { trip, isOwner };
}
