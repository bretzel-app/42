<script lang="ts">
	import { getPreferences, updatePreference } from '$lib/stores/preferences.svelte.js';
	import { COMMON_CURRENCIES } from '$lib/utils/currency.js';

	const prefs = $derived(getPreferences());
</script>

<div class="space-y-8">
	<h2 class="text-xl font-bold text-[var(--text)]">Preferences</h2>

	<!-- Default currency -->
	<div class="space-y-2">
		<span class="block text-sm font-medium text-[var(--text)]">Default currency</span>
		<select
			value={prefs.defaultCurrency}
			onchange={(e) => updatePreference('defaultCurrency', (e.target as HTMLSelectElement).value)}
			class="w-48 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
			data-testid="pref-currency"
		>
			{#each COMMON_CURRENCIES as c}
				<option value={c}>{c}</option>
			{/each}
		</select>
	</div>

	<!-- Hide footer -->
	<div class="flex items-center gap-3">
		<input
			type="checkbox"
			id="hide-footer"
			checked={prefs.hideFooter}
			onchange={() => updatePreference('hideFooter', !prefs.hideFooter)}
			class="h-4 w-4 rounded-sm"
			data-testid="pref-hide-footer"
		/>
		<label for="hide-footer" class="text-sm text-[var(--text)]">Hide footer</label>
	</div>

	<!-- Sidebar default state -->
	<div class="flex items-center gap-3">
		<input
			type="checkbox"
			id="sidebar-default"
			checked={prefs.sidebarDefaultState === 'collapsed'}
			onchange={() => updatePreference('sidebarDefaultState', prefs.sidebarDefaultState === 'collapsed' ? 'open' : 'collapsed')}
			class="h-4 w-4 rounded-sm"
			data-testid="pref-sidebar-default"
		/>
		<label for="sidebar-default" class="text-sm text-[var(--text)]">Start with sidebar collapsed</label>
	</div>
</div>
