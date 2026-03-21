<script lang="ts">
	import type { TripMember } from '$lib/types/index.js';
	import { computeEqualSplit } from '$lib/utils/splits.js';
	import { formatCents } from '$lib/utils/currency.js';

	interface Props {
		amount: number; // cents
		currency: string;
		members: TripMember[];
		currentUserId: number;
		paidByMemberId: string;
		splits: { memberId: string; amount: number }[];
		onPaidByChange: (memberId: string) => void;
		onSplitsChange: (splits: { memberId: string; amount: number }[]) => void;
	}

	let {
		amount,
		currency,
		members,
		currentUserId,
		paidByMemberId,
		splits,
		onPaidByChange,
		onSplitsChange
	}: Props = $props();

	type SplitMode = 'equal' | 'custom';

	let splitMode = $state<SplitMode>('equal');

	// For equal mode: which members are checked (by id)
	let checkedMemberIds = $state<Set<string>>(new Set<string>());

	// For custom mode: editable inputs keyed by memberId
	let customAmounts = $state<Record<string, string>>({});

	// Detect if incoming splits are custom (not equal) when editing
	let initialSplitModeDetected = $state(false);
	$effect(() => {
		if (!initialSplitModeDetected && splits.length > 0 && members.length >= 2) {
			const includedIds = splits.filter(s => s.amount > 0).map(s => s.memberId);
			if (includedIds.length > 0) {
				const equalResult = computeEqualSplit(amount, includedIds);
				const isEqual = splits.every(s => {
					if (s.amount === 0 && !(s.memberId in equalResult)) return true;
					return equalResult[s.memberId] === s.amount;
				});
				if (!isEqual) {
					splitMode = 'custom';
				}
			}
			initialSplitModeDetected = true;
		}
	});

	// Initialise custom amounts from current splits (e.g. when editing)
	$effect(() => {
		if (splits.length > 0 && Object.keys(customAmounts).length === 0) {
			const init: Record<string, string> = {};
			for (const s of splits) {
				init[s.memberId] = (s.amount / 100).toFixed(2);
			}
			customAmounts = init;
		}
	});

	// Re-init checkedMemberIds when members list changes (e.g. loaded async)
	$effect(() => {
		checkedMemberIds = new Set(members.map((m) => m.id));
	});

	// Recalculate equal splits when amount or checked members change
	$effect(() => {
		if (splitMode !== 'equal') return;
		if (!initialSplitModeDetected && splits.length > 0) return;
		const ids = [...checkedMemberIds];
		if (ids.length === 0 || amount <= 0) {
			onSplitsChange([]);
			return;
		}
		const result = computeEqualSplit(amount, ids);
		onSplitsChange(Object.entries(result).map(([memberId, amt]) => ({ memberId, amount: amt })));
	});

	function handlePaidByClick(memberId: string) {
		onPaidByChange(memberId);
	}

	function handleEqualToggle(memberId: string, checked: boolean) {
		const next = new Set(checkedMemberIds);
		if (checked) {
			next.add(memberId);
		} else {
			next.delete(memberId);
		}
		checkedMemberIds = next;
	}

	function handleModeSwitch(mode: SplitMode) {
		splitMode = mode;
		if (mode === 'equal') {
			// Reset to all checked and recalculate
			checkedMemberIds = new Set(members.map((m) => m.id));
			// The $effect above will fire and call onSplitsChange
		} else {
			// Seed custom amounts from current equal splits
			const init: Record<string, string> = {};
			for (const s of splits) {
				init[s.memberId] = (s.amount / 100).toFixed(2);
			}
			// Fill in any missing members with 0
			for (const m of members) {
				if (!(m.id in init)) {
					init[m.id] = '0.00';
				}
			}
			customAmounts = init;
		}
	}

	function handleCustomInput(memberId: string, value: string) {
		customAmounts = { ...customAmounts, [memberId]: value };
		// Emit parsed splits
		const newSplits = members.map((m) => {
			const raw = customAmounts[m.id] ?? '0';
			const parsed = parseFloat(raw.replace(',', '.'));
			const cents = isNaN(parsed) ? 0 : Math.round(parsed * 100);
			return { memberId: m.id, amount: cents };
		});
		onSplitsChange(newSplits);
	}

	const totalAssigned = $derived(
		splits.reduce((sum, s) => sum + s.amount, 0)
	);

	const totalMatches = $derived(amount > 0 && totalAssigned === amount);
