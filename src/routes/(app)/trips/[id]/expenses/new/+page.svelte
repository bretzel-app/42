<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createExpense } from '$lib/stores/expenses.js';
	import { showToast } from '$lib/stores/toast.js';
	import { COMMON_CURRENCIES, parseToCents } from '$lib/utils/currency.js';
	import { toDateInput, fromDateInput } from '$lib/utils/dates.js';
	import { CATEGORIES } from '$lib/types/categories.js';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import SplitControls from '$lib/components/SplitControls.svelte';
	import LocationCapture from '$lib/components/LocationCapture.svelte';
	import { loadMembers, activeMembers } from '$lib/stores/members.js';
	import { getTrip, putTrip } from '$lib/sync/idb.js';
	import type { Trip, CategoryId } from '$lib/types/index.js';

	const tripId = $derived($page.params.id!);
	const currentUserId = $derived(($page.data.user?.id as number) ?? 0);

	let trip = $state<Trip | null>(null);

	let amountInput = $state('');
	let currency = $state('EUR');
	let exchangeRate = $state('1');
	let categoryId = $state<CategoryId>('food');
	let date = $state(toDateInput(new Date()));
	let note = $state('');
	let loading = $state(false);
	let errorMsg = $state('');
	let latitude = $state<number | null>(null);
	let longitude = $state<number | null>(null);

	let paidByMemberId = $state('');
	let splits = $state<{ memberId: string; amount: number }[]>([]);

	// Default paidByMemberId to the member linked to the current user
	$effect(() => {
		const myMember = $activeMembers.find((m) => m.userId === currentUserId);
		if (myMember && !paidByMemberId) {
			paidByMemberId = myMember.id;
		}
	});

	onMount(async () => {
		await loadMembers(tripId);

		// Load from IDB first for instant offline display
		try {
			const idbTrip = await getTrip(tripId);
			if (idbTrip) {
				trip = idbTrip;
				currency = idbTrip.homeCurrency;
			}
		} catch { /* IDB unavailable */ }

		// Then try server for fresh data
		try {
			const res = await fetch(`/api/trips/${tripId}`);
			if (res.ok) {
				const fetched: Trip = await res.json();
				trip = fetched;
				currency = fetched.homeCurrency;
				try { await putTrip(fetched); } catch { /* IDB unavailable */ }
			}
		} catch { /* offline — IDB data stands */ }
	});

	const showExchangeRate = $derived(trip && currency !== trip.homeCurrency);
	const amountCents = $derived(parseToCents(amountInput));

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errorMsg = '';

		const amount = parseToCents(amountInput);
		if (amount <= 0) {
			errorMsg = 'Amount must be greater than 0';
			return;
		}

		loading = true;
		const expense = await createExpense({
			tripId,
			amount,
			currency,
			exchangeRate: showExchangeRate ? exchangeRate : '1',
			categoryId,
			date: fromDateInput(date),
			note: note.trim(),
			paidByMemberId: paidByMemberId || null,
			latitude,
			longitude,
			splits: splits.length > 0 ? splits : undefined
		});
		loading = false;

		if (expense) {
			showToast('Expense added', 'success');
			goto(`/trips/${tripId}/expenses`);
		}
	}
</script>

<svelte:head>
	<title>Add Expense - 42</title>
</svelte:head>

<div class="mx-auto max-w-lg pb-8">
	<h2 class="mb-6 text-xl font-bold text-[var(--text)]">Add Expense</h2>

	<form onsubmit={handleSubmit} class="space-y-4">
		{#if errorMsg}
			<div class="rounded-sm border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]">
				{errorMsg}
			</div>
		{/if}

		<!-- Amount (large input) -->
		<div>
			<label for="amount" class="mb-1 block text-sm font-medium text-[var(--text)]">Amount *</label>
			<input
				id="amount"
				type="text"
				inputmode="decimal"
				bind:value={amountInput}
				placeholder="0.00"
				class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-4 text-center text-2xl font-bold text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
				data-testid="expense-amount-input"
				autofocus
			/>
		</div>

		<!-- Currency -->
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="currency" class="mb-1 block text-sm font-medium text-[var(--text)]">Currency</label>
				<select
					id="currency"
					bind:value={currency}
					class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
					data-testid="expense-currency-select"
				>
					{#each COMMON_CURRENCIES as c}
						<option value={c}>{c}</option>
					{/each}
				</select>
			</div>
			{#if showExchangeRate}
				<div>
					<label for="rate" class="mb-1 block text-sm font-medium text-[var(--text)]">Exchange rate</label>
					<input
						id="rate"
						type="text"
						inputmode="decimal"
						bind:value={exchangeRate}
						placeholder="1.00"
						class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
						data-testid="expense-rate-input"
					/>
				</div>
			{/if}
		</div>

		<!-- Category icons -->
		<div>
			<label class="mb-2 block text-sm font-medium text-[var(--text)]">Category</label>
			<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
				{#each CATEGORIES as cat}
					<button
						type="button"
						onclick={() => (categoryId = cat.id)}
						class="flex flex-col items-center gap-1 rounded-sm border p-3 text-xs transition-colors {categoryId === cat.id ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border-subtle)] hover:border-[var(--primary)]'}"
						data-testid="category-{cat.id}"
					>
						<CategoryIcon categoryId={cat.id} size={20} />
						<span class="text-[10px]">{cat.label.split(' ')[0]}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Date -->
		<div>
			<label for="date" class="mb-1 block text-sm font-medium text-[var(--text)]">Date</label>
			<input
				id="date"
				type="date"
				bind:value={date}
				class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
				data-testid="expense-date"
			/>
		</div>

		<!-- Note -->
		<div>
			<label for="note" class="mb-1 block text-sm font-medium text-[var(--text)]">Note (optional)</label>
			<input
				id="note"
				type="text"
				bind:value={note}
				placeholder="e.g. Lunch at café"
				class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
				data-testid="expense-note-input"
			/>
		</div>

		<!-- Location (optional) -->
		<LocationCapture bind:latitude bind:longitude />

		<!-- Split controls (only when 2+ members and splitExpenses enabled) -->
		{#if $activeMembers.length >= 2 && trip?.splitExpenses !== false}
			<SplitControls
				amount={amountCents}
				{currency}
				members={$activeMembers}
				{currentUserId}
				{paidByMemberId}
				{splits}
				onPaidByChange={(id) => (paidByMemberId = id)}
				onSplitsChange={(s) => (splits = s)}
			/>
		{/if}

		<div class="flex gap-3 pt-2">
			<a href="/trips/{tripId}/expenses" class="rounded-sm border border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text)] hover:border-[var(--primary)]">Cancel</a>
			<button
				type="submit"
				disabled={loading}
				class="flex-1 rounded-sm bg-[var(--primary)] py-3 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
				data-testid="expense-save-btn"
			>
				{loading ? 'Adding...' : 'Add Expense'}
			</button>
		</div>
	</form>
</div>
