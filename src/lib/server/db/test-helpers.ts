import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

/**
 * Create an in-memory SQLite database for testing.
 * Each test gets a fresh database.
 */
export function createTestDb() {
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
			created_at INTEGER NOT NULL
		);

		CREATE TABLE sessions (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id),
			expires_at INTEGER NOT NULL,
			created_at INTEGER,
			user_agent TEXT,
			ip TEXT,
			last_used_at INTEGER
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

		CREATE TABLE sync_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			entity_type TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			operation TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			client_id TEXT NOT NULL
		);

		CREATE TABLE api_keys (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id),
			name TEXT NOT NULL,
			key_hash TEXT NOT NULL,
			key_prefix TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			last_used_at INTEGER
		);

		CREATE TABLE login_attempts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ip TEXT NOT NULL,
			email TEXT NOT NULL,
			success INTEGER NOT NULL,
			timestamp INTEGER NOT NULL
		);

		CREATE TABLE user_preferences (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			key TEXT NOT NULL,
			value TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE UNIQUE INDEX user_preferences_user_key_unique ON user_preferences(user_id, key);
	`);

	const db = drizzle(sqlite, { schema });

	return { db, sqlite };
}
