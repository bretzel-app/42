<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { loadMembers } from '$lib/stores/members.js';
	import { getTrip } from '$lib/sync/idb.js';
	import { loadSettlements, activeSettlements, removeSettlement } from '$lib/stores/settlements.js';
	import { loadExpenses, activeExpenses } from '$lib/stores/expenses.js';
	import { formatCents } from '$lib/utils/currency.js';
	import { formatDate } from '$lib/utils/dates.js';
	import { showToast } from '$lib/stores/toast.js';
	import BalanceCard from '$lib/components/BalanceCard.svelte';
	import SettleUpSection from '$lib/components/SettleUpSection.svelte';
	import type { MemberBalance, SuggestedTransfer, TripMember } from '$lib/types/index.js';
	import Trash2 from 'lucide-svelte/icons/trash-2';

	interface Props {
		data: {
			tripId: string;
			balances: MemberBalance[];
			transfers: SuggestedTransfer[];
			members: TripMember[];
		};
	}

	const { data }: Props = $props();

	const tripId = $derived($page.params.id!);

	// SSR data — refreshed after settlements
	let balances = $state<MemberBalance[]>([...data.balances]);
	let transfers = $state<SuggestedTransfer[]>([...data.transfers]);

	// Home currency — fetched from trip
	let homeCurrency = $state('EUR');
	let tripName = $state('');
	onMount(async () => {
		// Load trip from IDB first for instant offline display
		try {
			const idbTrip = await getTrip(tripId);
			if (idbTrip) {
				homeCurrency = idbTrip.homeCurrency || 'EUR';
				tripName = idbTrip.name || '';
			}
		} catch { /* IDB unavailable */ }

		await Promise.all([
			loadMembers(tripId),
			loadSettlements(tripId),
			loadExpenses(tripId)
		]);

		// Fetch trip for homeCurrency + name (background refresh)
		try {
			const res = await fetch(`/api/trips/${tripId}`);
			if (res.ok) {
				const trip = await res.json();
				homeCurrency = trip.homeCurrency || 'EUR';
				tripName = trip.name || '';
			}
		} catch { /* offline — IDB data stands */ }
	});

	// After a settlement is confirmed, refresh balances from server
	async function refreshBalances() {
		try {
			const res = await fetch(`/api/trips/${tripId}/balances`);
			if (res.ok) {
				const data = await res.json();
				balances = data.balances;
				transfers = data.transfers;
			}
		} catch {
			// offline — balances may be stale
		}
	}

	// Find member name by id for settlement history display
	function findMemberName(memberId: string): string {
		const found = data.members.find((m) => m.id === memberId);
		return found?.name ?? memberId;
	}

	// Legacy expenses: expenses without a paidByMemberId
	const legacyExpenseCount = $derived($activeExpenses.filter((e) => !e.paidByMemberId).length);

	async function handleDeleteSettlement(settlementId: string) {
		if (!confirm('Remove this settlement?')) return;
		await removeSettlement(settlementId, tripId);
		showToast('Settlement removed', 'success');
		await refreshBalances();
	}
</script>

<svelte:head>
	<title>Balances - {tripName || 'Trip'} - 42</title>
</svelte:head>

<div class="pb-8">
	<!-- Sub-navigation -->
	<nav class="mb-6 flex gap-4 border-b border-[var(--border-subtle)] pb-0">
		<a
			href="/trips/{tripId}"
			class="pb-2 text-sm text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
		>
			Dashboard
		</a>
		<a
			href="/trips/{tripId}/expenses"
			class="pb-2 text-sm text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
		>
			Expenses
		</a>
		<a
			href="/trips/{tripId}/balances"
			class="border-b-2 border-[var(--primary)] pb-2 text-sm font-medium text-[var(--primary)]"
			style="margin-bottom: -1px;"
		>
			Balances
		</a>
	</nav>

	<!-- Legacy banner -->
	{#if legacyExpenseCount > 0}
		<div
			class="mb-6 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-muted)] shadow-[var(--card-shadow)]"
		>
			<strong class="text-[var(--text)]">{legacyExpenseCount} expense{legacyExpenseCount !== 1 ? 's' : ''}</strong>
			{legacyExpenseCount !== 1 ? ' have' : ' has'} no assigned payer and {legacyExpenseCount !== 1 ? 'are' : 'is'} excluded from balances.
			Edit {legacyExpenseCount !== 1 ? 'them' : 'it'} to assign a payer.
		</div>
	{/if}

	<!-- Member Balances -->
	<section class="mb-8">
		<h3
			class="mb-3 text-[11px] uppercase tracking-[1px] text-[var(--text-muted)]"
		>
			Member Balances
		</h3>
		{#if balances.length === 0}
			<p class="text-sm text-[var(--text-muted)]">No members tracked yet.</p>
		{:else}
			<div class="space-y-2">
				{#each balances as balance (balance.memberId)}
					<BalanceCard {balance} {homeCurrency} />
				{/each}
			</div>
		{/if}
	</section>

	<!-- Settle Up -->
	<section class="mb-8">
		<h3
			class="mb-3 text-[11px] uppercase tracking-[1px] text-[var(--text-muted)]"
		>
			Settle Up
		</h3>
		<SettleUpSection
			{transfers}
			{tripId}
			{homeCurrency}
			onSettled={refreshBalances}
		/>
	</section>

	<!-- Settlement History -->
	<section>
		<h3
			class="mb-3 text-[11px] uppercase tracking-[1px] text-[var(--text-muted)]"
		>
			Settlement History
		</h3>
		{#if $activeSettlements.length === 0}
			<p class="text-sm text-[var(--text-muted)]">No settlements recorded yet.</p>
		{:else}
			<div class="space-y-2">
				{#each $activeSettlements as settlement (settlement.id)}
					<div
						class="group flex items-center gap-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]"
					>
						<div class="min-w-0 flex-1">
							<p class="text-sm text-[var(--text)]">
								<span class="font-medium">{findMemberName(settlement.fromMemberId)}</span>
								<span class="text-[var(--text-muted)]"> paid </span>
								<span class="font-medium">{findMemberName(settlement.toMemberId)}</span>
								<span class="ml-2 font-bold">{formatCents(settlement.amount, homeCurrency)}</span>
							</p>
							<p class="text-xs text-[var(--text-muted)]">
								{formatDate(settlement.date)}
								{#if settlement.note}
									<span class="ml-1">· {settlement.note}</span>
								{/if}
							</p>
						</div>
						<button
							onclick={() => handleDeleteSettlement(settlement.id)}
							class="max-md:opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100 rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--destructive)]"
							aria-label="Remove settlement"
						>
							<Trash2 size={14} />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
