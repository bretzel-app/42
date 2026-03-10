<script lang="ts">
	import { page } from '$app/stores';

	let appVersion = $derived($page.data.appVersion);
</script>

<div class="space-y-8">
	<div class="flex items-center gap-3">
		<h2 class="text-xl font-bold text-[var(--text)]">About 42</h2>
		<span class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
			v{appVersion}
		</span>
	</div>

	<section class="space-y-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--card-shadow)]">
		<h3 class="text-sm font-bold text-[var(--text)]">What is 42?</h3>
		<p class="text-sm leading-relaxed text-[var(--text-muted)]">
			42 is a self-hostable holiday budget tracking app. Track trip expenses in multiple currencies,
			view real-time dashboard analytics, and stay within budget — all with offline-first
			reliability.
		</p>
	</section>

	<section class="space-y-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--card-shadow)]">
		<h3 class="text-sm font-bold text-[var(--text)]">Bretzel App Universe</h3>
		<p class="text-sm leading-relaxed text-[var(--text-muted)]">
			42 is part of the
			<a href="https://bretzel.app" target="_blank" rel="noopener noreferrer" class="text-[var(--primary)] underline hover:text-[var(--primary-hover)]">Bretzel</a>
			family of apps.
		</p>
	</section>

	<section class="space-y-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--card-shadow)]">
		<h3 class="text-sm font-bold text-[var(--text)]">Open Source</h3>
		<p class="text-sm leading-relaxed text-[var(--text-muted)]">
			42 is licensed under the MIT License. Source code is available on
			<a href="https://github.com/bretzel-app/42/" target="_blank" rel="noopener noreferrer" class="text-[var(--primary)] underline hover:text-[var(--primary-hover)]">GitHub</a>.
		</p>
	</section>

	<section class="space-y-2 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--card-shadow)]">
		<h3 class="text-sm font-bold text-[var(--text)]">Tech Stack</h3>
		<p class="text-sm leading-relaxed text-[var(--text-muted)]">
			Built with SvelteKit, SQLite, and Drizzle ORM. Offline-first PWA with CRDT-based sync.
		</p>
	</section>
</div>
