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
import { getSharedTripIds } from '$lib/server/collaborators.js';

/** Columns stored as integer timestamps in SQLite — values must be Date objects for Drizzle */
const TIMESTAMP_FIELDS = new Set(['startDate', 'endDate', 'date', 'updatedAt', 'createdAt']);

/** Coerce a sync queue value to a Date if the field is a timestamp column.
 *  Returns undefined for invalid dates — callers should skip the field to avoid
 *  violating NOT NULL constraints on columns like startDate/endDate. */
function coerceDate(key: string, value: unknown): unknown {
	if (TIMESTAMP_FIELDS.has(key) && value != null) {
		const d = value instanceof Date ? value : new Date(value as string | number);
		return isNaN(d.getTime()) ? undefined : d;
	}
	return value;
}

function sanitizeCoords(lat: unknown, lng: unknown): { latitude: number | null; longitude: number | null } {
	const latNum = typeof lat === 'number' ? lat : Number(lat);
	const lngNum = typeof lng === 'number' ? lng : Number(lng);
	if (Number.isFinite(latNum) && Number.isFinite(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
		return { latitude: latNum, longitude: lngNum };
	}
	return { latitude: null, longitude: null };
}

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
									if (key !== 'id' && key !== 'userId' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'version') {
										const coerced = coerceDate(key, value);
										if (coerced !== undefined) updates[key] = coerced;
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
									splitExpenses: (change.data.splitExpenses as boolean) ?? true,
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
									if (key !== 'id' && key !== 'userId' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'version' && key !== 'latitude' && key !== 'longitude') {
										const coerced = coerceDate(key, value);
										if (coerced !== undefined) updates[key] = coerced;
									}
								}
								if ('latitude' in change.data || 'longitude' in change.data) {
									const coords = sanitizeCoords(change.data.latitude, change.data.longitude);
									updates.latitude = coords.latitude;
									updates.longitude = coords.longitude;
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
									...sanitizeCoords(change.data.latitude, change.data.longitude),
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
									if (key !== 'id' && key !== 'tripId' && key !== 'addedBy' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'version') {
										const coerced = coerceDate(key, value);
										if (coerced !== undefined) updates[key] = coerced;
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
						// Verify the split belongs to an expense in a trip the user can access
						const splitToDelete = tx.select().from(expenseSplits).where(eq(expenseSplits.id, change.entityId)).get();
						if (!splitToDelete) break;
						const splitExpense = tx.select().from(expenses).where(eq(expenses.id, splitToDelete.expenseId)).get();
						if (!splitExpense) break;
						const splitTrip = tx.select().from(trips).where(eq(trips.id, splitExpense.tripId)).get();
						if (!splitTrip || splitTrip.userId !== userId) break;
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
									if (key !== 'id' && key !== 'expenseId' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'version') {
										const coerced = coerceDate(key, value);
										if (coerced !== undefined) updates[key] = coerced;
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
						// Verify the settlement belongs to a trip the user can access
						const settlementToDelete = tx.select().from(settlements).where(eq(settlements.id, change.entityId)).get();
						if (!settlementToDelete) break;
						const settlementTrip = tx.select().from(trips).where(eq(trips.id, settlementToDelete.tripId)).get();
						if (!settlementTrip || settlementTrip.userId !== userId) break;
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
									if (key !== 'id' && key !== 'tripId' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'version') {
										const coerced = coerceDate(key, value);
										if (coerced !== undefined) updates[key] = coerced;
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

	// Get shared trip IDs (where user is a member but not owner)
	const sharedTripIds = getSharedTripIds(userId);

	const changedTrips = db
		.select()
		.from(trips)
		.where(and(eq(trips.userId, userId), gt(trips.updatedAt, since)))
		.all();

	// Also fetch shared trips that changed
	let changedSharedTrips: typeof trips.$inferSelect[] = [];
	if (sharedTripIds.length > 0) {
		changedSharedTrips = db
			.select()
			.from(trips)
			.where(and(inArray(trips.id, sharedTripIds), gt(trips.updatedAt, since)))
			.all();
	}

	const allChangedTrips = [...changedTrips, ...changedSharedTrips];

	const changedExpenses = db
		.select()
		.from(expenses)
		.where(and(eq(expenses.userId, userId), gt(expenses.updatedAt, since)))
		.all();

	// Also fetch expenses from shared trips
	let changedSharedExpenses: typeof expenses.$inferSelect[] = [];
	if (sharedTripIds.length > 0) {
		changedSharedExpenses = db
			.select()
			.from(expenses)
			.where(and(inArray(expenses.tripId, sharedTripIds), gt(expenses.updatedAt, since)))
			.all();
	}

	const allChangedExpenses = [...changedExpenses, ...changedSharedExpenses];
	// Deduplicate by id
	const expenseMap = new Map(allChangedExpenses.map(e => [e.id, e]));
	const dedupedExpenses = [...expenseMap.values()];

	// Get trip currencies for any changed trips
	const allChangedTripIds = allChangedTrips.map((t) => t.id);
	let changedCurrencies: typeof tripCurrencies.$inferSelect[] = [];
	if (allChangedTripIds.length > 0) {
		changedCurrencies = db
			.select()
			.from(tripCurrencies)
			.where(gt(tripCurrencies.updatedAt, since))
			.all()
			.filter((tc) => {
				return allChangedTrips.some((t) => t.id === tc.tripId);
			});
	}

	// Get all trip IDs accessible to the user (owned + shared)
	const allUserTrips = db.select({ id: trips.id }).from(trips).where(eq(trips.userId, userId)).all();
	const allUserTripIds = [...new Set([...allUserTrips.map((t) => t.id), ...sharedTripIds])];

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
		trips: allChangedTrips,
		expenses: dedupedExpenses,
		tripCurrencies: changedCurrencies,
		tripMembers: changedMembers,
		expenseSplits: changedSplits,
		settlements: changedSettlements
	};
}
