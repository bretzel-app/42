<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { loadExpenses, activeExpenses, deleteExpense } from '$lib/stores/expenses.js';
	import { loadMembers, activeMembers } from '$lib/stores/members.js';
	import { formatCents, convertToHomeCurrency } from '$lib/utils/currency.js';
	import { formatDate } from '$lib/utils/dates.js';
	import { showToast } from '$lib/stores/toast.js';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import { getCategoryLabel, CATEGORY_MAP } from '$lib/types/categories.js';
	import type { Trip, Expense, TripMember, CategoryId } from '$lib/types/index.js';
	import { getTrip, putTrip } from '$lib/sync/idb.js';
	import Plus from 'lucide-svelte/icons/plus';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import Pencil from 'lucide-svelte/icons/pencil';
	import MapPin from 'lucide-svelte/icons/map-pin';
	import X from 'lucide-svelte/icons/x';

	const tripId = $derived($page.params.id!);
	let trip = $state<Trip | null>(null);
	let loading = $state(true);

	const categoryFilter = $derived.by<CategoryId | null>(() => {
		const value = $page.url.searchParams.get('category');
		return value && CATEGORY_MAP.has(value as CategoryId) ? (value as CategoryId) : null;
	});

	const filteredExpenses = $derived(
		categoryFilter ? $activeExpenses.filter((e) => e.categoryId === categoryFilter) : $activeExpenses
	);

	onMount(async () => {
		// Load from IDB first for instant offline display
		let hasIdbData = false;
		try {
			const idbTrip = await getTrip(tripId);
			if (idbTrip) {
				trip = idbTrip;
				hasIdbData = true;
			}
		} catch { /* IDB unavailable */ }

		// Kick off store loads (IDB-first) before clearing loading
		const storesReady = Promise.all([
			loadExpenses(tripId),
			loadMembers(tripId)
		]);

		if (hasIdbData) loading = false;

		// Then fetch fresh data from server in the background
		try {
			const res = await fetch(`/api/trips/${tripId}`);
			if (res.ok) {
				trip = await res.json();
				try { await putTrip(trip!); } catch { /* IDB unavailable */ }
			}
		} catch { /* offline — IDB data stands */ }

		await storesReady;
		loading = false;
	});

	// Group expenses by date
	const groupedExpenses = $derived(() => {
		const groups = new Map<string, Expense[]>();
		for (const expense of filteredExpenses) {
			const key = formatDate(expense.date);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(expense);
		}
		return Array.from(groups.entries());
	});

	// Member lookup map
	const memberMap = $derived(
		new Map($activeMembers.map((m) => [m.id, m.name]))
	);

	async function handleDelete(expenseId: string) {
		if (!confirm('Delete this expense?')) return;
		await deleteExpense(tripId, expenseId);
		showToast('Expense deleted', 'success');
	}
</script>

<svelte:head>
	<title>Expenses - {trip?.name || 'Trip'} - 42</title>
</svelte:head>

