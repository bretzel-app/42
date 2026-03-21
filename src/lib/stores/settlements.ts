import { writable, derived } from 'svelte/store';
import type { Settlement } from '$lib/types/index.js';
import { showToast } from './toast.js';
import { addToSyncQueue, getSettlementsByTrip, putSettlement } from '$lib/sync/idb.js';
import { v4 as uuid } from 'uuid';

export const settlements = writable<Settlement[]>([]);
export const settlementsLoaded = writable(false);

export const activeSettlements = derived(settlements, ($settlements) =>
	$settlements
		.filter((s) => !s.deleted)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
);

export async function loadSettlements(tripId: string) {
	try {
		const idbSettlements = await getSettlementsByTrip(tripId);
		if (idbSettlements.length > 0) {
			settlements.set(idbSettlements.filter((s) => !s.deleted));
		}
	} catch {
		// IDB unavailable
	}

	try {
		const res = await fetch(`/api/trips/${tripId}/settlements`);
		if (res.ok) {
			const serverSettlements: Settlement[] = await res.json();
			settlements.set(serverSettlements.filter((s) => !s.deleted));
			for (const settlement of serverSettlements) {
				try { await putSettlement(settlement); } catch { /* IDB unavailable */ }
			}
		}
	} catch {
		// Offline
	}

	settlementsLoaded.set(true);
}

export async function createSettlement(data: {
	tripId: string;
	fromMemberId: string;
	toMemberId: string;
	amount: number;
	date: Date;
	note?: string;
}): Promise<Settlement | null> {
	const now = new Date();
	const settlement: Settlement = {
		id: uuid(),
		tripId: data.tripId,
		fromMemberId: data.fromMemberId,
		toMemberId: data.toMemberId,
		amount: data.amount,
		date: data.date,
		note: data.note || '',
		deleted: false,
		createdAt: now,
		updatedAt: now,
		version: 1
	};

	settlements.update((s) => [settlement, ...s]);
	try { await putSettlement(settlement); } catch { /* IDB unavailable */ }

	try {
		const res = await fetch(`/api/trips/${data.tripId}/settlements`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(settlement)
		});
		if (res.ok) {
			const serverSettlement: Settlement = await res.json();
			settlements.update((s) => s.map((x) => (x.id === settlement.id ? serverSettlement : x)));
			try { await putSettlement(serverSettlement); } catch { /* IDB unavailable */ }
			return serverSettlement;
		} else {
			settlements.update((s) => s.filter((x) => x.id !== settlement.id));
			showToast('Failed to record settlement', 'error');
			return null;
		}
	} catch {
		await addToSyncQueue({
			entityType: 'settlement',
			entityId: settlement.id,
			operation: 'create',
			data: settlement as unknown as Record<string, unknown>,
			timestamp: now.getTime()
		});
		showToast('Settlement saved offline', 'info');
	}
	return settlement;
}

export async function removeSettlement(settlementId: string, tripId: string): Promise<void> {
	settlements.update((s) => s.filter((x) => x.id !== settlementId));

	try {
		const res = await fetch(`/api/trips/${tripId}/settlements/${settlementId}`, { method: 'DELETE' });
		if (!res.ok) {
			showToast('Failed to remove settlement', 'error');
		}
	} catch {
		await addToSyncQueue({
			entityType: 'settlement',
			entityId: settlementId,
			operation: 'delete',
			timestamp: Date.now()
		});
	}
}
