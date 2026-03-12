<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { loadExpenses, activeExpenses } from '$lib/stores/expenses.js';
	import { getTrip, putTrip } from '$lib/sync/idb.js';
	import { formatCents, convertToHomeCurrency } from '$lib/utils/currency.js';
	import { formatDateRange, tripDurationDays, elapsedDays } from '$lib/utils/dates.js';
	import { formatNumber } from '$lib/utils/format.js';
	import { CATEGORIES } from '$lib/types/categories.js';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import type { Trip, Expense, CategoryId, Collaborator } from '$lib/types/index.js';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Plus from 'lucide-svelte/icons/plus';
	import Users from 'lucide-svelte/icons/users';

	let trip = $state<Trip | null>(null);
	let loading = $state(true);
	let showShare = $state(false);
	let collaborators = $state<Collaborator[]>([]);
	let isOwner = $state(true);
	let ownerName = $state('');

	const tripId = $derived($page.params.id!);

	onMount(async () => {
		// Load from IDB first for instant offline display
		try {
			const idbTrip = await getTrip(tripId);
			if (idbTrip) {
				trip = idbTrip;
			}
		} catch { /* IDB unavailable */ }

		// Then try server for fresh data
		try {
			const [tripRes, collabRes] = await Promise.all([
				fetch(`/api/trips/${tripId}`),
				fetch(`/api/trips/${tripId}/collaborators`)
			]);
			if (tripRes.ok) {
				const data = await tripRes.json();
				trip = data;
				isOwner = data.isOwner !== false;
				ownerName = data.ownerName || '';
				try { await putTrip(data); } catch { /* IDB unavailable */ }
			}
			if (collabRes.ok) {
				collaborators = await collabRes.json();
			}
		} catch { /* offline — IDB data stands */ }
		await loadExpenses(tripId);
		loading = false;
	});

	// Dashboard calculations — split pre-trip (fixed costs) from on-trip (daily spend)
	const tripStart = $derived(trip ? new Date(trip.startDate).getTime() : 0);
	const tripEnd = $derived(trip ? new Date(trip.endDate).getTime() : 0);
	const now = $derived(Date.now());

	const preTripCents = $derived(
		$activeExpenses
			.filter((e) => new Date(e.date).getTime() < tripStart)
			.reduce((sum, e) => sum + convertToHomeCurrency(e.amount, e.exchangeRate), 0)
	);

	const onTripCents = $derived(
		$activeExpenses
			.filter((e) => new Date(e.date).getTime() >= tripStart)
			.reduce((sum, e) => sum + convertToHomeCurrency(e.amount, e.exchangeRate), 0)
	);

	const totalSpentCents = $derived(preTripCents + onTripCents);

	const duration = $derived(trip ? tripDurationDays(trip.startDate, trip.endDate) : 1);
	const elapsed = $derived(trip ? elapsedDays(trip.startDate, trip.endDate) : 1);
	// Pre-trip expenses spread over total duration, on-trip over elapsed days
	const avgPerDay = $derived(
		(duration > 0 ? preTripCents / duration : 0) + (elapsed > 0 ? onTripCents / elapsed : 0)
	);
	const avgPerPerson = $derived(trip && trip.numberOfPeople > 0 ? totalSpentCents / trip.numberOfPeople : totalSpentCents);
	// Days until trip starts (for upcoming) or days left (for ongoing)
	const daysUntilStart = $derived(() => {
		if (!trip) return 0;
		const start = new Date(trip.startDate);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		start.setHours(0, 0, 0, 0);
		const diffMs = start.getTime() - today.getTime();
		return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
	});

	const daysRemaining = $derived(() => {
		if (!trip) return 0;
		const end = new Date(trip.endDate);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		end.setHours(0, 0, 0, 0);
		if (today > end) return 0;
		const diffMs = end.getTime() - today.getTime();
		return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
	});

	// Projected total: what we've spent + current daily rate × remaining days
	const onTripDailyRate = $derived(elapsed > 0 ? onTripCents / elapsed : 0);
	const projectedTotal = $derived(
		totalSpentCents + onTripDailyRate * daysRemaining()
	);

	// Trip status
	const tripStatus = $derived(() => {
		if (!trip) return 'unknown';
		if (now < tripStart) return 'upcoming';
		if (now > tripEnd) return 'completed';
		return 'ongoing';
	});

	// Budget remaining per day
	const budgetRemainingPerDay = $derived(() => {
		if (!trip?.totalBudget) return null;
		const remaining = trip.totalBudget - totalSpentCents;
		// Upcoming trips: spread over full trip duration; ongoing: spread over remaining trip days
		const days = tripStatus() === 'upcoming' ? duration : daysRemaining();
		if (days <= 0) return null;
		return Math.max(0, Math.round(remaining / days));
	});

	const budgetPercent = $derived(
		trip?.totalBudget ? Math.min(100, (totalSpentCents / trip.totalBudget) * 100) : 0
	);
	const budgetColor = $derived(
		budgetPercent > 90 ? 'var(--destructive)' : budgetPercent > 70 ? 'var(--primary)' : 'var(--success-text)'
	);

	// Category breakdown with per-day averages
	// Pre-trip expenses are spread over the total trip duration for daily averages
	const categoryTotals = $derived(() => {
		const totals = new Map<CategoryId, number>();
		const preTripTotals = new Map<CategoryId, number>();
		const onTripTotals = new Map<CategoryId, number>();

		for (const expense of $activeExpenses) {
			const home = convertToHomeCurrency(expense.amount, expense.exchangeRate);
			totals.set(expense.categoryId, (totals.get(expense.categoryId) || 0) + home);
			const isPreTrip = new Date(expense.date).getTime() < tripStart;
			if (isPreTrip) {
				preTripTotals.set(expense.categoryId, (preTripTotals.get(expense.categoryId) || 0) + home);
			} else {
				onTripTotals.set(expense.categoryId, (onTripTotals.get(expense.categoryId) || 0) + home);
			}
		}

		return CATEGORIES
			.map((cat) => {
				const total = totals.get(cat.id) || 0;
				const preTrip = preTripTotals.get(cat.id) || 0;
				const onTrip = onTripTotals.get(cat.id) || 0;
				// Pre-trip expenses averaged over total duration, on-trip over elapsed days
				const preTripDaily = duration > 0 ? preTrip / duration : 0;
				const onTripDaily = elapsed > 0 ? onTrip / elapsed : 0;
				const avgPerDay = preTripDaily + onTripDaily;
				return { ...cat, total, avgPerDay };
			})
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
		<div class="mb-6">
			<h2 class="text-xl font-bold text-[var(--text)]">{trip.name}</h2>
			{#if trip.destination}
				<p class="text-sm text-[var(--text-muted)]">{trip.destination}</p>
			{/if}
			<p class="text-xs text-[var(--text-muted)]">
				{formatDateRange(trip.startDate, trip.endDate)} · {duration} days · {trip.numberOfPeople} {trip.numberOfPeople === 1 ? 'person' : 'people'}
				{#if tripStatus() === 'upcoming'}
					<span class="ml-1 text-[var(--primary)]">· Starts in {daysUntilStart()} {daysUntilStart() === 1 ? 'day' : 'days'}</span>
				{:else if tripStatus() === 'ongoing' && daysRemaining() > 0}
					<span class="ml-1 text-[var(--primary)]">· {daysRemaining()} days left</span>
				{:else if tripStatus() === 'completed'}
					<span class="ml-1">· Completed</span>
				{/if}
			</p>
			<div class="mt-2 flex justify-end gap-2">
				{#if isOwner}
					<button
						onclick={() => (showShare = true)}
						class="flex items-center gap-1 rounded-sm border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text)] hover:border-[var(--primary)]"
						data-testid="share-trip-btn"
					>
						<Users size={14} />
						Share
						{#if collaborators.length > 0}
							<span class="ml-1 text-xs text-[var(--text-muted)]">({collaborators.length})</span>
						{/if}
					</button>
				{:else if collaborators.length > 0}
					<span class="flex items-center gap-1 rounded-sm border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
						<Users size={14} />
						Shared · {collaborators.length + 1} members
					</span>
				{/if}
				<a
					href="/trips/{trip.id}/edit"
					class="flex items-center gap-1 rounded-sm border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text)] hover:border-[var(--primary)]"
					data-testid="edit-trip-btn"
				>
					<Pencil size={14} />
					Edit
				</a>
				<a
					href="/trips/{trip.id}/expenses/new"
					class="flex items-center gap-1 rounded-sm bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
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
				<div class="mt-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
					<span>{formatNumber(budgetPercent, 0)}% used</span>
					{#if budgetRemainingPerDay() !== null}
						<span>{formatCents(budgetRemainingPerDay()!, trip.homeCurrency)}/day remaining</span>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Stats grid -->
		<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
				<p class="text-xs text-[var(--text-muted)]">Total spent</p>
				<p class="mt-1 text-lg font-bold text-[var(--text)]">{formatCents(totalSpentCents, trip.homeCurrency)}</p>
				{#if preTripCents > 0}
					<p class="mt-0.5 text-xs text-[var(--text-muted)]">Pre-trip: {formatCents(preTripCents, trip.homeCurrency)}</p>
				{/if}
			</div>
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
				<p class="text-xs text-[var(--text-muted)]">Avg / day</p>
				<p class="mt-1 text-lg font-bold text-[var(--text)]">{formatCents(Math.round(avgPerDay), trip.homeCurrency)}</p>
				{#if preTripCents > 0}
					<p class="mt-0.5 text-xs text-[var(--text-muted)]">Incl. pre-trip</p>
				{/if}
			</div>
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
				<p class="text-xs text-[var(--text-muted)]">Avg / person</p>
				<p class="mt-1 text-lg font-bold text-[var(--text)]">{formatCents(Math.round(avgPerPerson), trip.homeCurrency)}</p>
			</div>
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
				<p class="text-xs text-[var(--text-muted)]">Projected total</p>
				<p class="mt-1 text-lg font-bold text-[var(--text)]">{formatCents(Math.round(projectedTotal), trip.homeCurrency)}</p>
				{#if preTripCents > 0}
					<p class="mt-0.5 text-xs text-[var(--text-muted)]">Incl. {formatCents(preTripCents, trip.homeCurrency)} fixed</p>
				{/if}
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
							{#if cat.avgPerDay > 0}
								<p class="mt-0.5 text-xs text-[var(--text-muted)]">
									{formatCents(Math.round(cat.avgPerDay), trip.homeCurrency)}/day
									{#if cat.id === 'accommodation'}
										(per night)
									{/if}
								</p>
							{/if}
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
			{#if !isOwner}
				<button
					onclick={async () => {
						if (!confirm('Leave this shared trip?')) return;
						const res = await fetch(`/api/trips/${tripId}/collaborators?userId=self`, { method: 'DELETE' });
						if (res.ok) window.location.href = '/';
					}}
					class="rounded-sm border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--destructive)] hover:border-[var(--destructive)]"
				>
					Leave trip
				</button>
			{/if}
		</div>
	</div>

	{#if showShare && isOwner}
		<ShareDialog
			{tripId}
			{collaborators}
			{ownerName}
			onClose={() => (showShare = false)}
			onUpdate={(updated) => (collaborators = updated)}
		/>
	{/if}
{:else}
	<p class="text-sm text-[var(--text-muted)]">Trip not found</p>
{/if}
