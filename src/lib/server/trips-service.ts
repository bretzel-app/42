import { db } from './db/index.js';
import { trips, expenses, tripCurrencies, tripCollaborators, users } from './db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Trip } from '$lib/types/index.js';
import { getSharedTripIds, fetchCollaboratorsForTrips } from './collaborators.js';

function toTrip(row: typeof trips.$inferSelect): Trip {
	return {
		id: row.id,
		name: row.name,
		destination: row.destination,
		startDate: row.startDate,
		endDate: row.endDate,
		numberOfPeople: row.numberOfPeople,
		totalBudget: row.totalBudget,
		homeCurrency: row.homeCurrency,
		deleted: row.deleted,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		version: row.version
	};
}

export function listTrips(userId: number): Trip[] {
	const owned = db
		.select()
		.from(trips)
		.where(and(eq(trips.userId, userId), eq(trips.deleted, false)))
		.all()
		.map((r) => ({ ...toTrip(r), isOwner: true }));

	const sharedIds = getSharedTripIds(userId);
	const shared = sharedIds.length > 0
		? db
				.select()
				.from(trips)
				.where(and(inArray(trips.id, sharedIds), eq(trips.deleted, false)))
				.all()
				.map((r) => ({ ...toTrip(r), isOwner: false }))
		: [];

	return [...owned, ...shared];
}

export function listTripsWithTotals(userId: number): (Trip & { totalSpent: number; expenseCount: number })[] {
	const ownedRows = db
		.select({
			trip: trips,
			totalSpent: sql<number>`coalesce(sum(case when ${expenses.deleted} = 0 then ${expenses.amount} else 0 end), 0)`.as('total_spent'),
			expenseCount: sql<number>`count(case when ${expenses.deleted} = 0 then 1 end)`.as('expense_count')
		})
		.from(trips)
		.leftJoin(expenses, eq(trips.id, expenses.tripId))
		.where(and(eq(trips.userId, userId), eq(trips.deleted, false)))
		.groupBy(trips.id)
		.all();

	const sharedIds = getSharedTripIds(userId);
	const sharedRows = sharedIds.length > 0
		? db
				.select({
					trip: trips,
					totalSpent: sql<number>`coalesce(sum(case when ${expenses.deleted} = 0 then ${expenses.amount} else 0 end), 0)`.as('total_spent'),
					expenseCount: sql<number>`count(case when ${expenses.deleted} = 0 then 1 end)`.as('expense_count')
				})
				.from(trips)
				.leftJoin(expenses, eq(trips.id, expenses.tripId))
				.where(and(inArray(trips.id, sharedIds), eq(trips.deleted, false)))
				.groupBy(trips.id)
				.all()
		: [];

	const allRows = [...ownedRows, ...sharedRows];
	const allTripIds = allRows.map((r) => r.trip.id);
	const collabMap = fetchCollaboratorsForTrips(allTripIds);

	return allRows.map((r) => {
		const isOwner = r.trip.userId === userId;
		const collaborators = collabMap.get(r.trip.id) || [];
		return {
			...toTrip(r.trip),
			totalSpent: Number(r.totalSpent),
			expenseCount: Number(r.expenseCount),
			isOwner,
			isShared: collaborators.length > 0,
			collaborators
		};
	});
}

export function getTrip(id: string, userId: number): (Trip & { isOwner: boolean }) | null {
	const row = db
		.select()
		.from(trips)
		.where(eq(trips.id, id))
		.get();
	if (!row) return null;

	const isOwner = row.userId === userId;
	if (!isOwner) {
		// Check collaborator access
		const collab = db
			.select()
			.from(tripCollaborators)
			.where(and(eq(tripCollaborators.tripId, id), eq(tripCollaborators.userId, userId)))
			.get();
		if (!collab) return null;
	}

	return { ...toTrip(row), isOwner };
}

export function getTripOwnerName(tripId: string): string {
	const row = db
		.select({ displayName: users.displayName })
		.from(trips)
		.innerJoin(users, eq(trips.userId, users.id))
		.where(eq(trips.id, tripId))
		.get();
	return row?.displayName || '';
}

export function createTrip(data: Trip, userId: number): Trip {
	const now = new Date();
	const result = db
		.insert(trips)
		.values({
			id: data.id || randomUUID(),
			userId,
			name: data.name,
			destination: data.destination || '',
			startDate: new Date(data.startDate),
			endDate: new Date(data.endDate),
			numberOfPeople: data.numberOfPeople || 1,
			totalBudget: data.totalBudget,
			homeCurrency: data.homeCurrency || 'EUR',
			deleted: false,
			createdAt: now,
			updatedAt: now,
			version: 1
		})
		.returning()
		.get();
	return toTrip(result);
}

export function updateTrip(
	id: string,
	data: Partial<Trip>,
	userId: number
): Trip | null {
	// Allow both owner and collaborators to update trip details
	const trip = getTrip(id, userId);
	if (!trip) return null;

	const existing = db
		.select()
		.from(trips)
		.where(eq(trips.id, id))
		.get();
	if (!existing) return null;

	const updates: Record<string, unknown> = { updatedAt: new Date(), version: existing.version + 1 };
	if (data.name !== undefined) updates.name = data.name;
	if (data.destination !== undefined) updates.destination = data.destination;
	if (data.startDate !== undefined) updates.startDate = new Date(data.startDate);
	if (data.endDate !== undefined) updates.endDate = new Date(data.endDate);
	if (data.numberOfPeople !== undefined) updates.numberOfPeople = data.numberOfPeople;
	if (data.totalBudget !== undefined) updates.totalBudget = data.totalBudget;
	if (data.homeCurrency !== undefined) updates.homeCurrency = data.homeCurrency;

	const result = db
		.update(trips)
		.set(updates)
		.where(eq(trips.id, id))
		.returning()
		.get();
	return result ? toTrip(result) : null;
}

export function deleteTrip(id: string, userId: number): boolean {
	const existing = db
		.select()
		.from(trips)
		.where(and(eq(trips.id, id), eq(trips.userId, userId)))
		.get();
	if (!existing) return false;

	db.update(trips)
		.set({ deleted: true, updatedAt: new Date() })
		.where(eq(trips.id, id))
		.run();
	return true;
}
