import type { Db } from '$lib/server/db/index.js';
import {
	trips,
	expenses,
	tripCurrencies,
	tripMembers,
	expenseSplits,
	settlements,
	syncLog
} from '$lib/server/db/schema.js';
import { eq, gt, and, inArray } from 'drizzle-orm';
import type { SyncQueueItem } from './idb.js';

export async function processSyncPush(db: Db, changes: SyncQueueItem[], userId: number): Promise<void> {
	db.transaction((tx) => {
		for (const change of changes) {
			switch (change.entityType) {
				case 'trip': {
					if (change.operation === 'delete') {
						tx.update(trips)
							.set({ deleted: true, updatedAt: new Date(change.timestamp) })
							.where(and(eq(trips.id, change.entityId), eq(trips.userId, userId)))
							.run();
					} else if (change.data) {
						const existing = tx.select().from(trips).where(eq(trips.id, change.entityId)).get();
						if (existing) {
							if (existing.userId !== userId) continue;
							if (change.timestamp > existing.updatedAt.getTime()) {
								const updates: Record<string, unknown> = {
									updatedAt: new Date(change.timestamp),
									version: existing.version + 1
								};
								for (const [key, value] of Object.entries(change.data)) {
									if (key !== 'id' && key !== 'userId' && key !== 'createdAt') {
										updates[key] = value;
									}
								}
								tx.update(trips).set(updates).where(eq(trips.id, change.entityId)).run();
							}
						} else if (change.operation === 'create') {
							tx.insert(trips)
								.values({
									id: change.entityId,
									userId,
									name: (change.data.name as string) || '',
									destination: (change.data.destination as string) || '',
									startDate: new Date(change.data.startDate as number),
									endDate: new Date(change.data.endDate as number),
									numberOfPeople: (change.data.numberOfPeople as number) || 1,
									totalBudget: (change.data.totalBudget as number) ?? null,
									homeCurrency: (change.data.homeCurrency as string) || 'EUR',
									deleted: false,
									createdAt: new Date(change.timestamp),
									updatedAt: new Date(change.timestamp),
									version: 1
								})
								.run();
						}
					}
					break;
				}
				case 'expense': {
					if (change.operation === 'delete') {
						tx.update(expenses)
							.set({ deleted: true, updatedAt: new Date(change.timestamp) })
							.where(and(eq(expenses.id, change.entityId), eq(expenses.userId, userId)))
							.run();
					} else if (change.data) {
						const existing = tx.select().from(expenses).where(eq(expenses.id, change.entityId)).get();
						if (existing) {
							if (existing.userId !== userId) continue;
							if (change.timestamp > existing.updatedAt.getTime()) {
								const updates: Record<string, unknown> = {
									updatedAt: new Date(change.timestamp),
									version: existing.version + 1
								};
								for (const [key, value] of Object.entries(change.data)) {
									if (key !== 'id' && key !== 'userId' && key !== 'createdAt') {
										updates[key] = value;
									}
								}
								tx.update(expenses).set(updates).where(eq(expenses.id, change.entityId)).run();
							}
						} else if (change.operation === 'create') {
							tx.insert(expenses)
								.values({
									id: change.entityId,
									tripId: change.data.tripId as string,
									userId,
									amount: change.data.amount as number,
									currency: (change.data.currency as string) || 'EUR',
									exchangeRate: (change.data.exchangeRate as string) || '1',
									categoryId: (change.data.categoryId as string) || 'misc',
									date: new Date(change.data.date as number),
									note: (change.data.note as string) || '',
									deleted: false,
									createdAt: new Date(change.timestamp),
									updatedAt: new Date(change.timestamp),
									version: 1
								})
								.run();
						}
					}
					break;
				}
				case 'tripCurrency': {
					if (change.data) {
						const tripId = change.data.tripId as string;
						const currencyCode = change.data.currencyCode as string;
						const exchangeRate = change.data.exchangeRate as string;
						// Verify trip ownership
						const trip = tx.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).get();
						if (!trip) continue;

						tx.insert(tripCurrencies)
							.values({
								tripId,
								currencyCode,
								exchangeRate,
								updatedAt: new Date(change.timestamp)
							})
							.onConflictDoUpdate({
								target: [tripCurrencies.tripId, tripCurrencies.currencyCode],
								set: { exchangeRate, updatedAt: new Date(change.timestamp) }
							})
							.run();
					}
					break;
				}
				case 'tripMember': {
					if (change.operation === 'delete') {
						// Verify the member belongs to a trip owned by this user
						const member = tx.select().from(tripMembers).where(eq(tripMembers.id, change.entityId)).get();
						if (!member) break;
						const trip = tx.select().from(trips).where(and(eq(trips.id, member.tripId), eq(trips.userId, userId))).get();
						if (!trip) break;
						tx.update(tripMembers)
							.set({ deleted: 1, updatedAt: new Date(change.timestamp) })
							.where(eq(tripMembers.id, change.entityId))
							.run();
					} else if (change.data) {
						const tripId = change.data.tripId as string;
						// Verify trip ownership
						const trip = tx.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).get();
						if (!trip) continue;

						const existing = tx.select().from(tripMembers).where(eq(tripMembers.id, change.entityId)).get();
						if (existing) {
							const existingUpdatedAt = existing.updatedAt ? existing.updatedAt.getTime() : 0;
							if (change.timestamp > existingUpdatedAt) {
								const updates: Record<string, unknown> = {
									updatedAt: new Date(change.timestamp),
									version: existing.version + 1
								};
								for (const [key, value] of Object.entries(change.data)) {
									if (key !== 'id' && key !== 'tripId' && key !== 'addedBy' && key !== 'createdAt') {
										updates[key] = value;
									}
								}
								tx.update(tripMembers).set(updates).where(eq(tripMembers.id, change.entityId)).run();
							}
						} else if (change.operation === 'create') {
							tx.insert(tripMembers)
								.values({
									id: change.entityId,
									tripId,
									name: (change.data.name as string) || '',
									userId: (change.data.userId as number) ?? null,
									addedBy: userId,
									deleted: 0,
									createdAt: new Date(change.timestamp),
									updatedAt: new Date(change.timestamp),
									version: 1
								})
								.run();
						}
					}
					break;
				}
				case 'expenseSplit': {
					if (change.operation === 'delete') {
						tx.update(expenseSplits)
							.set({ deleted: 1, updatedAt: new Date(change.timestamp) })
							.where(eq(expenseSplits.id, change.entityId))
							.run();
					} else if (change.data) {
						const expenseId = change.data.expenseId as string;
						// Verify the expense belongs to a trip owned by this user
						const expense = tx.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId))).get();
						if (!expense) continue;

						const existing = tx.select().from(expenseSplits).where(eq(expenseSplits.id, change.entityId)).get();
						if (existing) {
							const existingUpdatedAt = existing.updatedAt ? existing.updatedAt.getTime() : 0;
							if (change.timestamp > existingUpdatedAt) {
								const updates: Record<string, unknown> = {
									updatedAt: new Date(change.timestamp),
									version: existing.version + 1
								};
								for (const [key, value] of Object.entries(change.data)) {
									if (key !== 'id' && key !== 'expenseId' && key !== 'createdAt') {
										updates[key] = value;
									}
								}
								tx.update(expenseSplits).set(updates).where(eq(expenseSplits.id, change.entityId)).run();
							}
						} else if (change.operation === 'create') {
							tx.insert(expenseSplits)
								.values({
									id: change.entityId,
									expenseId,
									memberId: change.data.memberId as string,
									amount: change.data.amount as number,
									deleted: 0,
									createdAt: new Date(change.timestamp),
									updatedAt: new Date(change.timestamp),
									version: 1
								})
								.run();
						}
					}
					break;
				}
				case 'settlement': {
					if (change.operation === 'delete') {
						tx.update(settlements)
							.set({ deleted: 1, updatedAt: new Date(change.timestamp) })
							.where(eq(settlements.id, change.entityId))
							.run();
					} else if (change.data) {
						const tripId = change.data.tripId as string;
						// Verify trip ownership
						const trip = tx.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).get();
						if (!trip) continue;

						const existing = tx.select().from(settlements).where(eq(settlements.id, change.entityId)).get();
						if (existing) {
							const existingUpdatedAt = existing.updatedAt ? existing.updatedAt.getTime() : 0;
							if (change.timestamp > existingUpdatedAt) {
								const updates: Record<string, unknown> = {
									updatedAt: new Date(change.timestamp),
									version: existing.version + 1
								};
								for (const [key, value] of Object.entries(change.data)) {
									if (key !== 'id' && key !== 'tripId' && key !== 'createdAt') {
										updates[key] = value;
									}
								}
								tx.update(settlements).set(updates).where(eq(settlements.id, change.entityId)).run();
							}
						} else if (change.operation === 'create') {
							tx.insert(settlements)
								.values({
									id: change.entityId,
									tripId,
									fromMemberId: change.data.fromMemberId as string,
									toMemberId: change.data.toMemberId as string,
									amount: change.data.amount as number,
									date: change.data.date ? new Date(change.data.date as number) : null,
									note: (change.data.note as string) || null,
									deleted: 0,
									createdAt: new Date(change.timestamp),
									updatedAt: new Date(change.timestamp),
									version: 1
								})
								.run();
						}
					}
					break;
				}
			}

			tx.insert(syncLog)
				.values({
					userId,
					entityType: change.entityType,
					entityId: change.entityId,
					operation: change.operation,
					timestamp: new Date(change.timestamp),
					clientId: 'default'
				})
				.run();
		}
	});
}

