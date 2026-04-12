<script lang="ts">
	import MapPin from 'lucide-svelte/icons/map-pin';
	import X from 'lucide-svelte/icons/x';
	import Loader2 from 'lucide-svelte/icons/loader-2';

	let {
		latitude = $bindable<number | null>(null),
		longitude = $bindable<number | null>(null)
	}: {
		latitude: number | null;
		longitude: number | null;
	} = $props();

	let capturing = $state(false);
	let errorMsg = $state('');

	function captureLocation() {
		if (!navigator.geolocation) {
			errorMsg = 'Geolocation not supported';
			return;
		}
		capturing = true;
		errorMsg = '';
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				latitude = pos.coords.latitude;
				longitude = pos.coords.longitude;
				capturing = false;
			},
			(err) => {
				capturing = false;
				if (err.code === err.PERMISSION_DENIED) errorMsg = 'Location permission denied';
				else if (err.code === err.POSITION_UNAVAILABLE) errorMsg = 'Location unavailable';
				else errorMsg = 'Location request timed out';
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
		);
	}

	function clearLocation() {
		latitude = null;
		longitude = null;
		errorMsg = '';
	}
</script>

<div>
	{#if latitude !== null && longitude !== null}
		<div class="flex items-center gap-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-muted)]">
			<MapPin size={14} class="shrink-0 text-[var(--primary)]" />
			<a
				href="https://www.openstreetmap.org/?mlat={latitude}&mlon={longitude}#map=16/{latitude}/{longitude}"
				target="_blank"
				rel="noopener noreferrer"
				class="underline hover:text-[var(--primary)]"
			>
				{latitude.toFixed(5)}, {longitude.toFixed(5)}
			</a>
			<button type="button" onclick={clearLocation} class="ml-auto shrink-0 text-[var(--text-muted)] hover:text-[var(--destructive)]">
				<X size={14} />
			</button>
		</div>
	{:else}
		<button
			type="button"
			onclick={captureLocation}
			disabled={capturing}
			class="flex w-full items-center gap-2 rounded-sm border border-dashed border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
		>
			{#if capturing}
				<Loader2 size={14} class="animate-spin" />
				Locating...
			{:else}
				<MapPin size={14} />
				Add location
			{/if}
		</button>
	{/if}
	{#if errorMsg}
		<p class="mt-1 text-xs text-[var(--destructive)]">{errorMsg}</p>
	{/if}
</div>
