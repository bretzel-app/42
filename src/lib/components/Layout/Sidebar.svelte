<script lang="ts">
	import { page } from '$app/stores';
	import { Plane, Settings } from 'lucide-svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
	}

	let { open, onClose }: Props = $props();

	function closeMobile() {
		if (window.matchMedia('(max-width: 1023px)').matches) {
			onClose?.();
		}
	}

	const navItems = [
		{ href: '/', label: 'Trips', icon: Plane, match: (p: string) => p === '/' }
	];
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 top-16 z-10 bg-black/30 lg:hidden"
		onclick={onClose}
		onkeydown={(e) => { if (e.key === 'Escape') onClose?.(); }}
	></div>
{/if}

<aside
	class="fixed left-0 top-16 z-20 h-[calc(100vh-4rem)] w-64 transform border-r border-[var(--border)] bg-[var(--bg-surface)] transition-transform duration-200 {open ? 'translate-x-0' : '-translate-x-full'}"
>
	<nav class="p-2">
		<ul class="space-y-1">
			{#each navItems as item}
				<li>
					<a
						href={item.href}
						onclick={closeMobile}
						class="flex w-full items-center gap-3 rounded-sm px-6 py-3 text-left text-sm transition-colors {item.match($page.url.pathname) ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'text-[var(--text)] hover:bg-[var(--bg-base)]'}"
					>
						<item.icon size={20} />
						{item.label}
					</a>
				</li>
			{/each}
		</ul>

		{#if $page.url.pathname.startsWith('/trips/')}
			{@const tripId = $page.params?.id}
			{#if tripId}
				<div class="mt-6 border-t border-[var(--border-subtle)] pt-4">
					<h3 class="px-6 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Current Trip</h3>
					<ul class="mt-2 space-y-1">
						<li>
							<a
								href="/trips/{tripId}"
								onclick={closeMobile}
								class="flex w-full items-center gap-3 rounded-sm px-6 py-2 text-left text-sm transition-colors {$page.url.pathname === `/trips/${tripId}` ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'text-[var(--text)] hover:bg-[var(--bg-base)]'}"
							>
								Dashboard
							</a>
						</li>
						<li>
							<a
								href="/trips/{tripId}/expenses"
								onclick={closeMobile}
								class="flex w-full items-center gap-3 rounded-sm px-6 py-2 text-left text-sm transition-colors {$page.url.pathname.includes(`/trips/${tripId}/expenses`) ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'text-[var(--text)] hover:bg-[var(--bg-base)]'}"
							>
								Expenses
							</a>
						</li>
					</ul>
				</div>
			{/if}
		{/if}
	</nav>
	<div class="absolute bottom-0 left-0 w-full border-t border-[var(--border-subtle)]">
		<a
			href="/settings"
			class="flex w-full items-center gap-3 rounded-sm px-6 py-3 text-left text-sm transition-colors {$page.url.pathname.startsWith('/settings') ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'text-[var(--text)] hover:bg-[var(--bg-base)]'}"
			onclick={closeMobile}
			data-testid="settings-link"
		>
			<Settings size={20} />
			Settings
		</a>
	</div>
</aside>
