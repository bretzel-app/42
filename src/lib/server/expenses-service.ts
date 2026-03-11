import { db } from './db/index.js';
import { expenses, trips } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Expense } from '$lib/types/index.js';
import { canAccessTrip } from './collaborators.js';

function toExpense(row: typeof expenses.$inferSelect): Expense {
	return {
		id: row.id,
		tripId: row.tripId,
		amount: row.amount,
		currency: row.currency,
		exchangeRate: row.exchangeRate,
		categoryId: row.categoryId as Expense['categoryId'],
		date: row.date,
		note: row.note,
		deleted: row.deleted,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		version: row.version
	};
}

function verifyTripAccess(tripId: string, userId: number): boolean {
	return canAccessTrip(tripId, userId).canAccess;
}

export function listExpenses(tripId: string, userId: number): Expense[] {
	if (!verifyTripAccess(tripId, userId)) return [];
	return db
		.select()
		.from(expenses)
		.where(and(eq(expenses.tripId, tripId), eq(expenses.deleted, false)))
		.all()
		.map(toExpense);
}

export function createExpense(data: Expense, userId: number): Expense | null {
	if (!verifyTripAccess(data.tripId, userId)) return null;

	const now = new Date();
	const result = db
		.insert(expenses)
		.values({
			id: data.id || randomUUID(),
			tripId: data.tripId,
			userId,
			amount: data.amount,
			currency: data.currency,
			exchangeRate: data.exchangeRate || '1',
			categoryId: data.categoryId,
			date: new Date(data.date),
			note: data.note || '',
			deleted: false,
			createdAt: now,
			updatedAt: now,
			version: 1
		})
		.returning()
		.get();
	return toExpense(result);
}

export function updateExpense(
	id: string,
	tripId: string,
	data: Partial<Expense>,
	userId: number
): Expense | null {
	if (!verifyTripAccess(tripId, userId)) return null;

	const existing = db
		.select()
		.from(expenses)
		.where(and(eq(expenses.id, id), eq(expenses.tripId, tripId)))
		.get();
	if (!existing) return null;

	const updates: Record<string, unknown> = { updatedAt: new Date(), version: existing.version + 1 };
	if (data.amount !== undefined) updates.amount = data.amount;
	if (data.currency !== undefined) updates.currency = data.currency;
	if (data.exchangeRate !== undefined) updates.exchangeRate = data.exchangeRate;
	if (data.categoryId !== undefined) updates.categoryId = data.categoryId;
	if (data.date !== undefined) updates.date = new Date(data.date);
	if (data.note !== undefined) updates.note = data.note;

	const result = db
		.update(expenses)
		.set(updates)
		.where(eq(expenses.id, id))
		.returning()
		.get();
	return result ? toExpense(result) : null;
}

export function deleteExpense(id: string, tripId: string, userId: number): boolean {
	if (!verifyTripAccess(tripId, userId)) return false;

	const existing = db
		.select()
		.from(expenses)
		.where(and(eq(expenses.id, id), eq(expenses.tripId, tripId)))
		.get();
	if (!existing) return false;

	db.update(expenses)
		.set({ deleted: true, updatedAt: new Date() })
		.where(eq(expenses.id, id))
		.run();
	return true;
}
