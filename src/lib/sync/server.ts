import type { Db } from '$lib/server/db/index.js';
import { trips, expenses, tripCurrencies, syncLog } from '$lib/server/db/schema.js';
import { eq, gt, and } from 'drizzle-orm';
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

	return {
		trips: changedTrips,
		expenses: changedExpenses,
		tripCurrencies: changedCurrencies
	};
}
