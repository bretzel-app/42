import { db } from './db/index.js';
import { trips, expenses, tripCurrencies } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Trip } from '$lib/types/index.js';

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
	return db
		.select()
		.from(trips)
		.where(and(eq(trips.userId, userId), eq(trips.deleted, false)))
		.all()
		.map(toTrip);
}

export function getTrip(id: string, userId: number): Trip | null {
	const row = db
		.select()
		.from(trips)
		.where(and(eq(trips.id, id), eq(trips.userId, userId)))
		.get();
	return row ? toTrip(row) : null;
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
	const existing = db
		.select()
		.from(trips)
		.where(and(eq(trips.id, id), eq(trips.userId, userId)))
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
