<script lang="ts">
	import type { Collaborator } from '$lib/types/index.js';
	import X from 'lucide-svelte/icons/x';
	import UserMinus from 'lucide-svelte/icons/user-minus';
	import Search from 'lucide-svelte/icons/search';
	import UserPlus from 'lucide-svelte/icons/user-plus';

	let {
		tripId,
		collaborators,
		ownerName,
		onClose,
		onUpdate
	}: {
		tripId: string;
		collaborators: Collaborator[];
		ownerName: string;
		onClose: () => void;
		onUpdate: (collabs: Collaborator[]) => void;
	} = $props();

	let searchQuery = $state('');
	let searchResults = $state<{ id: number; displayName: string; email: string }[]>([]);
	let searching = $state(false);
	let adding = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;

	function handleSearch(query: string) {
		clearTimeout(debounceTimer);
		if (query.trim().length < 1) {
			searchResults = [];
			return;
		}
		debounceTimer = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
				if (res.ok) {
					const results = await res.json();
					// Filter out existing collaborators
					const collabIds = new Set(collaborators.map((c) => c.userId));
					searchResults = results.filter((r: { id: number }) => !collabIds.has(r.id));
				}
			} catch {
				/* offline */
			}
			searching = false;
		}, 300);
	}

	async function addCollaborator(userId: number) {
		adding = true;
		try {
			const res = await fetch(`/api/trips/${tripId}/collaborators`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId })
			});
			if (res.ok) {
				const updated = await res.json();
				onUpdate(updated);
				searchQuery = '';
				searchResults = [];
			}
		} catch {
			/* offline */
		}
		adding = false;
	}

	async function removeCollaborator(userId: number) {
		try {
			const res = await fetch(`/api/trips/${tripId}/collaborators?userId=${userId}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				const updated = await res.json();
				onUpdate(updated);
			}
		} catch {
			/* offline */
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
	onclick={handleBackdropClick}
	role="dialog"
	aria-modal="true"
	aria-label="Share trip"
>
	<div class="mx-4 w-full max-w-md rounded-sm border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--card-shadow)]">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-[var(--border-subtle)] p-4">
			<h3 class="text-base font-semibold text-[var(--text)]">Share Trip</h3>
			<button onclick={onClose} class="text-[var(--text-muted)] hover:text-[var(--text)]">
				<X size={18} />
			</button>
		</div>

		<div class="p-4">
			<!-- Search -->
			<div class="relative mb-4">
				<Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
				<input
					type="text"
					bind:value={searchQuery}
					oninput={() => handleSearch(searchQuery)}
					placeholder="Search users by name or email..."
					class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] py-2 pl-9 pr-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
				/>
			</div>

			<!-- Search results -->
			{#if searchResults.length > 0}
				<div class="mb-4 max-h-40 overflow-y-auto rounded-sm border border-[var(--border-subtle)]">
					{#each searchResults as result}
						<button
							onclick={() => addCollaborator(result.id)}
							disabled={adding}
							class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-base)] disabled:opacity-50"
						>
							<UserPlus size={14} class="shrink-0 text-[var(--primary)]" />
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium text-[var(--text)]">{result.displayName}</p>
								<p class="truncate text-xs text-[var(--text-muted)]">{result.email}</p>
							</div>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Current members -->
			<div>
				<p class="mb-2 text-xs font-medium text-[var(--text-muted)] uppercase">Members</p>

				<!-- Owner -->
				<div class="flex items-center gap-3 px-1 py-2 text-sm">
					<div class="min-w-0 flex-1">
						<span class="font-medium text-[var(--text)]">{ownerName}</span>
						<span class="ml-1 text-xs text-[var(--text-muted)]">(Owner)</span>
					</div>
				</div>

				<!-- Collaborators -->
				{#each collaborators as collab}
					<div class="group flex items-center gap-3 px-1 py-2 text-sm">
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium text-[var(--text)]">{collab.displayName}</p>
							<p class="truncate text-xs text-[var(--text-muted)]">{collab.email}</p>
						</div>
						<button
							onclick={() => removeCollaborator(collab.userId)}
							class="shrink-0 text-[var(--text-muted)] max-md:opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100 hover:text-[var(--destructive)]"
							aria-label="Remove {collab.displayName}"
						>
							<UserMinus size={14} />
						</button>
					</div>
				{/each}

				{#if collaborators.length === 0}
					<p class="py-2 text-xs text-[var(--text-muted)]">No collaborators yet. Search for users above to share this trip.</p>
				{/if}
			</div>
		</div>
	</div>
</div>
