export interface Trip {
	id: string;
	name: string;
	destination: string;
	startDate: Date;
	endDate: Date;
	numberOfPeople: number;
	totalBudget: number | null; // cents
	homeCurrency: string;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	version: number;
	collaborators?: Collaborator[];
	isOwner?: boolean;
	isShared?: boolean;
}

export interface Collaborator {
	userId: number;
	displayName: string;
	email: string;
	addedAt: Date;
}

export interface Expense {
	id: string;
	tripId: string;
	amount: number; // cents in expense currency
	currency: string;
	exchangeRate: string; // decimal string
	categoryId: CategoryId;
	date: Date;
	note: string;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	version: number;
}

export interface TripCurrency {
	tripId: string;
	currencyCode: string;
	exchangeRate: string;
	updatedAt: Date;
}

export type CategoryId = 'food' | 'accommodation' | 'transport' | 'activities' | 'shopping' | 'misc';

export interface User {
	id: number;
	email: string;
	displayName: string;
	role: 'admin' | 'user';
	createdAt: Date;
}

export interface SyncChange {
	entityType: 'trip' | 'expense' | 'tripCurrency';
	entityId: string;
	operation: 'create' | 'update' | 'delete';
	timestamp: number;
	clientId: string;
	data?: Record<string, unknown>;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export type { UserPreferences } from './preferences.js';
export { DEFAULT_PREFERENCES, BOOLEAN_PREF_KEYS } from './preferences.js';
