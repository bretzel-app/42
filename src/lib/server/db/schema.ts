import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull().default(''),
	displayName: text('display_name').notNull().default(''),
	role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
	passwordHash: text('password_hash'),
	authProvider: text('auth_provider').notNull().default('password'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.references(() => users.id)
		.notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }),
	userAgent: text('user_agent'),
	ip: text('ip'),
	lastUsedAt: integer('last_used_at', { mode: 'timestamp' })
});

export const trips = sqliteTable(
	'trips',
	{
		id: text('id').primaryKey(),
		userId: integer('user_id')
			.references(() => users.id)
			.notNull(),
		name: text('name').notNull(),
		destination: text('destination').notNull().default(''),
		startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
		endDate: integer('end_date', { mode: 'timestamp' }).notNull(),
		numberOfPeople: integer('number_of_people').notNull().default(1),
		totalBudget: integer('total_budget'),
		homeCurrency: text('home_currency').notNull().default('EUR'),
		splitExpenses: integer('split_expenses', { mode: 'boolean' }).default(true).notNull(),
		deleted: integer('deleted', { mode: 'boolean' }).default(false).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
		version: integer('version').default(1).notNull()
	},
	(table) => [
		index('trips_user_id_idx').on(table.userId),
		index('trips_updated_at_idx').on(table.updatedAt)
	]
);

export const expenses = sqliteTable(
	'expenses',
	{
		id: text('id').primaryKey(),
		tripId: text('trip_id')
			.references(() => trips.id)
			.notNull(),
		userId: integer('user_id')
			.references(() => users.id)
			.notNull(),
		amount: integer('amount').notNull(),
		currency: text('currency').notNull(),
		exchangeRate: text('exchange_rate').notNull().default('1'),
		categoryId: text('category_id').notNull(),
		date: integer('date', { mode: 'timestamp' }).notNull(),
		note: text('note').default('').notNull(),
		paidByMemberId: text('paid_by_member_id'),
		deleted: integer('deleted', { mode: 'boolean' }).default(false).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
		version: integer('version').default(1).notNull()
	},
	(table) => [
		index('expenses_trip_id_idx').on(table.tripId),
		index('expenses_user_id_idx').on(table.userId),
		index('expenses_date_idx').on(table.date),
		index('expenses_updated_at_idx').on(table.updatedAt)
	]
);

export const tripCurrencies = sqliteTable(
	'trip_currencies',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tripId: text('trip_id')
			.references(() => trips.id)
			.notNull(),
		currencyCode: text('currency_code').notNull(),
		exchangeRate: text('exchange_rate').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		uniqueIndex('trip_currencies_trip_code_unique').on(table.tripId, table.currencyCode)
	]
);

export const syncLog = sqliteTable(
	'sync_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.references(() => users.id)
			.notNull(),
		entityType: text('entity_type').notNull(),
		entityId: text('entity_id').notNull(),
		operation: text('operation').notNull(),
		timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
		clientId: text('client_id').notNull()
	},
	(table) => [index('sync_log_timestamp_idx').on(table.timestamp)]
);

export const apiKeys = sqliteTable('api_keys', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.references(() => users.id)
		.notNull(),
	name: text('name').notNull(),
	keyHash: text('key_hash').notNull(),
	keyPrefix: text('key_prefix').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	lastUsedAt: integer('last_used_at', { mode: 'timestamp' })
});

export const loginAttempts = sqliteTable(
	'login_attempts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ip: text('ip').notNull(),
		email: text('email').notNull(),
		success: integer('success', { mode: 'boolean' }).notNull(),
		timestamp: integer('timestamp', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('login_attempts_ip_timestamp_idx').on(table.ip, table.timestamp)]
);

export const tripCollaborators = sqliteTable(
	'trip_collaborators',
	{
		tripId: text('trip_id')
			.references(() => trips.id, { onDelete: 'cascade' })
			.notNull(),
		userId: integer('user_id')
			.references(() => users.id)
			.notNull(),
		addedBy: integer('added_by')
			.references(() => users.id)
			.notNull(),
		addedAt: integer('added_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [
		uniqueIndex('trip_collaborators_trip_user_unique').on(table.tripId, table.userId),
		index('trip_collaborators_user_id_idx').on(table.userId)
	]
);

export const userPreferences = sqliteTable(
	'user_preferences',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.references(() => users.id)
			.notNull(),
		key: text('key').notNull(),
		value: text('value').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [uniqueIndex('user_preferences_user_key_unique').on(table.userId, table.key)]
);

export const tripMembers = sqliteTable(
	'trip_members',
	{
		id: text('id').primaryKey(),
		tripId: text('trip_id')
			.references(() => trips.id, { onDelete: 'cascade' })
			.notNull(),
		name: text('name').notNull(),
		userId: integer('user_id').references(() => users.id),
		addedBy: integer('added_by')
			.references(() => users.id)
			.notNull(),
		deleted: integer('deleted').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' }),
		version: integer('version').notNull().default(1)
	},
	(table) => [
		index('trip_members_trip_id_idx').on(table.tripId),
		index('trip_members_user_id_idx').on(table.userId)
	]
);

export const expenseSplits = sqliteTable(
	'expense_splits',
	{
		id: text('id').primaryKey(),
		expenseId: text('expense_id')
			.references(() => expenses.id, { onDelete: 'cascade' })
			.notNull(),
		memberId: text('member_id')
			.references(() => tripMembers.id)
			.notNull(),
		amount: integer('amount').notNull(),
		deleted: integer('deleted').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' }),
		version: integer('version').notNull().default(1)
	},
	(table) => [
		index('expense_splits_expense_id_idx').on(table.expenseId),
		index('expense_splits_member_id_idx').on(table.memberId)
	]
);

export const settlements = sqliteTable(
	'settlements',
	{
		id: text('id').primaryKey(),
		tripId: text('trip_id')
			.references(() => trips.id, { onDelete: 'cascade' })
			.notNull(),
		fromMemberId: text('from_member_id')
			.references(() => tripMembers.id)
			.notNull(),
		toMemberId: text('to_member_id')
			.references(() => tripMembers.id)
			.notNull(),
		amount: integer('amount').notNull(),
		date: integer('date', { mode: 'timestamp' }),
		note: text('note'),
		deleted: integer('deleted').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' }),
		version: integer('version').notNull().default(1)
	},
	(table) => [index('settlements_trip_id_idx').on(table.tripId)]
);
