import { db } from './db/index.js';
import { tripMembers, trips, users } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { TripMember } from '$lib/types/index.js';
import { canAccessTrip } from './collaborators.js';

function toTripMember(row: typeof tripMembers.$inferSelect): TripMember {
	return {
		id: row.id,
		tripId: row.tripId,
		name: row.name,
		userId: row.userId ?? null,
		addedBy: row.addedBy,
		deleted: row.deleted === 1,
		createdAt: row.createdAt ?? new Date(),
		updatedAt: row.updatedAt ?? new Date(),
		version: row.version
	};
}

export function listMembers(tripId: string, userId: number): TripMember[] {
	const { canAccess } = canAccessTrip(tripId, userId);
	if (!canAccess) return [];
	return db
		.select()
		.from(tripMembers)
		.where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.deleted, 0)))
		.all()
		.map(toTripMember);
}

export function getMember(memberId: string): TripMember | undefined {
	const row = db.select().from(tripMembers).where(eq(tripMembers.id, memberId)).get();
	return row ? toTripMember(row) : undefined;
}

export function createMember(
	data: { tripId: string; name: string; userId?: number | null },
	addedBy: number
): TripMember {
	const now = new Date();

	// Auto-add the trip owner as the first member if no members exist yet
	const existingCount = db
		.select()
		.from(tripMembers)
		.where(eq(tripMembers.tripId, data.tripId))
		.all().length;

	if (existingCount === 0) {
		const trip = db.select().from(trips).where(eq(trips.id, data.tripId)).get();
		if (trip && trip.userId !== addedBy) {
			// Add the trip owner as first member
			const owner = db.select().from(users).where(eq(users.id, trip.userId)).get();
			if (owner) {
				db.insert(tripMembers)
					.values({
						id: randomUUID(),
						tripId: data.tripId,
						name: owner.displayName || owner.email,
						userId: owner.id,
						addedBy,
						deleted: 0,
						createdAt: now,
						updatedAt: now,
						version: 1
					})
					.run();
			}
		}
	}

	const result = db
		.insert(tripMembers)
		.values({
			id: randomUUID(),
			tripId: data.tripId,
			name: data.name,
			userId: data.userId ?? null,
			addedBy,
			deleted: 0,
			createdAt: now,
			updatedAt: now,
			version: 1
		})
		.returning()
		.get();

	// Update trip's numberOfPeople to match active member count
	const activeCount = db
		.select()
		.from(tripMembers)
		.where(and(eq(tripMembers.tripId, data.tripId), eq(tripMembers.deleted, 0)))
		.all().length;

	db.update(trips)
		.set({ numberOfPeople: activeCount, updatedAt: now })
		.where(eq(trips.id, data.tripId))
		.run();

	return toTripMember(result);
}

export function updateMember(
	memberId: string,
	data: { name?: string; userId?: number | null }
): TripMember | null {
	const existing = db.select().from(tripMembers).where(eq(tripMembers.id, memberId)).get();
	if (!existing) return null;

	const updates: Record<string, unknown> = {
		updatedAt: new Date(),
		version: existing.version + 1
	};
	if (data.name !== undefined) updates.name = data.name;
	if (data.userId !== undefined) updates.userId = data.userId;

	const result = db
		.update(tripMembers)
		.set(updates)
		.where(eq(tripMembers.id, memberId))
		.returning()
		.get();

	return result ? toTripMember(result) : null;
}

export function deleteMember(memberId: string, tripId: string): boolean {
	const existing = db
		.select()
		.from(tripMembers)
		.where(and(eq(tripMembers.id, memberId), eq(tripMembers.tripId, tripId)))
		.get();
	if (!existing) return false;

	// Check if this member is the trip owner (cannot delete owner)
	const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
	if (trip && existing.userId === trip.userId) return false;

	const now = new Date();
	db.update(tripMembers)
		.set({ deleted: 1, updatedAt: now })
		.where(eq(tripMembers.id, memberId))
		.run();

	// Update trip's numberOfPeople to match active member count
	const activeCount = db
		.select()
		.from(tripMembers)
		.where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.deleted, 0)))
		.all().length;

	db.update(trips)
		.set({ numberOfPeople: activeCount, updatedAt: now })
		.where(eq(trips.id, tripId))
		.run();

	return true;
}
