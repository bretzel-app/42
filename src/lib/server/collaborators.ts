import { db } from './db/index.js';
import { tripMembers, trips } from './db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Check if a user can access a trip (owner or member).
 * Returns { canAccess, isOwner }.
 */
export function canAccessTrip(
	tripId: string,
	userId: number
): { canAccess: boolean; isOwner: boolean } {
	const trip = db
		.select({ userId: trips.userId })
		.from(trips)
		.where(eq(trips.id, tripId))
		.get();
	if (!trip) return { canAccess: false, isOwner: false };
	if (trip.userId === userId) return { canAccess: true, isOwner: true };

	const member = db
		.select()
		.from(tripMembers)
		.where(
			and(
				eq(tripMembers.tripId, tripId),
				eq(tripMembers.userId, userId),
				eq(tripMembers.deleted, 0)
			)
		)
		.get();
	return { canAccess: !!member, isOwner: false };
}

/**
 * Get trip IDs accessible to a user where they are a member but not the owner.
 */
export function getSharedTripIds(userId: number): string[] {
	// Get all trips where user is a member
	const memberRows = db
		.select({ tripId: tripMembers.tripId })
		.from(tripMembers)
		.where(and(eq(tripMembers.userId, userId), eq(tripMembers.deleted, 0)))
		.all();

	if (memberRows.length === 0) return [];

	// Filter to trips where this user is NOT the owner
	const tripIds = memberRows.map((r) => r.tripId);
	const ownedTrips = db
		.select({ id: trips.id })
		.from(trips)
		.where(eq(trips.userId, userId))
		.all()
		.map((r) => r.id);

	const ownedSet = new Set(ownedTrips);
	return tripIds.filter((id) => !ownedSet.has(id));
}
