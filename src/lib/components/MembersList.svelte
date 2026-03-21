<script lang="ts">
	import { activeMembers, createMember, removeMember } from '$lib/stores/members.js';
	import UserPlus from 'lucide-svelte/icons/user-plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Link from 'lucide-svelte/icons/link';

	interface Props {
		tripId: string;
		ownerId: number;
	}

	let { tripId, ownerId }: Props = $props();

	let newMemberName = $state('');
	let adding = $state(false);
	let searchResults = $state<{ id: number; displayName: string; email: string }[]>([]);
	let searching = $state(false);
	let linkingMemberId = $state<string | null>(null);
	let linkQuery = $state('');
	let linkSearchResults = $state<{ id: number; displayName: string; email: string }[]>([]);
	let linkSearching = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;
	let linkDebounceTimer: ReturnType<typeof setTimeout>;

	function getInitials(name: string): string {
		return name.slice(0, 2).toUpperCase();
	}

	function getAvatarStyle(isOwner: boolean, isLinked: boolean): string {
		if (isOwner) return 'background-color: var(--primary); color: white;';
		if (isLinked) return 'background-color: #7a6f5a; color: white;';
		return 'background-color: #b0a58e; color: white;';
	}

	async function handleAddMember() {
		const name = newMemberName.trim();
		if (!name) return;
		adding = true;
		await createMember(tripId, name);
		newMemberName = '';
		searchResults = [];
		adding = false;
	}

	function handleNameInput(value: string) {
		clearTimeout(debounceTimer);
		if (value.trim().length < 2) {
			searchResults = [];
			return;
		}
		// Only search if it looks like an email
		if (!value.includes('@')) {
			searchResults = [];
			return;
		}
		debounceTimer = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(value.trim())}`);
				if (res.ok) {
					const existing = new Set($activeMembers.map((m) => m.userId).filter(Boolean));
					const results = await res.json();
					searchResults = results.filter((r: { id: number }) => !existing.has(r.id));
				}
			} catch {
				/* offline */
			}
			searching = false;
		}, 300);
	}

	async function handleAddLinkedMember(user: { id: number; displayName: string }) {
		adding = true;
		await createMember(tripId, user.displayName, user.id);
		newMemberName = '';
		searchResults = [];
		adding = false;
	}

	async function handleRemove(memberId: string) {
		await removeMember(memberId, tripId);
	}

	function startLinking(memberId: string) {
		linkingMemberId = memberId;
		linkQuery = '';
		linkSearchResults = [];
	}

	function cancelLinking() {
		linkingMemberId = null;
		linkQuery = '';
		linkSearchResults = [];
	}

	function handleLinkInput(value: string) {
		clearTimeout(linkDebounceTimer);
		if (value.trim().length < 1) {
			linkSearchResults = [];
			return;
		}
		linkDebounceTimer = setTimeout(async () => {
			linkSearching = true;
			try {
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(value.trim())}`);
				if (res.ok) {
					const existing = new Set($activeMembers.map((m) => m.userId).filter(Boolean));
					const results = await res.json();
					linkSearchResults = results.filter((r: { id: number }) => !existing.has(r.id));
				}
			} catch {
				/* offline */
			}
			linkSearching = false;
		}, 300);
	}

	async function linkMemberToUser(memberId: string, user: { id: number; displayName: string }) {
		try {
			const res = await fetch(`/api/trips/${tripId}/members/${memberId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: user.id, name: user.displayName })
			});
			if (res.ok) {
				// Reload members to get updated state
				const { loadMembers } = await import('$lib/stores/members.js');
				await loadMembers(tripId);
			}
		} catch {
			/* offline */
		}
		cancelLinking();
	}
</script>

<div class="space-y-4">
	<!-- Add member input -->
	<div>
		<label for="new-member" class="mb-1 block text-sm font-medium text-[var(--text)]">Add member</label>
		<div class="flex gap-2">
			<input
				id="new-member"
				type="text"
				bind:value={newMemberName}
				oninput={() => handleNameInput(newMemberName)}
				onkeydown={(e) => e.key === 'Enter' && handleAddMember()}
				placeholder="Name or email to search..."
				class="min-w-0 flex-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
			/>
			<button
				onclick={handleAddMember}
				disabled={adding || !newMemberName.trim()}
				class="flex shrink-0 items-center gap-2 rounded-sm bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
			>
				<UserPlus size={14} />
				Add
			</button>
		</div>

		<!-- Email search results dropdown -->
		{#if searchResults.length > 0}
			<div class="mt-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[2px_2px_0px_var(--border-subtle)]">
				{#each searchResults as result}
					<button
						onclick={() => handleAddLinkedMember(result)}
						disabled={adding}
						class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-base)] disabled:opacity-50"
					>
						<Link size={12} class="shrink-0 text-[var(--primary)]" />
						<div class="min-w-0 flex-1">
							<span class="font-medium text-[var(--text)]">{result.displayName}</span>
							<span class="ml-2 text-xs text-[var(--text-muted)]">{result.email}</span>
						</div>
						<span class="shrink-0 text-xs text-[var(--primary)]">Link account</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Member list -->
	{#if $activeMembers.length === 0}
		<p class="text-sm text-[var(--text-muted)]">No members yet. Add names above to track who's on this trip.</p>
	{:else}
		<div class="space-y-2">
			{#each $activeMembers as member (member.id)}
				{@const isOwner = member.userId === ownerId}
				{@const isLinked = member.userId !== null && !isOwner}
				<div class="group rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[2px_2px_0px_var(--border-subtle)]">
					<div class="flex items-center gap-3">
						<!-- Avatar -->
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-xs font-bold"
							style={getAvatarStyle(isOwner, isLinked)}
						>
							{getInitials(member.name)}
						</div>

						<!-- Name + badge -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate text-sm font-medium text-[var(--text)]">{member.name}</span>
								{#if isOwner}
									<span class="shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium uppercase" style="background-color: var(--primary); color: white;">OWNER</span>
								{:else if isLinked}
									<span class="shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium uppercase" style="background-color: #5a7a5a; color: white;">LINKED</span>
								{/if}
							</div>
							{#if !isOwner && !isLinked}
								<button
									onclick={() => startLinking(member.id)}
									class="mt-0.5 text-xs text-[var(--primary)] hover:underline"
								>
									Link to account
								</button>
							{/if}
						</div>

						<!-- Remove button (not for owner) -->
						{#if !isOwner}
							<button
								onclick={() => handleRemove(member.id)}
								class="shrink-0 text-[var(--text-muted)] transition-opacity max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-[var(--destructive)]"
								aria-label="Remove {member.name}"
							>
								<Trash2 size={14} />
							</button>
						{/if}
					</div>

					<!-- Link to account inline search -->
					{#if linkingMemberId === member.id}
						<div class="mt-3 border-t border-[var(--border-subtle)] pt-3">
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={linkQuery}
									oninput={() => handleLinkInput(linkQuery)}
									placeholder="Search by name or email..."
									class="min-w-0 flex-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
									/>
								<button
									onclick={cancelLinking}
									class="shrink-0 rounded-sm border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--primary)]"
								>
									Cancel
								</button>
							</div>
							{#if linkSearchResults.length > 0}
								<div class="mt-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)]">
									{#each linkSearchResults as result}
										<button
											onclick={() => linkMemberToUser(member.id, result)}
											class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-surface)]"
										>
											<Link size={12} class="shrink-0 text-[var(--primary)]" />
											<div class="min-w-0 flex-1">
												<span class="font-medium text-[var(--text)]">{result.displayName}</span>
												<span class="ml-2 text-xs text-[var(--text-muted)]">{result.email}</span>
											</div>
										</button>
									{/each}
								</div>
							{:else if linkSearching}
								<p class="mt-1 text-xs text-[var(--text-muted)]">Searching...</p>
							{:else if linkQuery.length > 0}
								<p class="mt-1 text-xs text-[var(--text-muted)]">No users found.</p>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Tip -->
	<p class="text-xs text-[var(--text-muted)]">
		Tip: Add names for everyone on the trip. Link to an account if they use the app — they'll see shared expenses.
	</p>
</div>