</script>

{#if members.length >= 2}
	<div class="space-y-4 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[2px_2px_0px_var(--border-subtle)]">

		<!-- Paid by -->
		<div>
			<p class="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Paid by</p>
			<div class="flex flex-wrap gap-2">
				{#each members as member (member.id)}
					<button
						type="button"
						onclick={() => handlePaidByClick(member.id)}
						style={paidByMemberId === member.id
							? 'background: var(--primary); color: white; border: 2px solid var(--primary);'
							: 'background: var(--bg-surface); color: var(--text); border: 1px solid var(--border-subtle);'}
						class="cursor-pointer rounded-sm px-3 py-1.5 text-[13px] transition-colors hover:border-[var(--primary)]"
					>
						{member.name}
					</button>
				{/each}
			</div>
		</div>

		<!-- Split section -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Split</p>
				<!-- Mode toggle -->
				<div class="flex overflow-hidden rounded-sm border border-[var(--border-subtle)]">
					<button
						type="button"
						onclick={() => handleModeSwitch('equal')}
						style={splitMode === 'equal'
							? 'background: var(--primary); color: white;'
							: 'background: var(--bg-surface); color: var(--text-muted); border: none;'}
						class="px-3 py-1 text-[11px] font-medium uppercase transition-colors"
					>
						Equal
					</button>
					<button
						type="button"
						onclick={() => handleModeSwitch('custom')}
						style={splitMode === 'custom'
							? 'background: var(--primary); color: white;'
							: 'background: var(--bg-surface); color: var(--text-muted); border: none;'}
						class="border-l border-[var(--border-subtle)] px-3 py-1 text-[11px] font-medium uppercase transition-colors"
					>
						Custom
					</button>
				</div>
			</div>

			{#if splitMode === 'equal'}
				<div class="space-y-2">
					{#each members as member (member.id)}
						{@const checked = checkedMemberIds.has(member.id)}
						{@const splitEntry = splits.find((s) => s.memberId === member.id)}
						<label class="flex cursor-pointer items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<input
									type="checkbox"
									{checked}
									onchange={(e) => handleEqualToggle(member.id, (e.target as HTMLInputElement).checked)}
									class="h-4 w-4 rounded-sm"
									style="accent-color: var(--primary);"
								/>
								<span class="text-sm text-[var(--text)]">{member.name}</span>
								{#if member.userId === currentUserId}
									<span class="text-xs text-[var(--text-muted)]">(you)</span>
								{/if}
							</div>
							<span class="text-sm text-[var(--text-muted)]">
								{#if checked && splitEntry}
									{formatCents(splitEntry.amount, currency)}
								{:else}
									—
								{/if}
							</span>
						</label>
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each members as member (member.id)}
						<div class="flex items-center gap-3">
							<span class="min-w-0 flex-1 text-sm text-[var(--text)]">
								{member.name}
								{#if member.userId === currentUserId}
									<span class="text-xs text-[var(--text-muted)]">(you)</span>
								{/if}
							</span>
							<input
								type="text"
								inputmode="decimal"
								value={customAmounts[member.id] ?? '0.00'}
								oninput={(e) => handleCustomInput(member.id, (e.target as HTMLInputElement).value)}
								class="w-28 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-1.5 text-right text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
							/>
						</div>
					{/each}

					<!-- Validation line -->
					<div class="flex items-center justify-between pt-1 text-xs">
						<span class="text-[var(--text-muted)]">Total assigned:</span>
						<span
							class="font-medium"
							style={totalMatches ? 'color: var(--success-text);' : 'color: var(--destructive);'}
						>
							{formatCents(totalAssigned, currency)}
							{#if totalMatches}
								&#10003;
							{:else}
								(expected {formatCents(amount, currency)})
							{/if}
						</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
