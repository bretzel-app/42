import { writable, derived } from 'svelte/store';
import type { TripMember } from '$lib/types/index.js';
import { showToast } from './toast.js';
import { addToSyncQueue, getMembersByTrip, putMember } from '$lib/sync/idb.js';
import { v4 as uuid } from 'uuid';

export const members = writable<TripMember[]>([]);
export const membersLoaded = writable(false);

export const activeMembers = derived(members, ($members) =>
	$members.filter((m) => !m.deleted)
);

export async function loadMembers(tripId: string) {
	try {
		const idbMembers = await getMembersByTrip(tripId);
		if (idbMembers.length > 0) {
			members.set(idbMembers.filter((m) => !m.deleted));
		}
	} catch {
		// IDB unavailable
	}

	// Show whatever we have from IDB immediately
	membersLoaded.set(true);

	// Then fetch fresh data from server in the background
	try {
		const res = await fetch(`/api/trips/${tripId}/members`);
		if (res.ok) {
			const serverMembers: TripMember[] = await res.json();
			members.set(serverMembers.filter((m) => !m.deleted));
			for (const member of serverMembers) {
				try { await putMember(member); } catch { /* IDB unavailable */ }
			}
		}
	} catch {
		// Offline
	}
}

export async function createMember(
	tripId: string,
	name: string,
	userId?: number
): Promise<TripMember | null> {
	const now = new Date();
	const member: TripMember = {
		id: uuid(),
		tripId,
		name,
		userId: userId ?? null,
		addedBy: 0, // will be set by server
		deleted: false,
		createdAt: now,
		updatedAt: now,
		version: 1
	};

	members.update((m) => [...m, member]);
	try { await putMember(member); } catch { /* IDB unavailable */ }

	try {
		const res = await fetch(`/api/trips/${tripId}/members`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, userId })
		});
		if (res.ok) {
			const serverMember: TripMember = await res.json();
			members.update((m) => m.map((x) => (x.id === member.id ? serverMember : x)));
			try { await putMember(serverMember); } catch { /* IDB unavailable */ }
			return serverMember;
		} else {
			members.update((m) => m.filter((x) => x.id !== member.id));
			showToast('Failed to add member', 'error');
			return null;
		}
	} catch {
		await addToSyncQueue({
			entityType: 'tripMember',
			entityId: member.id,
			operation: 'create',
			data: member as unknown as Record<string, unknown>,
			timestamp: now.getTime()
		});
		showToast('Member saved offline', 'info');
	}
	return member;
}

export async function removeMember(memberId: string, tripId: string): Promise<void> {
	members.update((m) => m.filter((x) => x.id !== memberId));

	try {
		const res = await fetch(`/api/trips/${tripId}/members/${memberId}`, { method: 'DELETE' });
		if (!res.ok) {
			showToast('Failed to remove member', 'error');
		}
	} catch {
		await addToSyncQueue({
			entityType: 'tripMember',
			entityId: memberId,
			operation: 'delete',
			timestamp: Date.now()
		});
	}
}
