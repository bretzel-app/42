import { db } from './db/index.js';
import { expenses, expenseSplits } from './db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Expense, ExpenseSplit } from '$lib/types/index.js';
import { canAccessTrip } from './collaborators.js';
import { getTrip } from './trips-service.js';
import { error } from '@sveltejs/kit';

interface SplitInput {
	memberId: string;
	amount: number;
}

/** Sanitize latitude/longitude: must be finite numbers in valid ranges, both set or both null. */
function sanitizeCoords(lat: unknown, lng: unknown): { latitude: number | null; longitude: number | null } {
	const latNum = typeof lat === 'number' ? lat : Number(lat);
	const lngNum = typeof lng === 'number' ? lng : Number(lng);
	if (
		Number.isFinite(latNum) && Number.isFinite(lngNum) &&
		latNum >= -90 && latNum <= 90 &&
		lngNum >= -180 && lngNum <= 180
	) {
		return { latitude: latNum, longitude: lngNum };
	}
	return { latitude: null, longitude: null };
}

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
		paidByMemberId: row.paidByMemberId ?? null,
		latitude: row.latitude ?? null,
		longitude: row.longitude ?? null,
		deleted: row.deleted,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		version: row.version
	};
}

function toExpenseSplit(row: typeof expenseSplits.$inferSelect): ExpenseSplit {
	return {
		id: row.id,
		expenseId: row.expenseId,
		memberId: row.memberId,
		amount: row.amount,
		deleted: row.deleted === 1,
		createdAt: row.createdAt ?? new Date(),
		updatedAt: row.updatedAt ?? new Date(),
		version: row.version
	};
}

function verifyTripAccess(tripId: string, userId: number): boolean {
	return canAccessTrip(tripId, userId).canAccess;
}

export function listExpenses(tripId: string, userId: number): (Expense & { splits: ExpenseSplit[] })[] {
	if (!verifyTripAccess(tripId, userId)) return [];

	const expenseRows = db
		.select()
		.from(expenses)
		.where(and(eq(expenses.tripId, tripId), eq(expenses.deleted, false)))
		.all();

	if (expenseRows.length === 0) return [];

	const expenseIds = expenseRows.map((e) => e.id);

	// Fetch all active splits for these expenses
	const splitRows = db
		.select()
		.from(expenseSplits)
		.where(and(eq(expenseSplits.deleted, 0), inArray(expenseSplits.expenseId, expenseIds)))
		.all();

	// Group splits by expenseId
	const splitsByExpenseId = new Map<string, ExpenseSplit[]>();
	for (const split of splitRows) {
		const existing = splitsByExpenseId.get(split.expenseId) ?? [];
		existing.push(toExpenseSplit(split));
		splitsByExpenseId.set(split.expenseId, existing);
	}

	return expenseRows.map((row) => ({
		...toExpense(row),
		splits: splitsByExpenseId.get(row.id) ?? []
	}));
}

export function createExpense(
	data: Expense & { splits?: SplitInput[] },
	userId: number
): Expense | null {
	if (!verifyTripAccess(data.tripId, userId)) return null;

	// Strip split data if trip has splitting disabled
	const trip = getTrip(data.tripId, userId);
	if (trip?.splitExpenses === false) {
		data.paidByMemberId = null;
		data.splits = undefined;
	}

	const now = new Date();
	const id = data.id || randomUUID();

	// Validate splits before inserting expense
	if (data.paidByMemberId && data.splits?.length) {
		const splitTotal = data.splits.reduce((sum, s) => sum + s.amount, 0);
		if (splitTotal !== data.amount) {
			throw error(400, 'Split amounts must equal expense amount');
		}
	}

	const result = db
		.insert(expenses)
		.values({
			id,
			tripId: data.tripId,
			userId,
			amount: data.amount,
			currency: data.currency,
			exchangeRate: data.exchangeRate || '1',
			categoryId: data.categoryId,
			date: new Date(data.date),
			note: data.note || '',
			paidByMemberId: data.paidByMemberId ?? null,
			...sanitizeCoords(data.latitude, data.longitude),
			deleted: false,
			createdAt: now,
			updatedAt: now,
			version: 1
		})
		.returning()
		.get();

	if (data.paidByMemberId && data.splits?.length) {
		for (const split of data.splits) {
			db.insert(expenseSplits)
				.values({
					id: randomUUID(),
					expenseId: id,
					memberId: split.memberId,
					amount: split.amount,
					deleted: 0,
					createdAt: now,
					updatedAt: now,
					version: 1
				})
				.run();
		}
	}

	return toExpense(result);
}

export function updateExpense(
	id: string,
	tripId: string,
	data: Partial<Expense> & { splits?: SplitInput[] },
	userId: number
): Expense | null {
	if (!verifyTripAccess(tripId, userId)) return null;

	const trip = getTrip(tripId, userId);
	if (trip?.splitExpenses === false) {
		data.paidByMemberId = null;
		data.splits = undefined;
	}

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
	if ('paidByMemberId' in data) updates.paidByMemberId = data.paidByMemberId ?? null;
	if (data.latitude !== undefined || data.longitude !== undefined) {
		const coords = sanitizeCoords(data.latitude, data.longitude);
		updates.latitude = coords.latitude;
		updates.longitude = coords.longitude;
	}

	const result = db
		.update(expenses)
		.set(updates)
		.where(eq(expenses.id, id))
		.returning()
		.get();

	if (data.splits !== undefined) {
		const now = new Date();
		const effectiveAmount = (data.amount !== undefined ? data.amount : existing.amount);

		if (data.splits.length > 0) {
			const splitTotal = data.splits.reduce((sum, s) => sum + s.amount, 0);
			if (splitTotal !== effectiveAmount) {
				throw error(400, 'Split amounts must equal expense amount');
			}
		}

		// Soft-delete existing splits
		const existingSplits = db
			.select()
			.from(expenseSplits)
			.where(and(eq(expenseSplits.expenseId, id), eq(expenseSplits.deleted, 0)))
			.all();

		for (const split of existingSplits) {
			db.update(expenseSplits)
				.set({ deleted: 1, updatedAt: now, version: split.version + 1 })
				.where(eq(expenseSplits.id, split.id))
				.run();
		}

		// Insert new splits
		for (const split of data.splits) {
			db.insert(expenseSplits)
				.values({
					id: randomUUID(),
					expenseId: id,
					memberId: split.memberId,
					amount: split.amount,
					deleted: 0,
					createdAt: now,
					updatedAt: now,
					version: 1
				})
				.run();
		}
	}

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
