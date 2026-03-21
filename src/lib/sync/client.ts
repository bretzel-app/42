import { browser } from '$app/environment';
import type { Trip, Expense, TripCurrency, TripMember, ExpenseSplit, Settlement } from '$lib/types/index.js';
import {
	getAllTrips, putTrip,
	getAllExpenses, putExpense,
	putTripCurrency,
	getMembersByTrip, putMember,
	putExpenseSplit,
	getSettlementsByTrip, putSettlement,
	addToSyncQueue, getSyncQueue, clearSyncQueue,
	getMeta, setMeta
} from './idb.js';
import { mergeEntity } from './crdt.js';
import { loadTrips } from '$lib/stores/trips.js';
import { members } from '$lib/stores/members.js';
import { settlements } from '$lib/stores/settlements.js';

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

		const data: {
			trips: Trip[];
			expenses: Expense[];
			tripCurrencies: TripCurrency[];
			tripMembers: TripMember[];
			expenseSplits: ExpenseSplit[];
			settlements: Settlement[];
		} = await res.json();

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

			// Merge trip members
			if (data.tripMembers && data.tripMembers.length > 0) {
				// Group by tripId to efficiently load local members
				const tripIds = [...new Set(data.tripMembers.map((m) => m.tripId))];
				const localMemberMap = new Map<string, TripMember>();
				for (const tripId of tripIds) {
					const localMembers = await getMembersByTrip(tripId);
					for (const m of localMembers) {
						localMemberMap.set(m.id, m);
					}
				}
				const updatedMembers: TripMember[] = [];
				for (const remote of data.tripMembers) {
					const local = localMemberMap.get(remote.id);
					const merged = local ? mergeEntity(local, remote) : remote;
					await putMember(merged);
					updatedMembers.push(merged);
				}
				// Update in-memory store: replace any members that were synced
				if (updatedMembers.length > 0) {
					members.update((current) => {
						const syncedIds = new Set(updatedMembers.map((m) => m.id));
						const kept = current.filter((m) => !syncedIds.has(m.id));
						const active = updatedMembers.filter((m) => !m.deleted);
						return [...kept, ...active];
					});
				}
			}

			// Merge expense splits
			if (data.expenseSplits && data.expenseSplits.length > 0) {
				// ExpenseSplit store doesn't have a global in-memory store,
				// so we only update IDB here; UI components re-fetch as needed
				for (const remote of data.expenseSplits) {
					await putExpenseSplit(remote);
				}
			}

			// Merge settlements
			if (data.settlements && data.settlements.length > 0) {
				const tripIds = [...new Set(data.settlements.map((s) => s.tripId))];
				const localSettlementMap = new Map<string, Settlement>();
				for (const tripId of tripIds) {
					const localSettlements = await getSettlementsByTrip(tripId);
					for (const s of localSettlements) {
						localSettlementMap.set(s.id, s);
					}
				}
				const updatedSettlements: Settlement[] = [];
				for (const remote of data.settlements) {
					const local = localSettlementMap.get(remote.id);
					const merged = local ? mergeEntity(local, remote) : remote;
					await putSettlement(merged);
					updatedSettlements.push(merged);
				}
				// Update in-memory store
				if (updatedSettlements.length > 0) {
					settlements.update((current) => {
						const syncedIds = new Set(updatedSettlements.map((s) => s.id));
						const kept = current.filter((s) => !syncedIds.has(s.id));
						const active = updatedSettlements.filter((s) => !s.deleted);
						return [...kept, ...active];
					});
				}
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
