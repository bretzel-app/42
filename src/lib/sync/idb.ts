import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import type { Trip, Expense, TripCurrency } from '$lib/types/index.js';

const DB_PREFIX = 'fortytwo';
const DB_VERSION = 1;

interface FortyTwoDB {
	trips: {
		key: string;
		value: Trip;
		indexes: {
			'by-updated': Date;
		};
	};
	expenses: {
		key: string;
		value: Expense;
		indexes: {
			'by-updated': Date;
			'by-tripId': string;
		};
	};
	tripCurrencies: {
		key: string; // tripId-currencyCode
		value: TripCurrency;
		indexes: {
			'by-tripId': string;
		};
	};
	syncQueue: {
		key: number;
		value: SyncQueueItem;
		indexes: {
			'by-timestamp': number;
		};
	};
	meta: {
		key: string;
		value: { key: string; value: string };
	};
}

export interface SyncQueueItem {
	id?: number;
	entityType: 'trip' | 'expense' | 'tripCurrency';
	entityId: string;
	operation: 'create' | 'update' | 'delete';
	data?: Record<string, unknown>;
	timestamp: number;
}

let dbPromise: Promise<IDBPDatabase<FortyTwoDB>> | null = null;
let currentUserId: number | null = null;

export function initDb(userId: number): void {
	if (currentUserId !== userId) {
		dbPromise = null;
		currentUserId = userId;
	}
}

export function getDb(): Promise<IDBPDatabase<FortyTwoDB>> {
	if (!dbPromise) {
		const dbName = currentUserId ? `${DB_PREFIX}-${currentUserId}` : DB_PREFIX;
		dbPromise = openDB<FortyTwoDB>(dbName, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('trips')) {
					const tripStore = db.createObjectStore('trips', { keyPath: 'id' });
					tripStore.createIndex('by-updated', 'updatedAt');
				}

				if (!db.objectStoreNames.contains('expenses')) {
					const expenseStore = db.createObjectStore('expenses', { keyPath: 'id' });
					expenseStore.createIndex('by-updated', 'updatedAt');
					expenseStore.createIndex('by-tripId', 'tripId');
				}

				if (!db.objectStoreNames.contains('tripCurrencies')) {
					const currStore = db.createObjectStore('tripCurrencies', {
						keyPath: ['tripId', 'currencyCode']
					});
					currStore.createIndex('by-tripId', 'tripId');
				}

				if (!db.objectStoreNames.contains('syncQueue')) {
					const syncStore = db.createObjectStore('syncQueue', {
						keyPath: 'id',
						autoIncrement: true
					});
					syncStore.createIndex('by-timestamp', 'timestamp');
				}

				if (!db.objectStoreNames.contains('meta')) {
					db.createObjectStore('meta', { keyPath: 'key' });
				}
			}
		});
	}
	return dbPromise;
}

export async function destroyDb(): Promise<void> {
	if (dbPromise) {
		const db = await dbPromise;
		db.close();
		dbPromise = null;
	}
	if (currentUserId) {
		await deleteDB(`${DB_PREFIX}-${currentUserId}`);
		currentUserId = null;
	}
}

// Trip operations
export async function getAllTrips(): Promise<Trip[]> {
	const db = await getDb();
	return db.getAll('trips');
}

export async function getTrip(id: string): Promise<Trip | undefined> {
	const db = await getDb();
	return db.get('trips', id);
}

export async function putTrip(trip: Trip): Promise<void> {
	const db = await getDb();
	await db.put('trips', trip);
}

export async function deleteTripFromIdb(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('trips', id);
}

// Expense operations
export async function getAllExpenses(): Promise<Expense[]> {
	const db = await getDb();
	return db.getAll('expenses');
}

export async function getExpensesByTrip(tripId: string): Promise<Expense[]> {
	const db = await getDb();
	return db.getAllFromIndex('expenses', 'by-tripId', tripId);
}

export async function putExpense(expense: Expense): Promise<void> {
	const db = await getDb();
	await db.put('expenses', expense);
}

export async function deleteExpenseFromIdb(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('expenses', id);
}

// TripCurrency operations
export async function getTripCurrencies(tripId: string): Promise<TripCurrency[]> {
	const db = await getDb();
	return db.getAllFromIndex('tripCurrencies', 'by-tripId', tripId);
}

export async function putTripCurrency(tc: TripCurrency): Promise<void> {
	const db = await getDb();
	await db.put('tripCurrencies', tc);
}

// Sync queue operations
export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
	const db = await getDb();
	await db.add('syncQueue', item as SyncQueueItem);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
	const db = await getDb();
	return db.getAll('syncQueue');
}

export async function clearSyncQueue(): Promise<void> {
	const db = await getDb();
	await db.clear('syncQueue');
}

export async function removeSyncQueueItem(id: number): Promise<void> {
	const db = await getDb();
	await db.delete('syncQueue', id);
}

// Meta operations
export async function getMeta(key: string): Promise<string | undefined> {
	const db = await getDb();
	const result = await db.get('meta', key);
	return result?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
	const db = await getDb();
	await db.put('meta', { key, value });
}
