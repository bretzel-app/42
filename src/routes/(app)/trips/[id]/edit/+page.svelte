<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { updateTrip, deleteTrip } from '$lib/stores/trips.js';
	import { showToast } from '$lib/stores/toast.js';
	import { COMMON_CURRENCIES, parseToCents, formatAmount } from '$lib/utils/currency.js';
	import { toDateInput, fromDateInput } from '$lib/utils/dates.js';
	import type { Trip } from '$lib/types/index.js';

	const tripId = $derived($page.params.id!);

	let name = $state('');
	let destination = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let numberOfPeople = $state(1);
	let budgetInput = $state('');
	let homeCurrency = $state('EUR');
	let loading = $state(true);
	let saving = $state(false);
	let errorMsg = $state('');
	let showDeleteConfirm = $state(false);

	onMount(async () => {
		try {
			const res = await fetch(`/api/trips/${tripId}`);
			if (res.ok) {
				const trip: Trip = await res.json();
				name = trip.name;
				destination = trip.destination;
				startDate = toDateInput(trip.startDate);
				endDate = toDateInput(trip.endDate);
				numberOfPeople = trip.numberOfPeople;
				budgetInput = trip.totalBudget ? formatAmount(trip.totalBudget) : '';
				homeCurrency = trip.homeCurrency;
			}
		} catch { /* offline */ }
		loading = false;
	});

	async function handleSave(e: Event) {
		e.preventDefault();
		errorMsg = '';
		if (!name.trim()) {
			errorMsg = 'Trip name is required';
			return;
		}
		saving = true;
		const budget = budgetInput ? parseToCents(budgetInput) : null;
		await updateTrip(tripId, {
			name: name.trim(),
			destination: destination.trim(),
			startDate: fromDateInput(startDate),
			endDate: fromDateInput(endDate),
			numberOfPeople,
			totalBudget: budget,
			homeCurrency
		});
		saving = false;
		showToast('Trip updated', 'success');
		goto(`/trips/${tripId}`);
	}

	async function handleDelete() {
		await deleteTrip(tripId);
		showToast('Trip deleted', 'success');
		goto('/');
	}
</script>

<svelte:head>
	<title>Edit Trip - 42</title>
</svelte:head>

{#if loading}
	<p class="text-sm text-[var(--text-muted)]">Loading...</p>
{:else}
	<div class="mx-auto max-w-lg pb-8">
		<h2 class="mb-6 text-xl font-bold text-[var(--text)]">Edit Trip</h2>

		<form onsubmit={handleSave} class="space-y-4">
			{#if errorMsg}
				<div class="rounded-sm border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]">
					{errorMsg}
				</div>
			{/if}

			<div>
				<label for="name" class="mb-1 block text-sm font-medium text-[var(--text)]">Trip name *</label>
				<input id="name" type="text" bind:value={name} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" required />
			</div>

			<div>
				<label for="destination" class="mb-1 block text-sm font-medium text-[var(--text)]">Destination</label>
				<input id="destination" type="text" bind:value={destination} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="start-date" class="mb-1 block text-sm font-medium text-[var(--text)]">Start date</label>
					<input id="start-date" type="date" bind:value={startDate} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
				</div>
				<div>
					<label for="end-date" class="mb-1 block text-sm font-medium text-[var(--text)]">End date</label>
					<input id="end-date" type="date" bind:value={endDate} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
				</div>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="people" class="mb-1 block text-sm font-medium text-[var(--text)]">Travelers</label>
					<input id="people" type="number" min="1" bind:value={numberOfPeople} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
				</div>
				<div>
					<label for="currency" class="mb-1 block text-sm font-medium text-[var(--text)]">Home currency</label>
					<select id="currency" bind:value={homeCurrency} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]">
						{#each COMMON_CURRENCIES as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>
			</div>

			<div>
				<label for="budget" class="mb-1 block text-sm font-medium text-[var(--text)]">Budget (optional)</label>
				<input id="budget" type="text" inputmode="decimal" bind:value={budgetInput} placeholder="e.g. 2000.00" class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]" />
			</div>

			<div class="flex items-center justify-between pt-2">
				<button
					type="button"
					onclick={() => (showDeleteConfirm = !showDeleteConfirm)}
					class="text-sm text-[var(--destructive)] hover:underline"
				>
					Delete trip
				</button>
				<div class="flex gap-3">
					<a href="/trips/{tripId}" class="rounded-sm border border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text)] hover:border-[var(--primary)]">Cancel</a>
					<button type="submit" disabled={saving} class="rounded-sm bg-[var(--primary)] px-6 py-3 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50">
						{saving ? 'Saving...' : 'Save'}
					</button>
				</div>
			</div>
		</form>

		{#if showDeleteConfirm}
			<div class="mt-4 rounded-sm border border-[var(--error-border)] bg-[var(--error-bg)] p-4">
				<p class="mb-3 text-sm text-[var(--error-text)]">This will permanently delete this trip and all its expenses.</p>
				<div class="flex gap-3">
					<button onclick={() => (showDeleteConfirm = false)} class="rounded-sm border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text)]">Cancel</button>
					<button onclick={handleDelete} class="rounded-sm bg-[var(--destructive)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" data-testid="confirm-delete-btn">Confirm delete</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
