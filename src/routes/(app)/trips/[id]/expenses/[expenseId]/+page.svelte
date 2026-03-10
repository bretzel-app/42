<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { updateExpense, deleteExpense, loadExpenses } from '$lib/stores/expenses.js';
	import { showToast } from '$lib/stores/toast.js';
	import { COMMON_CURRENCIES, parseToCents, formatAmount } from '$lib/utils/currency.js';
	import { toDateInput, fromDateInput } from '$lib/utils/dates.js';
	import { CATEGORIES } from '$lib/types/categories.js';
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import type { Trip, Expense, CategoryId } from '$lib/types/index.js';

	const tripId = $derived($page.params.id!);
	const expenseId = $derived($page.params.expenseId!);

	let trip = $state<Trip | null>(null);
	let amountInput = $state('');
	let currency = $state('EUR');
	let exchangeRate = $state('1');
	let categoryId = $state<CategoryId>('food');
	let date = $state('');
	let note = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let errorMsg = $state('');

	onMount(async () => {
		try {
			const [tripRes, expensesRes] = await Promise.all([
				fetch(`/api/trips/${tripId}`),
				fetch(`/api/trips/${tripId}/expenses`)
			]);
			if (tripRes.ok) trip = await tripRes.json();
			if (expensesRes.ok) {
				const allExpenses: Expense[] = await expensesRes.json();
				const expense = allExpenses.find((e) => e.id === expenseId);
				if (expense) {
					amountInput = formatAmount(expense.amount);
					currency = expense.currency;
					exchangeRate = expense.exchangeRate;
					categoryId = expense.categoryId;
					date = toDateInput(expense.date);
					note = expense.note;
				}
			}
		} catch { /* offline */ }
		loading = false;
	});

	const showExchangeRate = $derived(trip && currency !== trip.homeCurrency);

	async function handleSave(e: Event) {
		e.preventDefault();
		errorMsg = '';
		const amount = parseToCents(amountInput);
		if (amount <= 0) { errorMsg = 'Amount must be greater than 0'; return; }
		saving = true;
		await updateExpense(tripId, expenseId, {
			amount,
			currency,
			exchangeRate: showExchangeRate ? exchangeRate : '1',
			categoryId,
			date: fromDateInput(date),
			note: note.trim()
		});
		saving = false;
		showToast('Expense updated', 'success');
		goto(`/trips/${tripId}/expenses`);
	}

	async function handleDelete() {
		await deleteExpense(tripId, expenseId);
		showToast('Expense deleted', 'success');
		goto(`/trips/${tripId}/expenses`);
	}
</script>

<svelte:head>
	<title>Edit Expense - 42</title>
</svelte:head>

{#if loading}
	<p class="text-sm text-[var(--text-muted)]">Loading...</p>
{:else}
	<div class="mx-auto max-w-lg pb-8">
		<h2 class="mb-6 text-xl font-bold text-[var(--text)]">Edit Expense</h2>

		<form onsubmit={handleSave} class="space-y-4">
			{#if errorMsg}
				<div class="rounded-sm border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]">{errorMsg}</div>
			{/if}

			<div>
				<label for="amount" class="mb-1 block text-sm font-medium text-[var(--text)]">Amount *</label>
				<input id="amount" type="text" inputmode="decimal" bind:value={amountInput} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-4 text-center text-2xl font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]" />
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="currency" class="mb-1 block text-sm font-medium text-[var(--text)]">Currency</label>
					<select id="currency" bind:value={currency} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]">
						{#each COMMON_CURRENCIES as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>
				{#if showExchangeRate}
					<div>
						<label for="rate" class="mb-1 block text-sm font-medium text-[var(--text)]">Exchange rate</label>
						<input id="rate" type="text" inputmode="decimal" bind:value={exchangeRate} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
					</div>
				{/if}
			</div>

			<div>
				<label class="mb-2 block text-sm font-medium text-[var(--text)]">Category</label>
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
					{#each CATEGORIES as cat}
						<button
							type="button"
							onclick={() => (categoryId = cat.id)}
							class="flex flex-col items-center gap-1 rounded-sm border p-3 text-xs transition-colors {categoryId === cat.id ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border-subtle)] hover:border-[var(--primary)]'}"
						>
							<CategoryIcon categoryId={cat.id} size={20} />
							<span class="text-[10px]">{cat.label.split(' ')[0]}</span>
						</button>
					{/each}
				</div>
			</div>

			<div>
				<label for="date" class="mb-1 block text-sm font-medium text-[var(--text)]">Date</label>
				<input id="date" type="date" bind:value={date} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
			</div>

			<div>
				<label for="note" class="mb-1 block text-sm font-medium text-[var(--text)]">Note (optional)</label>
				<input id="note" type="text" bind:value={note} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]" />
			</div>

			<div class="flex items-center justify-between pt-2">
				<button type="button" onclick={handleDelete} class="text-sm text-[var(--destructive)] hover:underline">Delete</button>
				<div class="flex gap-3">
					<a href="/trips/{tripId}/expenses" class="rounded-sm border border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text)] hover:border-[var(--primary)]">Cancel</a>
					<button type="submit" disabled={saving} class="rounded-sm bg-[var(--primary)] px-6 py-3 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50">
						{saving ? 'Saving...' : 'Save'}
					</button>
				</div>
			</div>
		</form>
	</div>
{/if}
