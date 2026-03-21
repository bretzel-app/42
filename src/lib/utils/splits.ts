import type {
	TripMember,
	Expense,
	ExpenseSplit,
	Settlement,
	MemberBalance,
	SuggestedTransfer
} from '$lib/types/index.js';

/**
 * Divides totalCents equally among memberIds.
 * Remainder cents (from integer division) are distributed one per member
 * starting from the first, ensuring the total is always exact.
 * Returns a map of memberId → amount in cents.
 */
export function computeEqualSplit(
	totalCents: number,
	memberIds: string[]
): Record<string, number> {
	if (memberIds.length === 0) return {};

	const base = Math.floor(totalCents / memberIds.length);
	const remainder = totalCents - base * memberIds.length;

	const result: Record<string, number> = {};
	for (let i = 0; i < memberIds.length; i++) {
		// First `remainder` members each get one extra cent
		result[memberIds[i]] = i < remainder ? base + 1 : base;
	}
	return result;
}

/**
 * Computes per-member net balances in the trip's home currency.
 *
 * For each expense:
 *   - The member identified by paidByMemberId receives credit for the full
 *     expense amount (converted to home currency via exchangeRate).
 *   - Each ExpenseSplit records how many cents (in the expense currency) a
 *     member owes; this is converted to home currency.
 *
 * balance = totalPaid - totalOwed - settlementsReceived + settlementsSent
 * Positive balance → member is still owed money.
 * Negative balance → member still owes money.
 */
export function computeBalances(
	members: TripMember[],
	expenses: Expense[],
	splits: ExpenseSplit[],
	settlements: Settlement[]
): MemberBalance[] {
	// Initialise accumulators
	const paid = new Map<string, number>();
	const owed = new Map<string, number>();
	const sent = new Map<string, number>();
	const received = new Map<string, number>();
	for (const m of members) {
		paid.set(m.id, 0);
		owed.set(m.id, 0);
		sent.set(m.id, 0);
		received.set(m.id, 0);
	}

	// Build expense lookup for quick rate access
	const expenseById = new Map(expenses.map((e) => [e.id, e]));

	// Accumulate paid amounts — credit goes to whoever paid the expense
	for (const expense of expenses) {
		if (expense.deleted) continue;
		if (!expense.paidByMemberId) continue;
		if (!paid.has(expense.paidByMemberId)) continue;

		const rate = parseFloat(expense.exchangeRate);
		const homeCents = Math.round(expense.amount * rate);
		paid.set(expense.paidByMemberId, (paid.get(expense.paidByMemberId) ?? 0) + homeCents);
	}

	// Accumulate owed amounts from splits
	for (const split of splits) {
		if (split.deleted) continue;
		if (!owed.has(split.memberId)) continue;

		const expense = expenseById.get(split.expenseId);
		if (!expense || expense.deleted) continue;

		const rate = parseFloat(expense.exchangeRate);
		const homeCents = Math.round(split.amount * rate);
		owed.set(split.memberId, (owed.get(split.memberId) ?? 0) + homeCents);
	}

	// Accumulate settlements
	for (const settlement of settlements) {
		if (settlement.deleted) continue;
		if (sent.has(settlement.fromMemberId)) {
			sent.set(
				settlement.fromMemberId,
				(sent.get(settlement.fromMemberId) ?? 0) + settlement.amount
			);
		}
		if (received.has(settlement.toMemberId)) {
			received.set(
				settlement.toMemberId,
				(received.get(settlement.toMemberId) ?? 0) + settlement.amount
			);
		}
	}

	return members.map((m) => {
		const totalPaid = paid.get(m.id) ?? 0;
		const totalOwed = owed.get(m.id) ?? 0;
		const settlementsSent = sent.get(m.id) ?? 0;
		const settlementsReceived = received.get(m.id) ?? 0;
		const balance = totalPaid - totalOwed - settlementsReceived + settlementsSent;
		return {
			memberId: m.id,
			memberName: m.name,
			totalPaid,
			totalOwed,
			settlementsSent,
			settlementsReceived,
			balance
		};
	});
}

/**
 * Greedy minimum-transfers algorithm.
 * Matches the largest debtor with the largest creditor, repeating until
 * all balances are settled. Amounts below 1 cent are ignored.
 */
export function computeMinTransfers(balances: MemberBalance[]): SuggestedTransfer[] {
	const transfers: SuggestedTransfer[] = [];

	// Work on mutable copies
	const credits: { id: string; name: string; amount: number }[] = [];
	const debts: { id: string; name: string; amount: number }[] = [];

	for (const b of balances) {
		if (b.balance > 0) {
			credits.push({ id: b.memberId, name: b.memberName, amount: b.balance });
		} else if (b.balance < 0) {
			debts.push({ id: b.memberId, name: b.memberName, amount: -b.balance });
		}
	}

	// Sort descending by amount
	credits.sort((a, b) => b.amount - a.amount);
	debts.sort((a, b) => b.amount - a.amount);

	let ci = 0;
	let di = 0;

	while (ci < credits.length && di < debts.length) {
		const creditor = credits[ci];
		const debtor = debts[di];

		const transferAmount = Math.min(creditor.amount, debtor.amount);
		if (transferAmount < 1) {
			if (creditor.amount < 1) ci++;
			else di++;
			continue;
		}

		transfers.push({
			fromMemberId: debtor.id,
			fromName: debtor.name,
			toMemberId: creditor.id,
			toName: creditor.name,
			amount: transferAmount
		});

		creditor.amount -= transferAmount;
		debtor.amount -= transferAmount;

		if (creditor.amount < 1) ci++;
		if (debtor.amount < 1) di++;
	}

	return transfers;
}
