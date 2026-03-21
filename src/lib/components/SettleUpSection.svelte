<script lang="ts">
	import { formatCents, formatAmount, parseToCents } from '$lib/utils/currency.js';
	import { createSettlement } from '$lib/stores/settlements.js';
	import type { SuggestedTransfer } from '$lib/types/index.js';

	interface Props {
		transfers: SuggestedTransfer[];
		tripId: string;
		homeCurrency: string;
		onSettled?: () => void;
	}

	const { transfers, tripId, homeCurrency, onSettled }: Props = $props();

	// Track which transfer row has the inline form open
	let expandedIdx = $state<number | null>(null);
	let amountInput = $state('');
	let noteInput = $state('');
	let submitting = $state(false);

	function openSettle(idx: number, transfer: SuggestedTransfer) {
		expandedIdx = idx;
		amountInput = formatAmount(transfer.amount);
		noteInput = '';
	}

	function cancelSettle() {
		expandedIdx = null;
		amountInput = '';
		noteInput = '';
	}

	async function confirmSettle(transfer: SuggestedTransfer) {
		if (submitting) return;
		submitting = true;
		const cents = parseToCents(amountInput);
		if (cents <= 0) {
			submitting = false;
			return;
		}
		await createSettlement({
			tripId,
			fromMemberId: transfer.fromMemberId,
			toMemberId: transfer.toMemberId,
			amount: cents,
			date: new Date(),
			note: noteInput.trim() || undefined
		});
		expandedIdx = null;
		amountInput = '';
		noteInput = '';
		submitting = false;
		onSettled?.();
	}
</script>

{#if transfers.length === 0}
	<div class="flex flex-col items-center justify-center py-8">
		<p class="font-['Press_Start_2P'] text-xs text-[var(--primary)]">All settled!</p>
		<p class="mt-2 text-sm text-[var(--text-muted)]">No outstanding balances</p>
	</div>
{:else}
	<div class="space-y-2">
		{#each transfers as transfer, idx (idx)}
			<div class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--card-shadow)]">
				<!-- Transfer row -->
				<div class="flex items-center gap-2 p-3">
					<span class="text-sm font-medium text-[var(--text)]">{transfer.fromName}</span>
					<span class="text-xs text-[var(--text-muted)]">→</span>
					<span class="text-sm font-medium text-[var(--text)]">{transfer.toName}</span>
					<span class="ml-auto text-sm font-bold text-[var(--text)]">
						{formatCents(transfer.amount, homeCurrency)}
					</span>
					{#if expandedIdx !== idx}
						<button
							onclick={() => openSettle(idx, transfer)}
							class="ml-2 shrink-0 rounded-sm bg-[var(--primary)] px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
						>
							Mark Settled
						</button>
					{/if}
				</div>

				<!-- Inline settlement form -->
				{#if expandedIdx === idx}
					<div class="border-t border-[var(--border-subtle)] p-3">
						<div class="mb-2 flex gap-2">
							<div class="flex-1">
								<label for="settle-amount-{idx}" class="mb-1 block text-[11px] uppercase tracking-[1px] text-[var(--text-muted)]">
									Amount ({homeCurrency})
								</label>
								<input
									id="settle-amount-{idx}"
									type="number"
									min="0"
									step="0.01"
									bind:value={amountInput}
									class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
								/>
							</div>
							<div class="flex-1">
								<label for="settle-note-{idx}" class="mb-1 block text-[11px] uppercase tracking-[1px] text-[var(--text-muted)]">
									Note (optional)
								</label>
								<input
									id="settle-note-{idx}"
									type="text"
									bind:value={noteInput}
									placeholder="e.g. Cash"
									class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
								/>
							</div>
						</div>
						<div class="flex justify-end gap-2">
							<button
								onclick={cancelSettle}
								class="rounded-sm border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
							>
								Cancel
							</button>
							<button
								onclick={() => confirmSettle(transfer)}
								disabled={submitting}
								class="rounded-sm bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
							>
								{submitting ? 'Saving…' : 'Confirm'}
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
