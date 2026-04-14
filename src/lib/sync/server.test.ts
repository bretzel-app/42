import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema.js';
import { processSyncPush, getChangesSince } from './server.js';
import { eq } from 'drizzle-orm';
import type { SyncQueueItem } from './idb.js';

function createTestDb() {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = OFF');

	sqlite.exec(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL DEFAULT '',
			display_name TEXT NOT NULL DEFAULT '',
			role TEXT NOT NULL DEFAULT 'user',
			password_hash TEXT,
			auth_provider TEXT NOT NULL DEFAULT 'password',
			provider_id TEXT,
			created_at INTEGER NOT NULL
		);
		CREATE TABLE trips (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id),
			name TEXT NOT NULL,
			destination TEXT NOT NULL DEFAULT '',
			start_date INTEGER NOT NULL,
			end_date INTEGER NOT NULL,
			number_of_people INTEGER NOT NULL DEFAULT 1,
			total_budget INTEGER,
			home_currency TEXT NOT NULL DEFAULT 'EUR',
			split_expenses INTEGER NOT NULL DEFAULT 1,
			deleted INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			version INTEGER NOT NULL DEFAULT 1
		);
		CREATE TABLE expenses (
			id TEXT PRIMARY KEY,
			trip_id TEXT NOT NULL REFERENCES trips(id),
			user_id INTEGER NOT NULL REFERENCES users(id),
			amount INTEGER NOT NULL,
			currency TEXT NOT NULL,
			exchange_rate TEXT NOT NULL DEFAULT '1',
			category_id TEXT NOT NULL,
			date INTEGER NOT NULL,
			note TEXT NOT NULL DEFAULT '',
			paid_by_member_id TEXT,
			latitude REAL,
			longitude REAL,
			deleted INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			version INTEGER NOT NULL DEFAULT 1
		);
		CREATE TABLE trip_currencies (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			trip_id TEXT NOT NULL REFERENCES trips(id),
			currency_code TEXT NOT NULL,
			exchange_rate TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE UNIQUE INDEX trip_currencies_trip_code_unique ON trip_currencies(trip_id, currency_code);
		CREATE TABLE sync_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			entity_type TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			operation TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			client_id TEXT NOT NULL
		);
		CREATE TABLE trip_members (
			id TEXT PRIMARY KEY,
			trip_id TEXT NOT NULL REFERENCES trips(id),
			name TEXT NOT NULL,
			user_id INTEGER REFERENCES users(id),
			added_by INTEGER NOT NULL REFERENCES users(id),
			deleted INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER,
			updated_at INTEGER,
			version INTEGER NOT NULL DEFAULT 1
		);
		CREATE TABLE expense_splits (
			id TEXT PRIMARY KEY,
			expense_id TEXT NOT NULL REFERENCES expenses(id),
			member_id TEXT NOT NULL REFERENCES trip_members(id),
			amount INTEGER NOT NULL,
			deleted INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER,
			updated_at INTEGER,
			version INTEGER NOT NULL DEFAULT 1
		);
		CREATE TABLE settlements (
			id TEXT PRIMARY KEY,
			trip_id TEXT NOT NULL REFERENCES trips(id),
			from_member_id TEXT NOT NULL REFERENCES trip_members(id),
			to_member_id TEXT NOT NULL REFERENCES trip_members(id),
			amount INTEGER NOT NULL,
			date INTEGER,
			note TEXT,
			deleted INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER,
			updated_at INTEGER,
			version INTEGER NOT NULL DEFAULT 1
		);
		CREATE TABLE trip_collaborators (
			trip_id TEXT NOT NULL REFERENCES trips(id),
			user_id INTEGER NOT NULL REFERENCES users(id),
			added_by INTEGER NOT NULL REFERENCES users(id),
			added_at INTEGER NOT NULL
		);
	`);

	sqlite.pragma('foreign_keys = ON');

	// Create a test user
	sqlite.prepare('INSERT INTO users (email, display_name, created_at) VALUES (?, ?, ?)').run(
		'test@test.com',
		'Test User',
		Date.now()
	);

	return drizzle(sqlite, { schema });
}

const NOW = Date.now();

describe('processSyncPush', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	describe('trip sync', () => {
		it('creates a trip from sync queue with Date ISO string fields', async () => {
			// This is the exact format the client sends — Date objects serialized as ISO strings
			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-1',
					operation: 'create',
					data: {
						id: 'trip-1',
						userId: 0,
						name: 'Paris 2025',
						destination: 'Paris',
						startDate: '2025-06-01T00:00:00.000Z', // ISO string from JSON.stringify(Date)
						endDate: '2025-06-15T00:00:00.000Z',
						numberOfPeople: 2,
						totalBudget: 200000,
						homeCurrency: 'EUR',
						splitExpenses: true,
						deleted: false,
						createdAt: new Date(NOW).toISOString(),
						updatedAt: new Date(NOW).toISOString(),
						version: 1
					},
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const trip = db.select().from(schema.trips).where(eq(schema.trips.id, 'trip-1')).get();
			expect(trip).toBeDefined();
			expect(trip!.name).toBe('Paris 2025');
			expect(trip!.destination).toBe('Paris');
			expect(trip!.startDate).toBeInstanceOf(Date);
			expect(trip!.startDate.getTime()).toBeGreaterThan(0);
			expect(trip!.userId).toBe(1);
		});

		it('creates a trip from sync queue with numeric timestamp fields', async () => {
			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-2',
					operation: 'create',
					data: {
						id: 'trip-2',
						name: 'Tokyo 2025',
						destination: 'Tokyo',
						startDate: 1748736000000, // numeric timestamp
						endDate: 1749945600000,
						numberOfPeople: 1,
						totalBudget: null,
						homeCurrency: 'JPY',
						splitExpenses: false,
						deleted: false,
					},
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const trip = db.select().from(schema.trips).where(eq(schema.trips.id, 'trip-2')).get();
			expect(trip).toBeDefined();
			expect(trip!.name).toBe('Tokyo 2025');
			expect(trip!.startDate.getTime()).toBe(1748736000000);
		});

		it('updates an existing trip with newer timestamp', async () => {
			db.insert(schema.trips).values({
				id: 'trip-1',
				userId: 1,
				name: 'Old Name',
				destination: 'Nowhere',
				startDate: new Date('2025-06-01'),
				endDate: new Date('2025-06-15'),
				createdAt: new Date(NOW - 10000),
				updatedAt: new Date(NOW - 10000),
				version: 1
			}).run();

			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-1',
					operation: 'update',
					data: { name: 'New Name', destination: 'Somewhere' },
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const trip = db.select().from(schema.trips).where(eq(schema.trips.id, 'trip-1')).get();
			expect(trip!.name).toBe('New Name');
			expect(trip!.destination).toBe('Somewhere');
			expect(trip!.version).toBe(2);
		});

		it('rejects update from a different user', async () => {
			db.insert(schema.trips).values({
				id: 'trip-1',
				userId: 1,
				name: 'My Trip',
				destination: '',
				startDate: new Date('2025-06-01'),
				endDate: new Date('2025-06-15'),
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW),
				version: 1
			}).run();

			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-1',
					operation: 'update',
					data: { name: 'Hacked' },
					timestamp: NOW + 1000
				}
			];

			// User 2 tries to update user 1's trip
			await processSyncPush(db, changes, 2);

			const trip = db.select().from(schema.trips).where(eq(schema.trips.id, 'trip-1')).get();
			expect(trip!.name).toBe('My Trip'); // unchanged
		});

		it('updates a trip when data contains ISO string dates', async () => {
			db.insert(schema.trips).values({
				id: 'trip-1',
				userId: 1,
				name: 'Original',
				destination: '',
				startDate: new Date('2025-06-01'),
				endDate: new Date('2025-06-15'),
				createdAt: new Date(NOW - 10000),
				updatedAt: new Date(NOW - 10000),
				version: 1
			}).run();

			// The client sends dates as ISO strings (from JSON.stringify of Date objects)
			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-1',
					operation: 'update',
					data: {
						name: 'Updated',
						startDate: '2025-07-01T00:00:00.000Z',
						endDate: '2025-07-15T00:00:00.000Z',
						updatedAt: new Date(NOW).toISOString()
					},
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const trip = db.select().from(schema.trips).where(eq(schema.trips.id, 'trip-1')).get();
			expect(trip!.name).toBe('Updated');
			expect(trip!.startDate).toBeInstanceOf(Date);
			expect(trip!.startDate.getFullYear()).toBe(2025);
			expect(trip!.startDate.getMonth()).toBe(6); // July = 6
		});

		it('ignores update with older timestamp (LWW)', async () => {
			db.insert(schema.trips).values({
				id: 'trip-1',
				userId: 1,
				name: 'Current Name',
				destination: '',
				startDate: new Date('2025-06-01'),
				endDate: new Date('2025-06-15'),
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW),
				version: 2
			}).run();

			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-1',
					operation: 'update',
					data: { name: 'Stale Name' },
					timestamp: NOW - 5000 // older than server
				}
			];

			await processSyncPush(db, changes, 1);

			const trip = db.select().from(schema.trips).where(eq(schema.trips.id, 'trip-1')).get();
			expect(trip!.name).toBe('Current Name'); // unchanged
		});

		it('soft-deletes a trip', async () => {
			db.insert(schema.trips).values({
				id: 'trip-1',
				userId: 1,
				name: 'Delete Me',
				destination: '',
				startDate: new Date('2025-06-01'),
				endDate: new Date('2025-06-15'),
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW),
				version: 1
			}).run();

			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-1',
					operation: 'delete',
					timestamp: NOW + 1000
				}
			];

			await processSyncPush(db, changes, 1);

			const trip = db.select().from(schema.trips).where(eq(schema.trips.id, 'trip-1')).get();
			expect(trip!.deleted).toBe(true);
		});
	});

	describe('expense sync', () => {
		beforeEach(() => {
			db.insert(schema.trips).values({
				id: 'trip-1',
				userId: 1,
				name: 'Test Trip',
				destination: '',
				startDate: new Date('2025-06-01'),
				endDate: new Date('2025-06-15'),
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW),
				version: 1
			}).run();
		});

		it('creates an expense from sync queue with ISO date string', async () => {
			const changes: SyncQueueItem[] = [
				{
					entityType: 'expense',
					entityId: 'exp-1',
					operation: 'create',
					data: {
						id: 'exp-1',
						tripId: 'trip-1',
						amount: 2500,
						currency: 'EUR',
						exchangeRate: '1',
						categoryId: 'food',
						date: '2025-06-05T00:00:00.000Z', // ISO string
						note: 'Lunch',
						deleted: false,
					},
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const expense = db.select().from(schema.expenses).where(eq(schema.expenses.id, 'exp-1')).get();
			expect(expense).toBeDefined();
			expect(expense!.amount).toBe(2500);
			expect(expense!.note).toBe('Lunch');
			expect(expense!.date).toBeInstanceOf(Date);
			expect(expense!.date.getTime()).toBeGreaterThan(0);
		});

		it('creates an expense with geolocation', async () => {
			const changes: SyncQueueItem[] = [
				{
					entityType: 'expense',
					entityId: 'exp-geo',
					operation: 'create',
					data: {
						id: 'exp-geo',
						tripId: 'trip-1',
						amount: 1500,
						currency: 'EUR',
						exchangeRate: '1',
						categoryId: 'food',
						date: NOW,
						note: 'Geo expense',
						latitude: 48.8566,
						longitude: 2.3522,
					},
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const expense = db.select().from(schema.expenses).where(eq(schema.expenses.id, 'exp-geo')).get();
			expect(expense!.latitude).toBeCloseTo(48.8566);
			expect(expense!.longitude).toBeCloseTo(2.3522);
		});

		it('sanitizes invalid coordinates to null', async () => {
			const changes: SyncQueueItem[] = [
				{
					entityType: 'expense',
					entityId: 'exp-bad-geo',
					operation: 'create',
					data: {
						id: 'exp-bad-geo',
						tripId: 'trip-1',
						amount: 1000,
						currency: 'EUR',
						exchangeRate: '1',
						categoryId: 'food',
						date: NOW,
						note: '',
						latitude: 999,
						longitude: -999,
					},
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const expense = db.select().from(schema.expenses).where(eq(schema.expenses.id, 'exp-bad-geo')).get();
			expect(expense!.latitude).toBeNull();
			expect(expense!.longitude).toBeNull();
		});
	});

	describe('batch sync', () => {
		it('processes a trip and its expenses in one push', async () => {
			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-batch',
					operation: 'create',
					data: {
						name: 'Batch Trip',
						destination: 'Batch City',
						startDate: NOW,
						endDate: NOW + 86400000,
						numberOfPeople: 1,
						homeCurrency: 'EUR',
						splitExpenses: true,
					},
					timestamp: NOW
				},
				{
					entityType: 'expense',
					entityId: 'exp-batch-1',
					operation: 'create',
					data: {
						tripId: 'trip-batch',
						amount: 1000,
						currency: 'EUR',
						exchangeRate: '1',
						categoryId: 'food',
						date: NOW,
						note: 'Batch expense 1',
					},
					timestamp: NOW
				},
				{
					entityType: 'expense',
					entityId: 'exp-batch-2',
					operation: 'create',
					data: {
						tripId: 'trip-batch',
						amount: 2000,
						currency: 'EUR',
						exchangeRate: '1',
						categoryId: 'transport',
						date: NOW,
						note: 'Batch expense 2',
					},
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const trip = db.select().from(schema.trips).where(eq(schema.trips.id, 'trip-batch')).get();
			expect(trip).toBeDefined();

			const allExpenses = db.select().from(schema.expenses).all();
			expect(allExpenses).toHaveLength(2);
		});
	});

	describe('sync log', () => {
		it('logs all sync operations', async () => {
			const changes: SyncQueueItem[] = [
				{
					entityType: 'trip',
					entityId: 'trip-log',
					operation: 'create',
					data: {
						name: 'Log Test',
						destination: '',
						startDate: NOW,
						endDate: NOW + 86400000,
					},
					timestamp: NOW
				}
			];

			await processSyncPush(db, changes, 1);

			const logs = db.select().from(schema.syncLog).all();
			expect(logs).toHaveLength(1);
			expect(logs[0].entityType).toBe('trip');
			expect(logs[0].entityId).toBe('trip-log');
			expect(logs[0].operation).toBe('create');
			expect(logs[0].userId).toBe(1);
		});
	});
});

describe('getChangesSince', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	it('returns trips changed since timestamp', async () => {
		// Use timestamps at least 2 seconds apart — Drizzle stores as Unix seconds
		const old = NOW - 60000;
		const recent = NOW - 2000;

		db.insert(schema.trips).values({
			id: 'trip-old', userId: 1, name: 'Old', destination: '',
			startDate: new Date('2025-01-01'), endDate: new Date('2025-01-15'),
			createdAt: new Date(old), updatedAt: new Date(old), version: 1
		}).run();

		db.insert(schema.trips).values({
			id: 'trip-new', userId: 1, name: 'New', destination: '',
			startDate: new Date('2025-06-01'), endDate: new Date('2025-06-15'),
			createdAt: new Date(recent), updatedAt: new Date(recent), version: 1
		}).run();

		// Since timestamp well before both trips
		const result = await getChangesSince(db, old - 2000, 1);
		expect(result.trips).toHaveLength(2);

		// Since timestamp between old and new (2 seconds after old)
		const resultRecent = await getChangesSince(db, old + 2000, 1);
		expect(resultRecent.trips).toHaveLength(1);
		expect(resultRecent.trips[0].name).toBe('New');
	});

	it('returns empty for a different user', async () => {
		db.insert(schema.trips).values({
			id: 'trip-1', userId: 1, name: 'User 1 Trip', destination: '',
			startDate: new Date('2025-01-01'), endDate: new Date('2025-01-15'),
			createdAt: new Date(NOW), updatedAt: new Date(NOW), version: 1
		}).run();

		const result = await getChangesSince(db, 0, 2);
		expect(result.trips).toHaveLength(0);
	});

	it('returns expenses changed since timestamp', async () => {
		db.insert(schema.trips).values({
			id: 'trip-1', userId: 1, name: 'Trip', destination: '',
			startDate: new Date('2025-01-01'), endDate: new Date('2025-01-15'),
			createdAt: new Date(NOW), updatedAt: new Date(NOW), version: 1
		}).run();

		db.insert(schema.expenses).values({
			id: 'exp-1', tripId: 'trip-1', userId: 1, amount: 1000,
			currency: 'EUR', categoryId: 'food', date: new Date(NOW), note: 'Test',
			createdAt: new Date(NOW), updatedAt: new Date(NOW), version: 1
		}).run();

		// Use a since timestamp well before the expense (seconds precision)
		const result = await getChangesSince(db, NOW - 2000, 1);
		expect(result.expenses).toHaveLength(1);
		expect(result.expenses[0].amount).toBe(1000);
	});
});
