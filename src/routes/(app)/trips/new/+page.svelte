<script lang="ts">
	import { goto } from '$app/navigation';
	import { createTrip } from '$lib/stores/trips.js';
	import { getPreferences } from '$lib/stores/preferences.svelte.js';
	import { showToast } from '$lib/stores/toast.js';
	import { COMMON_CURRENCIES, parseToCents } from '$lib/utils/currency.js';
	import { toDateInput, fromDateInput } from '$lib/utils/dates.js';

	let name = $state('');
	let destination = $state('');
	let startDate = $state(toDateInput(new Date()));
	let endDate = $state(toDateInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
	let numberOfPeople = $state(1);
	let budgetInput = $state('');
	let homeCurrency = $state(getPreferences().defaultCurrency || 'EUR');
	let loading = $state(false);
	let errorMsg = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		errorMsg = '';

		if (!name.trim()) {
			errorMsg = 'Trip name is required';
			return;
		}

		loading = true;

		const budget = budgetInput ? parseToCents(budgetInput) : null;
		const trip = await createTrip({
			name: name.trim(),
			destination: destination.trim(),
			startDate: fromDateInput(startDate),
			endDate: fromDateInput(endDate),
			numberOfPeople,
			totalBudget: budget,
			homeCurrency
		});

		loading = false;

		if (trip) {
			showToast('Trip created', 'success');
			goto(`/trips/${trip.id}`);
		}
	}
</script>

<svelte:head>
	<title>New Trip - 42</title>
</svelte:head>

<div class="mx-auto max-w-lg pb-8">
	<h2 class="mb-6 text-xl font-bold text-[var(--text)]">New Trip</h2>

	<form onsubmit={handleSubmit} class="space-y-4">
		{#if errorMsg}
			<div class="rounded-sm border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]">
				{errorMsg}
			</div>
		{/if}

		<div>
			<label for="name" class="mb-1 block text-sm font-medium text-[var(--text)]">Trip name *</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				placeholder="e.g. Paris 2026"
				class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
				data-testid="trip-name-input"
				required
			/>
		</div>

		<div>
			<label for="destination" class="mb-1 block text-sm font-medium text-[var(--text)]">Destination</label>
			<input
				id="destination"
				type="text"
				bind:value={destination}
				placeholder="e.g. Paris, France"
				class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
				data-testid="trip-destination-input"
			/>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="start-date" class="mb-1 block text-sm font-medium text-[var(--text)]">Start date</label>
				<input
					id="start-date"
					type="date"
					bind:value={startDate}
					class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
					data-testid="trip-start-date"
				/>
			</div>
			<div>
				<label for="end-date" class="mb-1 block text-sm font-medium text-[var(--text)]">End date</label>
				<input
					id="end-date"
					type="date"
					bind:value={endDate}
					class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
					data-testid="trip-end-date"
				/>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="people" class="mb-1 block text-sm font-medium text-[var(--text)]">Travelers</label>
				<input
					id="people"
					type="number"
					min="1"
					bind:value={numberOfPeople}
					class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
					data-testid="trip-people-input"
				/>
			</div>
			<div>
				<label for="currency" class="mb-1 block text-sm font-medium text-[var(--text)]">Home currency</label>
				<select
					id="currency"
					bind:value={homeCurrency}
					class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
					data-testid="trip-currency-select"
				>
					{#each COMMON_CURRENCIES as c}
						<option value={c}>{c}</option>
					{/each}
				</select>
			</div>
		</div>

		<div>
			<label for="budget" class="mb-1 block text-sm font-medium text-[var(--text)]">Budget (optional)</label>
			<input
				id="budget"
				type="text"
				inputmode="decimal"
				bind:value={budgetInput}
				placeholder="e.g. 2000.00"
				class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
				data-testid="trip-budget-input"
			/>
		</div>

		<div class="flex gap-3 pt-2">
			<a
				href="/"
				class="rounded-sm border border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text)] hover:border-[var(--primary)]"
			>
				Cancel
			</a>
			<button
				type="submit"
				disabled={loading}
				class="flex-1 rounded-sm bg-[var(--primary)] py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-50"
				data-testid="trip-save-btn"
			>
				{loading ? 'Creating...' : 'Create Trip'}
			</button>
		</div>
	</form>
</div>
