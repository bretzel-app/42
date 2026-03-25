import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DATABASE_URL = process.env.DATABASE_URL || './data/42.db';

// Ensure the data directory exists
const dir = dirname(DATABASE_URL);
if (!existsSync(dir)) {
	mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(DATABASE_URL);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

// Disable foreign keys during schema setup to avoid constraint issues during migration
sqlite.pragma('foreign_keys = OFF');

// Auto-create tables on first run (new installs get full schema)
sqlite.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT NOT NULL DEFAULT '',
		display_name TEXT NOT NULL DEFAULT '',
		role TEXT NOT NULL DEFAULT 'user',
		password_hash TEXT,
		auth_provider TEXT NOT NULL DEFAULT 'password',
		provider_id TEXT,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		expires_at INTEGER NOT NULL,
		created_at INTEGER,
		user_agent TEXT,
		ip TEXT,
		last_used_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS trips (
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

	CREATE TABLE IF NOT EXISTS expenses (
		id TEXT PRIMARY KEY,
		trip_id TEXT NOT NULL REFERENCES trips(id),
		user_id INTEGER NOT NULL REFERENCES users(id),
		amount INTEGER NOT NULL,
		currency TEXT NOT NULL,
		exchange_rate TEXT NOT NULL DEFAULT '1',
		category_id TEXT NOT NULL,
		date INTEGER NOT NULL,
		note TEXT NOT NULL DEFAULT '',
		deleted INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		version INTEGER NOT NULL DEFAULT 1
	);

	CREATE TABLE IF NOT EXISTS trip_currencies (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		trip_id TEXT NOT NULL REFERENCES trips(id),
		currency_code TEXT NOT NULL,
		exchange_rate TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS sync_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		entity_type TEXT NOT NULL,
		entity_id TEXT NOT NULL,
		operation TEXT NOT NULL,
		timestamp INTEGER NOT NULL,
		client_id TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS api_keys (
		id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		name TEXT NOT NULL,
		key_hash TEXT NOT NULL,
		key_prefix TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		last_used_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS login_attempts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ip TEXT NOT NULL,
		email TEXT NOT NULL,
		success INTEGER NOT NULL,
		timestamp INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS user_preferences (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id),
		key TEXT NOT NULL,
		value TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS trip_collaborators (
		trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id),
		added_by INTEGER NOT NULL REFERENCES users(id),
		added_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS trip_members (
		id TEXT PRIMARY KEY,
		trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		user_id INTEGER REFERENCES users(id),
		added_by INTEGER NOT NULL REFERENCES users(id),
		deleted INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER,
		updated_at INTEGER,
		version INTEGER NOT NULL DEFAULT 1
	);

	CREATE TABLE IF NOT EXISTS expense_splits (
		id TEXT PRIMARY KEY,
		expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
		member_id TEXT NOT NULL REFERENCES trip_members(id),
		amount INTEGER NOT NULL,
		deleted INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER,
		updated_at INTEGER,
		version INTEGER NOT NULL DEFAULT 1
	);

	CREATE TABLE IF NOT EXISTS settlements (
		id TEXT PRIMARY KEY,
		trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
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
`);

// Create indexes
sqlite.exec(`
	CREATE INDEX IF NOT EXISTS trips_user_id_idx ON trips(user_id);
	CREATE INDEX IF NOT EXISTS trips_updated_at_idx ON trips(updated_at);
	CREATE INDEX IF NOT EXISTS expenses_trip_id_idx ON expenses(trip_id);
	CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON expenses(user_id);
	CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(date);
	CREATE INDEX IF NOT EXISTS expenses_updated_at_idx ON expenses(updated_at);
	CREATE UNIQUE INDEX IF NOT EXISTS trip_currencies_trip_code_unique ON trip_currencies(trip_id, currency_code);
	CREATE INDEX IF NOT EXISTS sync_log_timestamp_idx ON sync_log(timestamp);
	CREATE INDEX IF NOT EXISTS login_attempts_ip_timestamp_idx ON login_attempts(ip, timestamp);
	CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_key_unique ON user_preferences(user_id, key);
	CREATE UNIQUE INDEX IF NOT EXISTS trip_collaborators_trip_user_unique ON trip_collaborators(trip_id, user_id);
	CREATE INDEX IF NOT EXISTS trip_collaborators_user_id_idx ON trip_collaborators(user_id);
	CREATE INDEX IF NOT EXISTS trip_members_trip_id_idx ON trip_members(trip_id);
	CREATE INDEX IF NOT EXISTS trip_members_user_id_idx ON trip_members(user_id);
	CREATE INDEX IF NOT EXISTS expense_splits_expense_id_idx ON expense_splits(expense_id);
	CREATE INDEX IF NOT EXISTS expense_splits_member_id_idx ON expense_splits(member_id);
	CREATE INDEX IF NOT EXISTS settlements_trip_id_idx ON settlements(trip_id);
`);

// Add provider_id to users if not already present (OAuth support)
try {
	sqlite.prepare('ALTER TABLE users ADD COLUMN provider_id TEXT').run();
} catch {
	// Column already exists — safe to ignore
}

// Add paid_by_member_id to expenses if not already present
// SQLite does not support ADD COLUMN IF NOT EXISTS, so we use a try/catch
try {
	sqlite.prepare('ALTER TABLE expenses ADD COLUMN paid_by_member_id TEXT').run();
} catch {
	// Column already exists — safe to ignore
}

// Add split_expenses to trips if not already present
try {
	sqlite.prepare('ALTER TABLE trips ADD COLUMN split_expenses INTEGER NOT NULL DEFAULT 1').run();
} catch {
	// Column already exists — safe to ignore
}

// Data migration: if trip_members is empty but trip_collaborators has data,
// migrate collaborators to members (idempotent — only runs once)
const memberCount = (
	sqlite.prepare('SELECT COUNT(*) as count FROM trip_members').get() as { count: number }
).count;
const collaboratorCount = (
	sqlite.prepare('SELECT COUNT(*) as count FROM trip_collaborators').get() as { count: number }
).count;

if (memberCount === 0 && collaboratorCount > 0) {
	const now = Date.now();

	const insertMember = sqlite.prepare(`
		INSERT OR IGNORE INTO trip_members (id, trip_id, name, user_id, added_by, deleted, created_at, updated_at, version)
		VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)
	`);

	const getDisplayName = sqlite.prepare('SELECT display_name FROM users WHERE id = ?');

	// Auto-add trip owners as members for trips that have collaborators
	const tripsWithCollaborators = sqlite
		.prepare(
			`SELECT DISTINCT t.id as trip_id, t.user_id
			FROM trips t
			INNER JOIN trip_collaborators tc ON tc.trip_id = t.id`
		)
		.all() as { trip_id: string; user_id: number }[];

	for (const trip of tripsWithCollaborators) {
		const owner = getDisplayName.get(trip.user_id) as { display_name: string } | undefined;
		const ownerName = owner?.display_name || 'Trip Owner';
		insertMember.run(
			crypto.randomUUID(),
			trip.trip_id,
			ownerName,
			trip.user_id,
			trip.user_id,
			now,
			now
		);
	}

	// Migrate collaborators as members
	const collaborators = sqlite
		.prepare(
			`SELECT tc.trip_id, tc.user_id, tc.added_by, u.display_name
			FROM trip_collaborators tc
			INNER JOIN users u ON u.id = tc.user_id`
		)
		.all() as { trip_id: string; user_id: number; added_by: number; display_name: string }[];

	for (const collab of collaborators) {
		insertMember.run(
			crypto.randomUUID(),
			collab.trip_id,
			collab.display_name,
			collab.user_id,
			collab.added_by,
			now,
			now
		);
	}
}

// Re-enable foreign keys
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type Db = import('drizzle-orm/better-sqlite3').BetterSQLite3Database<typeof schema>;
export { sqlite };
