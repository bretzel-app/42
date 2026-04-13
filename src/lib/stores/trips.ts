import { writable, derived } from 'svelte/store';
import type { Trip } from '$lib/types/index.js';
import { showToast } from './toast.js';
import { addToSyncQueue, getAllTrips, putTrip, deleteTripFromIdb } from '$lib/sync/idb.js';
import { v4 as uuid } from 'uuid';

export const trips = writable<Trip[]>([]);
export const tripsLoaded = writable(false);

export const activeTrips = derived(trips, ($trips) =>
	$trips
		.filter((t) => !t.deleted)
		.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
);

export async function loadTrips() {
	tripsLoaded.set(false);

	let hasIdbData = false;
	try {
		// Load from IDB first for instant display
		const idbTrips = await getAllTrips();
		if (idbTrips.length > 0) {
			trips.set(idbTrips.filter((t) => !t.deleted));
			hasIdbData = true;
		}
	} catch {
		// IDB unavailable
	}

	// Show IDB data immediately if available; otherwise wait for server
	if (hasIdbData) tripsLoaded.set(true);

	// Then fetch fresh data from server in the background
	try {
		const res = await fetch('/api/trips');
		if (res.ok) {
			const serverTrips: Trip[] = await res.json();
			trips.set(serverTrips.filter((t) => !t.deleted));
			// Update IDB
			for (const trip of serverTrips) {
				try { await putTrip(trip); } catch { /* IDB unavailable */ }
			}
		}
	} catch {
		// Offline — IDB data stands
	}

	tripsLoaded.set(true);
}

export async function createTrip(data: {
	name: string;
	destination?: string;
	startDate: Date;
	endDate: Date;
	numberOfPeople?: number;
	totalBudget?: number | null;
	homeCurrency?: string;
	splitExpenses?: boolean;
}): Promise<Trip | null> {
	const now = new Date();
	const trip: Trip = {
		id: uuid(),
		userId: 0, // placeholder; overwritten by server response
		name: data.name,
		destination: data.destination || '',
		startDate: data.startDate,
		endDate: data.endDate,
		numberOfPeople: data.numberOfPeople || 1,
		totalBudget: data.totalBudget ?? null,
		homeCurrency: data.homeCurrency || 'EUR',
		splitExpenses: data.splitExpenses ?? true,
		deleted: false,
		createdAt: now,
		updatedAt: now,
		version: 1
	};

	// Optimistic update
	trips.update((t) => [trip, ...t]);
	try { await putTrip(trip); } catch { /* IDB unavailable */ }

	try {
		const res = await fetch('/api/trips', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(trip)
		});
		if (res.ok) {
			const serverTrip = await res.json();
			trips.update((t) => t.map((x) => (x.id === trip.id ? serverTrip : x)));
			try { await putTrip(serverTrip); } catch { /* IDB unavailable */ }
			return serverTrip;
		}
	} catch {
		// Offline — queue for sync
		await addToSyncQueue({
			entityType: 'trip',
			entityId: trip.id,
			operation: 'create',
			data: trip as unknown as Record<string, unknown>,
			timestamp: now.getTime()
		});
		showToast('Trip saved offline', 'info');
	}
	return trip;
}

export async function updateTrip(id: string, data: Partial<Trip>): Promise<void> {
	const now = new Date();
	const updates = { ...data, updatedAt: now };

	let optimisticTrip: Trip | undefined;
	trips.update((t) => t.map((x) => {
		if (x.id === id) {
			optimisticTrip = { ...x, ...updates };
			return optimisticTrip;
		}
		return x;
	}));

	// Persist optimistic update to IDB so it survives navigation while offline
	if (optimisticTrip) {
		try { await putTrip(optimisticTrip); } catch { /* IDB unavailable */ }
	}

	try {
		const res = await fetch(`/api/trips/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});
		if (res.ok) {
			const serverTrip = await res.json();
			trips.update((t) => t.map((x) => (x.id === id ? serverTrip : x)));
			try { await putTrip(serverTrip); } catch { /* IDB unavailable */ }
		}
	} catch {
		await addToSyncQueue({
			entityType: 'trip',
			entityId: id,
			operation: 'update',
			data: updates as unknown as Record<string, unknown>,
			timestamp: now.getTime()
		});
	}
}

export async function deleteTrip(id: string): Promise<void> {
	trips.update((t) => t.filter((x) => x.id !== id));
	try { await deleteTripFromIdb(id); } catch { /* IDB unavailable */ }

	try {
		const res = await fetch(`/api/trips/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			showToast('Failed to delete trip', 'error');
		}
	} catch {
		await addToSyncQueue({
			entityType: 'trip',
			entityId: id,
			operation: 'delete',
			timestamp: Date.now()
		});
	}
}
