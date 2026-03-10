<script lang="ts">
	import { toasts, dismiss } from '$lib/stores/toast.js';
</script>

<div class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
	{#each $toasts as toast (toast.id)}
		<div
			class="flex items-center gap-3 rounded-sm border px-4 py-3 shadow-[var(--card-shadow)] {toast.type === 'error' ? 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)]' : toast.type === 'success' ? 'border-[var(--border-subtle)] bg-[var(--success-bg)] text-[var(--success-text)]' : 'border-[var(--border)] bg-[var(--text)] text-[var(--bg-base)]'}"
		>
			<span class="text-sm">{toast.text}</span>
			{#if toast.action}
				<button
					onclick={() => { toast.action?.handler(); dismiss(toast.id); }}
					class="text-sm font-semibold underline"
				>
					{toast.action.label}
				</button>
			{/if}
			<button onclick={() => dismiss(toast.id)} class="ml-2 opacity-70 hover:opacity-100">&times;</button>
		</div>
	{/each}
</div>
