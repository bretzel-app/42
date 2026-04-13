import { writable, derived } from 'svelte/store';
import type { Expense } from '$lib/types/index.js';
import { showToast } from './toast.js';
import { addToSyncQueue, getExpensesByTrip, putExpense, deleteExpenseFromIdb } from '$lib/sync/idb.js';
import { v4 as uuid } from 'uuid';

export const expenses = writable<Expense[]>([]);
export const expensesLoaded = writable(false);
export const currentTripId = writable<string | null>(null);

export const activeExpenses = derived(expenses, ($expenses) =>
	$expenses
		.filter((e) => !e.deleted)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
);

export async function loadExpenses(tripId: string) {
	currentTripId.set(tripId);

	let hasIdbData = false;
	try {
		const idbExpenses = await getExpensesByTrip(tripId);
		if (idbExpenses.length > 0) {
			expenses.set(idbExpenses.filter((e) => !e.deleted));
			hasIdbData = true;
		}
	} catch {
		// IDB unavailable
	}

	// Show IDB data immediately if available; otherwise wait for server
	if (hasIdbData) expensesLoaded.set(true);

	// Then fetch fresh data from server in the background
	try {
		const res = await fetch(`/api/trips/${tripId}/expenses`);
		if (res.ok) {
			const serverExpenses: Expense[] = await res.json();
			expenses.set(serverExpenses.filter((e) => !e.deleted));
			for (const exp of serverExpenses) {
				try { await putExpense(exp); } catch { /* IDB unavailable */ }
			}
		}
	} catch {
		// Offline
	}

	expensesLoaded.set(true);
}

export async function createExpense(data: {
	tripId: string;
	amount: number;
	currency: string;
	exchangeRate?: string;
	categoryId: string;
	date: Date;
	note?: string;
	paidByMemberId?: string | null;
	latitude?: number | null;
	longitude?: number | null;
	splits?: Array<{ memberId: string; amount: number }>;
}): Promise<Expense | null> {
	const now = new Date();
	const expense: Expense = {
		id: uuid(),
		tripId: data.tripId,
		amount: data.amount,
		currency: data.currency,
		exchangeRate: data.exchangeRate || '1',
		categoryId: data.categoryId as Expense['categoryId'],
		date: data.date,
		note: data.note || '',
		paidByMemberId: data.paidByMemberId ?? null,
		latitude: data.latitude ?? null,
		longitude: data.longitude ?? null,
		deleted: false,
		createdAt: now,
		updatedAt: now,
		version: 1
	};

	expenses.update((e) => [expense, ...e]);
	try { await putExpense(expense); } catch { /* IDB unavailable */ }

	try {
		const res = await fetch(`/api/trips/${data.tripId}/expenses`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...expense, splits: data.splits })
		});
		if (res.ok) {
			const serverExpense = await res.json();
			expenses.update((e) => e.map((x) => (x.id === expense.id ? serverExpense : x)));
			try { await putExpense(serverExpense); } catch { /* IDB unavailable */ }
			return serverExpense;
		}
	} catch {
		await addToSyncQueue({
			entityType: 'expense',
			entityId: expense.id,
			operation: 'create',
			data: expense as unknown as Record<string, unknown>,
			timestamp: now.getTime()
		});
		showToast('Expense saved offline', 'info');
	}
	return expense;
}

export async function updateExpense(
	tripId: string,
	id: string,
	data: Partial<Expense> & { splits?: Array<{ memberId: string; amount: number }> }
): Promise<void> {
	const now = new Date();
	const updates = { ...data, updatedAt: now };

	let optimisticExpense: Expense | undefined;
	expenses.update((e) => e.map((x) => {
		if (x.id === id) {
			optimisticExpense = { ...x, ...updates };
			return optimisticExpense;
		}
		return x;
	}));

	// Persist optimistic update to IDB so it survives navigation while offline
	if (optimisticExpense) {
		try { await putExpense(optimisticExpense); } catch { /* IDB unavailable */ }
	}

	try {
		const res = await fetch(`/api/trips/${tripId}/expenses/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});
		if (res.ok) {
			const serverExpense = await res.json();
			expenses.update((e) => e.map((x) => (x.id === id ? serverExpense : x)));
			try { await putExpense(serverExpense); } catch { /* IDB unavailable */ }
		}
	} catch {
		await addToSyncQueue({
			entityType: 'expense',
			entityId: id,
			operation: 'update',
			data: updates as unknown as Record<string, unknown>,
			timestamp: now.getTime()
		});
	}
}

export async function deleteExpense(tripId: string, id: string): Promise<void> {
	expenses.update((e) => e.filter((x) => x.id !== id));
	try { await deleteExpenseFromIdb(id); } catch { /* IDB unavailable */ }

	try {
		const res = await fetch(`/api/trips/${tripId}/expenses/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			showToast('Failed to delete expense', 'error');
		}
	} catch {
		await addToSyncQueue({
			entityType: 'expense',
			entityId: id,
			operation: 'delete',
			timestamp: Date.now()
		});
	}
}
