<script lang="ts">
	import { activeTrips, tripsLoaded } from '$lib/stores/trips.js';
	import { formatCents } from '$lib/utils/currency.js';
	import { formatDateRange } from '$lib/utils/dates.js';
	import Plus from 'lucide-svelte/icons/plus';
	import MapPin from 'lucide-svelte/icons/map-pin';
	import Calendar from 'lucide-svelte/icons/calendar';
</script>

<svelte:head>
	<title>42 - Trips</title>
</svelte:head>

<div class="pb-8">
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-xl font-bold text-[var(--text)]">Your Trips</h2>
		<a
			href="/trips/new"
			class="flex items-center gap-2 rounded-sm bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
			data-testid="new-trip-btn"
		>
			<Plus size={16} />
			New Trip
		</a>
	</div>

	{#if !$tripsLoaded}
		<p class="text-sm text-[var(--text-muted)]">Loading trips...</p>
	{:else if $activeTrips.length === 0}
		<div class="flex flex-col items-center justify-center py-16">
			<p class="font-['Press_Start_2P'] text-sm text-[var(--text-muted)]">No trips yet</p>
			<p class="mt-2 text-sm text-[var(--text-muted)]">Create your first trip to start tracking expenses</p>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each $activeTrips as trip (trip.id)}
				<a
					href="/trips/{trip.id}"
					class="group rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--card-shadow)] transition-all hover:border-[var(--primary)] hover:shadow-[var(--card-shadow-hover)]"
					data-testid="trip-card"
				>
					<h3 class="text-base font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{trip.name}</h3>

					{#if trip.destination}
						<div class="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]">
							<MapPin size={12} />
							{trip.destination}
						</div>
					{/if}

					<div class="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]">
						<Calendar size={12} />
						{formatDateRange(trip.startDate, trip.endDate)}
					</div>

					{#if trip.totalBudget}
						<div class="mt-3 h-2 overflow-hidden rounded-sm bg-[var(--border-subtle)]">
							<div class="h-full bg-[var(--primary)]" style="width: 0%"></div>
						</div>
						<p class="mt-1 text-xs text-[var(--text-muted)]">
							Budget: {formatCents(trip.totalBudget, trip.homeCurrency)}
						</p>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>