export async function getChangesSince(db: Db, sinceTimestamp: number, userId: number) {
	const since = new Date(sinceTimestamp);

	const changedTrips = db
		.select()
		.from(trips)
		.where(and(eq(trips.userId, userId), gt(trips.updatedAt, since)))
		.all();

	const changedExpenses = db
		.select()
		.from(expenses)
		.where(and(eq(expenses.userId, userId), gt(expenses.updatedAt, since)))
		.all();

	// Get trip currencies for any changed trips
	const tripIds = changedTrips.map((t) => t.id);
	let changedCurrencies: typeof tripCurrencies.$inferSelect[] = [];
	if (tripIds.length > 0) {
		changedCurrencies = db
			.select()
			.from(tripCurrencies)
			.where(gt(tripCurrencies.updatedAt, since))
			.all()
			.filter((tc) => {
				// Only include currencies for user's trips
				return changedTrips.some((t) => t.id === tc.tripId);
			});
	}

	// Get all trip IDs accessible to the user (owned trips)
	const allUserTrips = db.select({ id: trips.id }).from(trips).where(eq(trips.userId, userId)).all();
	const allUserTripIds = allUserTrips.map((t) => t.id);

	let changedMembers: typeof tripMembers.$inferSelect[] = [];
	let changedSplits: typeof expenseSplits.$inferSelect[] = [];
	let changedSettlements: typeof settlements.$inferSelect[] = [];

	if (allUserTripIds.length > 0) {
		// Trip members changed since timestamp, for user's trips
		changedMembers = db
			.select()
			.from(tripMembers)
			.where(and(inArray(tripMembers.tripId, allUserTripIds), gt(tripMembers.updatedAt, since)))
			.all();

		// Settlements changed since timestamp, for user's trips
		changedSettlements = db
			.select()
			.from(settlements)
			.where(and(inArray(settlements.tripId, allUserTripIds), gt(settlements.updatedAt, since)))
			.all();

		// Expense splits: get changed expenses in user's trips, then find splits for those expenses
		const allUserExpenses = db
			.select({ id: expenses.id })
			.from(expenses)
			.where(inArray(expenses.tripId, allUserTripIds))
			.all();
		const allUserExpenseIds = allUserExpenses.map((e) => e.id);

		if (allUserExpenseIds.length > 0) {
			changedSplits = db
				.select()
				.from(expenseSplits)
				.where(and(inArray(expenseSplits.expenseId, allUserExpenseIds), gt(expenseSplits.updatedAt, since)))
				.all();
		}
	}

	return {
		trips: changedTrips,
		expenses: changedExpenses,
		tripCurrencies: changedCurrencies,
		tripMembers: changedMembers,
		expenseSplits: changedSplits,
		settlements: changedSettlements
	};
}
