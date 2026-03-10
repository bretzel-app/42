<script lang="ts">
	import SyncIndicator from '../SyncIndicator.svelte';
	import Menu from 'lucide-svelte/icons/menu';

	interface Props {
		onMenuToggle: () => void;
	}

	let { onMenuToggle }: Props = $props();
</script>

<header class="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[var(--border)] bg-[var(--bg-surface)] px-4">
	<button
		onclick={onMenuToggle}
		class="rounded-sm p-2 hover:bg-[var(--border)]/10"
		aria-label="Toggle sidebar"
	>
		<Menu class="h-6 w-6 text-[var(--text)]" />
	</button>

	<div class="flex items-center gap-2">
		<img src="/favicon.svg" alt="" class="h-8 w-8" />
		<h1 class="font-['Press_Start_2P'] text-lg text-[var(--primary)]">42</h1>
	</div>

	<div class="flex-1"></div>

	<div class="flex items-center gap-2">
		<SyncIndicator />
	</div>
</header>
