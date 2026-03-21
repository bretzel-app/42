import { db } from './db/index.js';
import { settlements, tripMembers, expenses, expenseSplits } from './db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Settlement, MemberBalance, SuggestedTransfer, TripMember } from '$lib/types/index.js';
import { computeBalances, computeMinTransfers } from '$lib/utils/splits.js';

function toSettlement(row: typeof settlements.$inferSelect): Settlement {
	return {
		id: row.id,
		tripId: row.tripId,
		fromMemberId: row.fromMemberId,
		toMemberId: row.toMemberId,
		amount: row.amount,
		date: row.date ?? new Date(),
		note: row.note ?? '',
		deleted: row.deleted === 1,
		createdAt: row.createdAt ?? new Date(),
		updatedAt: row.updatedAt ?? new Date(),
		version: row.version
	};
}

export function listSettlements(tripId: string): Settlement[] {
	return db
		.select()
		.from(settlements)
		.where(and(eq(settlements.tripId, tripId), eq(settlements.deleted, 0)))
		.all()
		.map(toSettlement);
}

export function createSettlement(data: {
	tripId: string;
	fromMemberId: string;
	toMemberId: string;
	amount: number;
	date?: Date;
	note?: string;
}): Settlement {
	const now = new Date();
	const result = db
		.insert(settlements)
		.values({
			id: randomUUID(),
			tripId: data.tripId,
			fromMemberId: data.fromMemberId,
			toMemberId: data.toMemberId,
			amount: data.amount,
			date: data.date ?? now,
			note: data.note ?? '',
			deleted: 0,
			createdAt: now,
			updatedAt: now,
			version: 1
		})
		.returning()
		.get();

	return toSettlement(result);
}

export function deleteSettlement(tripId: string, settlementId: string): boolean {
	const existing = db
		.select()
		.from(settlements)
		.where(and(eq(settlements.id, settlementId), eq(settlements.tripId, tripId)))
		.get();
	if (!existing) return false;

	const now = new Date();
	db.update(settlements)
		.set({ deleted: 1, updatedAt: now, version: existing.version + 1 })
		.where(and(eq(settlements.id, settlementId), eq(settlements.tripId, tripId)))
		.run();

	return true;
}

export function getBalances(tripId: string): {
	balances: MemberBalance[];
	transfers: SuggestedTransfer[];
	members: TripMember[];
} {
	// Fetch active members
	const memberRows = db
		.select()
		.from(tripMembers)
		.where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.deleted, 0)))
		.all();

	const members: TripMember[] = memberRows.map((row) => ({
		id: row.id,
		tripId: row.tripId,
		name: row.name,
		userId: row.userId ?? null,
		addedBy: row.addedBy,
		deleted: row.deleted === 1,
		createdAt: row.createdAt ?? new Date(),
		updatedAt: row.updatedAt ?? new Date(),
		version: row.version
	}));

	// Fetch active expenses with a paidByMemberId
	const expenseRows = db
		.select()
		.from(expenses)
		.where(and(eq(expenses.tripId, tripId), eq(expenses.deleted, false)))
		.all();

	const tripExpenses = expenseRows.map((row) => ({
		id: row.id,
		tripId: row.tripId,
		amount: row.amount,
		currency: row.currency,
		exchangeRate: row.exchangeRate,
		categoryId: row.categoryId as import('$lib/types/index.js').CategoryId,
		date: row.date,
		note: row.note,
		paidByMemberId: row.paidByMemberId ?? null,
		deleted: Boolean(row.deleted),
		createdAt: row.createdAt ?? new Date(),
		updatedAt: row.updatedAt ?? new Date(),
		version: row.version
	}));

	// Fetch active splits for those expenses
	const expenseIds = expenseRows.map((e) => e.id);
	let splits: import('$lib/types/index.js').ExpenseSplit[] = [];
	if (expenseIds.length > 0) {
		const splitRows = db
			.select()
			.from(expenseSplits)
			.where(and(inArray(expenseSplits.expenseId, expenseIds), eq(expenseSplits.deleted, 0)))
			.all();
		splits = splitRows.map((row) => ({
			id: row.id,
			expenseId: row.expenseId,
			memberId: row.memberId,
			amount: row.amount,
			deleted: row.deleted === 1,
			createdAt: row.createdAt ?? new Date(),
			updatedAt: row.updatedAt ?? new Date(),
			version: row.version
		}));
	}

	// Fetch active settlements
	const settlementRows = db
		.select()
		.from(settlements)
		.where(and(eq(settlements.tripId, tripId), eq(settlements.deleted, 0)))
		.all();

	const tripSettlements: Settlement[] = settlementRows.map(toSettlement);

	const balances = computeBalances(members, tripExpenses, splits, tripSettlements);
	const transfers = computeMinTransfers(balances);

	return { balances, transfers, members };
}
