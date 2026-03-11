import { db } from './db/index.js';
import { tripCollaborators, users, trips } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { Collaborator } from '$lib/types/index.js';

/**
 * Check if a user can access a trip (owner or collaborator).
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

	const collab = db
		.select()
		.from(tripCollaborators)
		.where(and(eq(tripCollaborators.tripId, tripId), eq(tripCollaborators.userId, userId)))
		.get();
	return { canAccess: !!collab, isOwner: false };
}

/**
 * Fetch collaborators for a single trip.
 */
export function fetchCollaborators(tripId: string): Collaborator[] {
	const rows = db
		.select({
			userId: tripCollaborators.userId,
			displayName: users.displayName,
			email: users.email,
			addedAt: tripCollaborators.addedAt
		})
		.from(tripCollaborators)
		.innerJoin(users, eq(tripCollaborators.userId, users.id))
		.where(eq(tripCollaborators.tripId, tripId))
		.all();

	return rows.map((r) => ({
		userId: r.userId,
		displayName: r.displayName,
		email: r.email,
		addedAt: r.addedAt
	}));
}

/**
 * Fetch collaborators for multiple trips in a single query.
 */
export function fetchCollaboratorsForTrips(
	tripIds: string[]
): Map<string, Collaborator[]> {
	if (tripIds.length === 0) return new Map();

	const rows = db
		.select({
			tripId: tripCollaborators.tripId,
			userId: tripCollaborators.userId,
			displayName: users.displayName,
			email: users.email,
			addedAt: tripCollaborators.addedAt
		})
		.from(tripCollaborators)
		.innerJoin(users, eq(tripCollaborators.userId, users.id))
		.all()
		.filter((r) => tripIds.includes(r.tripId));

	const map = new Map<string, Collaborator[]>();
	for (const row of rows) {
		const list = map.get(row.tripId) || [];
		list.push({
			userId: row.userId,
			displayName: row.displayName,
			email: row.email,
			addedAt: row.addedAt
		});
		map.set(row.tripId, list);
	}
	return map;
}

/**
 * Add a collaborator to a trip.
 */
export function addCollaborator(
	tripId: string,
	userId: number,
	addedBy: number
): void {
	db.insert(tripCollaborators)
		.values({
			tripId,
			userId,
			addedBy,
			addedAt: new Date()
		})
		.run();
}

/**
 * Remove a collaborator from a trip.
 */
export function removeCollaborator(tripId: string, userId: number): void {
	db.delete(tripCollaborators)
		.where(and(eq(tripCollaborators.tripId, tripId), eq(tripCollaborators.userId, userId)))
		.run();
}

/**
 * Get trip IDs shared with a user (where user is a collaborator).
 */
export function getSharedTripIds(userId: number): string[] {
	return db
		.select({ tripId: tripCollaborators.tripId })
		.from(tripCollaborators)
		.where(eq(tripCollaborators.userId, userId))
		.all()
		.map((r) => r.tripId);
}
