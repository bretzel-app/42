<script lang="ts">
	import { formatCents } from '$lib/utils/currency.js';
	import type { MemberBalance } from '$lib/types/index.js';

	interface Props {
		balance: MemberBalance;
		homeCurrency: string;
	}

	const { balance, homeCurrency }: Props = $props();

	const initials = $derived(
		balance.memberName
			.split(' ')
			.map((w) => w[0])
			.join('')
			.toUpperCase()
			.slice(0, 2)
	);

	const isPositive = $derived(balance.balance >= 0);
</script>

<div class="flex items-center gap-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[var(--card-shadow)]">
	<!-- Avatar -->
	<div
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-xs font-bold"
		style="background-color: {isPositive ? '#d4e8d4' : '#f0d0cc'}; color: {isPositive ? '#3a5a3a' : 'var(--destructive)'};"
	>
		{initials}
	</div>

	<!-- Name + subtitle -->
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium text-[var(--text)]">{balance.memberName}</p>
		<p class="text-xs text-[var(--text-muted)]">
			Paid {formatCents(balance.totalPaid, homeCurrency)} / Owes {formatCents(balance.totalOwed, homeCurrency)}
		</p>
	</div>

	<!-- Balance amount -->
	<div
		class="shrink-0 text-right text-sm font-bold"
		style="color: {isPositive ? '#5a7a5a' : 'var(--destructive)'};"
	>
		{isPositive ? '+' : ''}{formatCents(balance.balance, homeCurrency)}
	</div>
</div>
