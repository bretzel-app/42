<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { loadExpenses, activeExpenses } from '$lib/stores/expenses.js';
	import { formatCents, convertToHomeCurrency } from '$lib/utils/currency.js';
	import { formatDateRange, tripDurationDays, elapsedDays } from '$lib/utils/dates.js';
	import { formatNumber } from '$lib/utils/format.js';
	import { CATEGORIES } from '$lib/types/categories.js';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import type { Trip, Expense, CategoryId } from '$lib/types/index.js';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Plus from 'lucide-svelte/icons/plus';

	let trip = $state<Trip | null>(null);
	let loading = $state(true);

	const tripId = $derived($page.params.id!);

	onMount(async () => {
		try {
			const res = await fetch(`/api/trips/${tripId}`);
			if (res.ok) {
				trip = await res.json();
			}
		} catch { /* offline */ }
		await loadExpenses(tripId);
		loading = false;
	});

	// Dashboard calculations
	const totalSpentCents = $derived(
		$activeExpenses.reduce((sum, e) => sum + convertToHomeCurrency(e.amount, e.exchangeRate), 0)
	);

	const duration = $derived(trip ? tripDurationDays(trip.startDate, trip.endDate) : 1);
	const elapsed = $derived(trip ? elapsedDays(trip.startDate, trip.endDate) : 1);
	const avgPerDay = $derived(elapsed > 0 ? totalSpentCents / elapsed : 0);
	const avgPerPerson = $derived(trip && trip.numberOfPeople > 0 ? totalSpentCents / trip.numberOfPeople : totalSpentCents);
	const projectedTotal = $derived(duration > 0 ? avgPerDay * duration : totalSpentCents);

	const budgetPercent = $derived(
		trip?.totalBudget ? Math.min(100, (totalSpentCents / trip.totalBudget) * 100) : 0
	);
	const budgetColor = $derived(
		budgetPercent > 90 ? 'var(--destructive)' : budgetPercent > 70 ? 'var(--primary)' : 'var(--success-text)'
	);

	// Category breakdown
	const categoryTotals = $derived(() => {
		const totals = new Map<CategoryId, number>();
		for (const expense of $activeExpenses) {
			const home = convertToHomeCurrency(expense.amount, expense.exchangeRate);
			totals.set(expense.categoryId, (totals.get(expense.categoryId) || 0) + home);
		}
		return CATEGORIES
			.map((cat) => ({ ...cat, total: totals.get(cat.id) || 0 }))
			.filter((c) => c.total > 0)
			.sort((a, b) => b.total - a.total);
	});
</script>

<svelte:head>
	<title>{trip?.name || 'Trip'} - 42</title>
</svelte:head>

{#if loading}
	<p class="text-sm text-[var(--text-muted)]">Loading...</p>
{:else if trip}
	<div class="pb-8">
		<!-- Header -->
		<div class="mb-6 flex items-start justify-between">
			<div>
				<h2 class="text-xl font-bold text-[var(--text)]">{trip.name}</h2>
				{#if trip.destination}
					<p class="text-sm text-[var(--text-muted)]">{trip.destination}</p>
				{/if}
				<p class="text-xs text-[var(--text-muted)]">{formatDateRange(trip.startDate, trip.endDate)} · {duration} days · {trip.numberOfPeople} {trip.numberOfPeople === 1 ? 'person' : 'people'}</p>
			</div>
			<div class="flex gap-2">
				<a
					href="/trips/{trip.id}/edit"
					class="flex items-center gap-1 rounded-sm border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--primary)]"
					data-testid="edit-trip-btn"
				>
					<Pencil size={14} />
					Edit
				</a>
				<a
					href="/trips/{trip.id}/expenses/new"
					class="flex items-center gap-1 rounded-sm bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
					data-testid="add-expense-btn"
				>
					<Plus size={14} />
					Add Expense
				</a>
			</div>
		</div>

		<!-- Budget gauge -->
		{#if trip.totalBudget}
			<div class="mb-6 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--card-shadow)]">
				<div class="mb-2 flex items-center justify-between text-sm">
					<span class="text-[var(--text)]">Spent: {formatCents(totalSpentCents, trip.homeCurrency)}</span>
					<span class="text-[var(--text-muted)]">Budget: {formatCents(trip.totalBudget, trip.homeCurrency)}</span>
				</div>
				<div class="h-4 overflow-hidden rounded-sm bg-[var(--border-subtle)]">
					<div
						class="h-full transition-all"
						style="width: {budgetPercent}%; background-color: {budgetColor}"
					></div>
				</div>
				<p class="mt-1 text-xs text-[var(--text-muted)]">{formatNumber(budgetPercent, 0)}% used</p>
			</div>
		{/if}

		<!-- Stats grid -->
		<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
				<p class="text-xs text-[var(--text-muted)]">Total spent</p>
				<p class="mt-1 text-lg font-bold text-[var(--text)]">{formatCents(totalSpentCents, trip.homeCurrency)}</p>
			</div>
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
				<p class="text-xs text-[var(--text-muted)]">Avg / day</p>
				<p class="mt-1 text-lg font-bold text-[var(--text)]">{formatCents(Math.round(avgPerDay), trip.homeCurrency)}</p>
			</div>
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
				<p class="text-xs text-[var(--text-muted)]">Avg / person</p>
				<p class="mt-1 text-lg font-bold text-[var(--text)]">{formatCents(Math.round(avgPerPerson), trip.homeCurrency)}</p>
			</div>
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
				<p class="text-xs text-[var(--text-muted)]">Projected total</p>
				<p class="mt-1 text-lg font-bold text-[var(--text)]">{formatCents(Math.round(projectedTotal), trip.homeCurrency)}</p>
			</div>
		</div>

		<!-- Category breakdown -->
		{#if categoryTotals().length > 0}
			<div class="mb-6 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--card-shadow)]">
				<h3 class="mb-3 text-sm font-semibold text-[var(--text)]">By Category</h3>
				<div class="space-y-3">
					{#each categoryTotals() as cat}
						{@const pct = totalSpentCents > 0 ? (cat.total / totalSpentCents) * 100 : 0}
						<div>
							<div class="mb-1 flex items-center justify-between text-sm">
								<span class="flex items-center gap-2">
									<CategoryIcon categoryId={cat.id} size={16} />
									{cat.label}
								</span>
								<span class="text-[var(--text-muted)]">
									{formatCents(cat.total, trip.homeCurrency)} ({formatNumber(pct, 0)}%)
								</span>
							</div>
							<!-- SVG horizontal bar -->
							<svg class="h-3 w-full overflow-visible" viewBox="0 0 100 6">
								<rect x="0" y="0" width="100" height="6" rx="1" fill="var(--border-subtle)" />
								<rect x="0" y="0" width={pct} height="6" rx="1" fill={cat.color} />
							</svg>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Quick links -->
		<div class="flex gap-3">
			<a
				href="/trips/{trip.id}/expenses"
				class="rounded-sm border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text)] hover:border-[var(--primary)]"
			>
				View all expenses ({$activeExpenses.length})
			</a>
		</div>
	</div>
{:else}
	<p class="text-sm text-[var(--text-muted)]">Trip not found</p>
{/if}
