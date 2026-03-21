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
	paidByMemberId: string | null; // null = untracked (legacy)
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

export interface TripMember {
	id: string;
	tripId: string;
	name: string;
	userId: number | null;
	addedBy: number;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	version: number;
}

export interface ExpenseSplit {
	id: string;
	expenseId: string;
	memberId: string;
	amount: number; // cents in expense currency
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	version: number;
}

export interface Settlement {
	id: string;
	tripId: string;
	fromMemberId: string;
	toMemberId: string;
	amount: number; // cents in home currency
	date: Date;
	note: string;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	version: number;
}

export interface MemberBalance {
	memberId: string;
	memberName: string;
	totalPaid: number; // cents, home currency
	totalOwed: number; // cents, home currency
	settlementsSent: number; // cents
	settlementsReceived: number; // cents
	balance: number; // positive = still owed money, negative = still owes money
}

export interface SuggestedTransfer {
	fromMemberId: string;
	fromName: string;
	toMemberId: string;
	toName: string;
	amount: number; // cents, home currency
}

export interface SyncChange {
	entityType: 'trip' | 'expense' | 'tripCurrency' | 'tripMember' | 'expenseSplit' | 'settlement';
	entityId: string;
	operation: 'create' | 'update' | 'delete';
	timestamp: number;
	clientId: string;
	data?: Record<string, unknown>;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export type { UserPreferences } from './preferences.js';
export { DEFAULT_PREFERENCES, BOOLEAN_PREF_KEYS } from './preferences.js';
