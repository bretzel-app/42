import { browser } from '$app/environment';
import type { Trip, Expense, TripCurrency } from '$lib/types/index.js';
import {
	getAllTrips, putTrip,
	getAllExpenses, putExpense,
	putTripCurrency,
	addToSyncQueue, getSyncQueue, clearSyncQueue,
	getMeta, setMeta
} from './idb.js';
import { mergeEntity } from './crdt.js';
import { loadTrips } from '$lib/stores/trips.js';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

let syncStatus: SyncStatus = 'synced';
let syncInterval: ReturnType<typeof setInterval> | null = null;
const statusListeners: Set<(status: SyncStatus) => void> = new Set();

export function onSyncStatusChange(listener: (status: SyncStatus) => void) {
	statusListeners.add(listener);
	return () => statusListeners.delete(listener);
}

function setStatus(status: SyncStatus) {
	syncStatus = status;
	statusListeners.forEach((l) => l(status));
}

export function getSyncStatus(): SyncStatus {
	return syncStatus;
}

async function pushChanges(): Promise<boolean> {
	let queue;
	try {
		queue = await getSyncQueue();
	} catch {
		return true;
	}
	if (queue.length === 0) return true;

	try {
		const res = await fetch('/api/sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ changes: queue })
		});

		if (res.ok) {
			await clearSyncQueue();
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

async function pullChanges(): Promise<void> {
	let lastSync = '0';
	try {
		lastSync = (await getMeta('lastSyncTimestamp')) || '0';
	} catch {
		// IDB unavailable
	}

	try {
		const res = await fetch(`/api/sync?since=${lastSync}`);
		if (!res.ok) return;

		const data: { trips: Trip[]; expenses: Expense[]; tripCurrencies: TripCurrency[] } = await res.json();

		try {
			// Merge trips
			const localTrips = await getAllTrips();
			const localTripMap = new Map(localTrips.map((t) => [t.id, t]));
			for (const remote of data.trips) {
				const local = localTripMap.get(remote.id);
				const merged = local ? mergeEntity(local, remote) : remote;
				await putTrip(merged);
			}

			// Merge expenses
			const localExpenses = await getAllExpenses();
			const localExpenseMap = new Map(localExpenses.map((e) => [e.id, e]));
			for (const remote of data.expenses) {
				const local = localExpenseMap.get(remote.id);
				const merged = local ? mergeEntity(local, remote) : remote;
				await putExpense(merged);
			}

			// Merge trip currencies (overwrite — server is authority)
			for (const tc of data.tripCurrencies) {
				await putTripCurrency(tc);
			}

			await setMeta('lastSyncTimestamp', String(Date.now()));
		} catch {
			// IDB write failed
		}
	} catch {
		// Offline
	}
}

export async function sync(): Promise<void> {
	if (!browser || !navigator.onLine) {
		setStatus('offline');
		return;
	}

	setStatus('syncing');

	try {
		const pushed = await pushChanges();
		if (!pushed) {
			setStatus('error');
			return;
		}

		await pullChanges();
		setStatus('synced');

		await loadTrips();
	} catch {
		setStatus('error');
	}
}

export function startSync() {
	if (!browser) return;
	sync();
	syncInterval = setInterval(sync, 30_000);
	window.addEventListener('online', () => sync());
	window.addEventListener('offline', () => setStatus('offline'));
}

export function stopSync() {
	if (syncInterval) {
		clearInterval(syncInterval);
		syncInterval = null;
	}
}
