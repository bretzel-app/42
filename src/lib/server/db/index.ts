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
`);

// Re-enable foreign keys
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type Db = import('drizzle-orm/better-sqlite3').BetterSQLite3Database<typeof schema>;
export { sqlite };
