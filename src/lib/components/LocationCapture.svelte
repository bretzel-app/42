<script lang="ts">
	import MapPin from 'lucide-svelte/icons/map-pin';
	import X from 'lucide-svelte/icons/x';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Check from 'lucide-svelte/icons/check';
	import { sanitizeCoords } from '$lib/utils/coords';

	let {
		latitude = $bindable<number | null>(null),
		longitude = $bindable<number | null>(null)
	}: {
		latitude: number | null;
		longitude: number | null;
	} = $props();

	let capturing = $state(false);
	let errorMsg = $state('');
	let editing = $state(false);
	let latInput = $state('');
	let lngInput = $state('');

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

	function startEditing() {
		latInput = latitude !== null ? String(latitude) : '';
		lngInput = longitude !== null ? String(longitude) : '';
		errorMsg = '';
		editing = true;
	}

	function cancelEditing() {
		editing = false;
		errorMsg = '';
	}

	function saveManual() {
		const trimmedLat = latInput.trim();
		const trimmedLng = lngInput.trim();
		if (trimmedLat === '' && trimmedLng === '') {
			latitude = null;
			longitude = null;
			errorMsg = '';
			editing = false;
			return;
		}
		const sanitized = sanitizeCoords(trimmedLat, trimmedLng);
		if (sanitized.latitude === null || sanitized.longitude === null) {
			errorMsg = 'Enter a valid lat (-90 to 90) and lng (-180 to 180)';
			return;
		}
		latitude = sanitized.latitude;
		longitude = sanitized.longitude;
		errorMsg = '';
		editing = false;
	}
</script>

<div>
	{#if editing}
		<div class="flex flex-col gap-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
			<div class="flex gap-2">
				<input
					type="text"
					inputmode="decimal"
					bind:value={latInput}
					placeholder="Latitude"
					aria-label="Latitude"
					class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
					data-testid="location-lat-input"
				/>
				<input
					type="text"
					inputmode="decimal"
					bind:value={lngInput}
					placeholder="Longitude"
					aria-label="Longitude"
					class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
					data-testid="location-lng-input"
				/>
			</div>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={saveManual}
					class="flex items-center gap-1 rounded-sm border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
					data-testid="location-save"
				>
					<Check size={14} />
					Save
				</button>
				<button
					type="button"
					onclick={cancelEditing}
					class="rounded-sm border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
					data-testid="location-cancel"
				>
					Cancel
				</button>
			</div>
		</div>
	{:else if latitude !== null && longitude !== null}
		<div
			class="flex items-center gap-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-muted)]"
		>
			<MapPin size={14} class="shrink-0 text-[var(--primary)]" />
			<a
				href="https://www.openstreetmap.org/?mlat={latitude}&mlon={longitude}#map=16/{latitude}/{longitude}"
				target="_blank"
				rel="noopener noreferrer"
				class="underline hover:text-[var(--primary)]"
			>
				{latitude.toFixed(5)}, {longitude.toFixed(5)}
			</a>
			<button
				type="button"
				onclick={startEditing}
				aria-label="Edit coordinates"
				class="ml-auto shrink-0 text-[var(--text-muted)] hover:text-[var(--primary)]"
				data-testid="location-edit"
			>
				<Pencil size={14} />
			</button>
			<button
				type="button"
				onclick={clearLocation}
				aria-label="Clear location"
				class="shrink-0 text-[var(--text-muted)] hover:text-[var(--destructive)]"
			>
				<X size={14} />
			</button>
		</div>
	{:else}
		<div class="flex gap-2">
			<button
				type="button"
				onclick={captureLocation}
				disabled={capturing}
				class="flex flex-1 items-center justify-center gap-2 rounded-sm border border-dashed border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
			>
				{#if capturing}
					<Loader2 size={14} class="animate-spin" />
					Locating...
				{:else}
					<MapPin size={14} />
					Add location
				{/if}
			</button>
			<button
				type="button"
				onclick={startEditing}
				aria-label="Enter coordinates manually"
				class="flex shrink-0 items-center justify-center gap-1 rounded-sm border border-dashed border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
				data-testid="location-manual"
			>
				<Pencil size={14} />
			</button>
		</div>
	{/if}
	{#if errorMsg}
		<p class="mt-1 text-xs text-[var(--destructive)]">{errorMsg}</p>
	{/if}
</div>