<div class="pb-8">
	<div class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-3">
			<a
				href="/trips/{tripId}"
				class="rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
				aria-label="Back to dashboard"
			>
				<ArrowLeft size={20} />
			</a>
			<div>
				<h2 class="text-xl font-bold text-[var(--text)]">Expenses</h2>
				{#if trip}
					<p class="text-sm text-[var(--text-muted)]">{trip.name}</p>
				{/if}
			</div>
		</div>
		<a
			href="/trips/{tripId}/expenses/new"
			class="flex items-center gap-2 rounded-sm bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
			data-testid="add-expense-btn"
		>
			<Plus size={16} />
			Add Expense
		</a>
	</div>

	<!-- Sub-navigation (multi-member trips only) -->
	{#if $activeMembers.length >= 2}
		<div class="mb-6" style="border-bottom: 1px solid var(--border-subtle);">
			<div class="flex gap-0">
				<a
					href="/trips/{tripId}"
					class="px-4 py-2.5 text-[13px] transition-colors hover:text-[var(--text)]"
					style="color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px;"
				>
					Dashboard
				</a>
				<a
					href="/trips/{tripId}/expenses"
					class="px-4 py-2.5 text-[13px] font-medium transition-colors"
					style="color: var(--primary); border-bottom: 2px solid var(--primary); margin-bottom: -1px;"
				>
					Expenses
				</a>
				{#if trip?.splitExpenses !== false}
					<a
						href="/trips/{tripId}/balances"
						class="px-4 py-2.5 text-[13px] transition-colors hover:text-[var(--text)]"
						style="color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px;"
					>
						Balances
					</a>
				{/if}
			</div>
		</div>
	{/if}

	{#if loading}
		<p class="text-sm text-[var(--text-muted)]">Loading...</p>
	{:else if $activeExpenses.length === 0}
		<div class="flex flex-col items-center justify-center py-16">
			<p class="font-['Press_Start_2P'] text-sm text-[var(--text-muted)]">No expenses yet</p>
			<p class="mt-2 text-sm text-[var(--text-muted)]">Add your first expense to start tracking</p>
		</div>
	{:else}
		{#if categoryFilter}
			<div class="mb-4 flex items-center gap-2" data-testid="category-filter-chip">
				<span class="text-xs text-[var(--text-muted)]">Filtered by:</span>
				<span class="inline-flex items-center gap-1.5 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text)] shadow-[var(--card-shadow)]">
					<CategoryIcon categoryId={categoryFilter} size={14} />
					{getCategoryLabel(categoryFilter)}
					<a
						href="/trips/{tripId}/expenses"
						class="ml-0.5 rounded-sm text-[var(--text-muted)] hover:text-[var(--destructive)]"
						aria-label="Clear category filter"
						data-testid="clear-category-filter"
					>
						<X size={12} />
					</a>
				</span>
			</div>
		{/if}
		{#if filteredExpenses.length === 0}
			<div class="flex flex-col items-center justify-center py-16">
				<p class="font-['Press_Start_2P'] text-sm text-[var(--text-muted)]">No matches</p>
				<p class="mt-2 text-sm text-[var(--text-muted)]">No expenses in this category yet</p>
			</div>
		{:else}
		<div class="space-y-6">
			{#each groupedExpenses() as [dateStr, dayExpenses]}
				{@const dayTotal = dayExpenses.reduce((s, e) => s + convertToHomeCurrency(e.amount, e.exchangeRate), 0)}
				<div>
					<div class="mb-2 flex items-center justify-between border-b border-[var(--border-subtle)] pb-1">
						<h3 class="text-sm font-semibold text-[var(--text)]">{dateStr}</h3>
						<span class="text-xs text-[var(--text-muted)]">{trip ? formatCents(dayTotal, trip.homeCurrency) : ''}</span>
					</div>
					<div class="space-y-2">
						{#each dayExpenses as expense (expense.id)}
							<div class="group flex items-center gap-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]" data-testid="expense-row">
								<CategoryIcon categoryId={expense.categoryId} size={20} />
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium text-[var(--text)]">
											{formatCents(expense.amount, expense.currency)}
											{#if expense.currency !== trip?.homeCurrency}
												<span class="text-xs text-[var(--text-muted)]">
													({formatCents(convertToHomeCurrency(expense.amount, expense.exchangeRate), trip?.homeCurrency || 'EUR')})
												</span>
											{/if}
										</span>
										<span class="text-xs text-[var(--text-muted)]">{getCategoryLabel(expense.categoryId)}</span>
									</div>
									{#if expense.note}
										<p class="truncate text-xs text-[var(--text-muted)]">{expense.note}</p>
									{/if}
									{#if trip?.splitExpenses !== false && expense.paidByMemberId && memberMap.get(expense.paidByMemberId)}
										<p class="text-[11px]" style="color: var(--text-muted);">
											Paid by {memberMap.get(expense.paidByMemberId)}
										</p>
									{/if}
									{#if expense.latitude != null && expense.longitude != null}
										<a
											href="https://www.openstreetmap.org/?mlat={expense.latitude}&mlon={expense.longitude}#map=16/{expense.latitude}/{expense.longitude}"
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)]"
											onclick={(e) => e.stopPropagation()}
										>
											<MapPin size={10} />
											Map
										</a>
									{/if}
								</div>
								<div class="flex items-center gap-1 max-md:opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100">
									<a
										href="/trips/{tripId}/expenses/{expense.id}"
										class="rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--primary)]"
									>
										<Pencil size={14} />
									</a>
									<button
										onclick={() => handleDelete(expense.id)}
										class="rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--destructive)]"
									>
										<Trash2 size={14} />
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		{/if}
	{/if}
</div>
