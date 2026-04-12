import { describe, it, expect } from 'vitest';
import { computeEqualSplit, computeBalances, computeMinTransfers } from './splits.js';
import type { TripMember, Expense, ExpenseSplit, Settlement } from '$lib/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMember(id: string, name: string): TripMember {
	return {
		id,
		tripId: 'trip-1',
		name,
		userId: null,
		addedBy: 1,
		deleted: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		version: 1
	};
}

function makeExpense(
	id: string,
	amount: number,
	currency: string,
	exchangeRate: string,
	paidByMemberId: string | null = null
): Expense {
	return {
		id,
		tripId: 'trip-1',
		amount,
		currency,
		exchangeRate,
		categoryId: 'food',
		date: new Date(),
		note: '',
		paidByMemberId,
		latitude: null,
		longitude: null,
		deleted: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		version: 1
	};
}

function makeSplit(id: string, expenseId: string, memberId: string, amount: number): ExpenseSplit {
	return {
		id,
		expenseId,
		memberId,
		amount,
		deleted: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		version: 1
	};
}

function makeSettlement(
	id: string,
	fromMemberId: string,
	toMemberId: string,
	amount: number
): Settlement {
	return {
		id,
		tripId: 'trip-1',
		fromMemberId,
		toMemberId,
		amount,
		date: new Date(),
		note: '',
		deleted: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		version: 1
	};
}

// ---------------------------------------------------------------------------
// computeEqualSplit
// ---------------------------------------------------------------------------

describe('computeEqualSplit', () => {
	// Scenario: Even division among members
	it('splits an evenly-divisible amount equally', () => {
		const result = computeEqualSplit(3000, ['a', 'b', 'c']);
		expect(result).toEqual({ a: 1000, b: 1000, c: 1000 });
	});

	// Scenario: Remainder cents assigned to the first participant
	it('gives remainder cents to the first member', () => {
		// 100 / 3 = 33 each, remainder 1 → first gets 34
		const result = computeEqualSplit(100, ['a', 'b', 'c']);
		expect(result).toEqual({ a: 34, b: 33, c: 33 });
		expect(Object.values(result).reduce((s, v) => s + v, 0)).toBe(100);
	});

	// Scenario: Single member receives the full amount
	it('assigns the full amount to a single member', () => {
		const result = computeEqualSplit(5000, ['a']);
		expect(result).toEqual({ a: 5000 });
	});

	// Scenario: 1 cent split among 3 people — remainder to first
	it('handles 1 cent among 3 members', () => {
		const result = computeEqualSplit(1, ['a', 'b', 'c']);
		expect(result).toEqual({ a: 1, b: 0, c: 0 });
		expect(Object.values(result).reduce((s, v) => s + v, 0)).toBe(1);
	});

	// Scenario: 2 cents among 3 people
	it('handles 2 cents among 3 members', () => {
		const result = computeEqualSplit(2, ['a', 'b', 'c']);
		expect(result).toEqual({ a: 1, b: 1, c: 0 });
		expect(Object.values(result).reduce((s, v) => s + v, 0)).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// computeBalances
// ---------------------------------------------------------------------------

describe('computeBalances', () => {
	// Scenario: Two-person balance where one paid and both owe equally
	it('computes correct balances for a two-person split', () => {
		// Alice paid 100 EUR (= 100 home cents at rate 1.0). Both owe 50 each.
		const alice = makeMember('alice', 'Alice');
		const bob = makeMember('bob', 'Bob');
		const expense = makeExpense('e1', 10000, 'EUR', '1', 'alice');
		const splits = [
			makeSplit('s1', 'e1', 'alice', 5000),
			makeSplit('s2', 'e1', 'bob', 5000)
		];

		const balances = computeBalances([alice, bob], [expense], splits, []);

		const aliceBal = balances.find((b) => b.memberId === 'alice')!;
		const bobBal = balances.find((b) => b.memberId === 'bob')!;

		// Alice paid 10000 cents, owed 5000 → balance +5000 (is owed)
		expect(aliceBal.totalPaid).toBe(10000);
		expect(aliceBal.totalOwed).toBe(5000);
		expect(aliceBal.balance).toBe(5000);

		// Bob paid nothing, owed 5000 → balance -5000 (owes)
		expect(bobBal.totalPaid).toBe(0);
		expect(bobBal.totalOwed).toBe(5000);
		expect(bobBal.balance).toBe(-5000);
	});

	// Scenario: Settlements reduce outstanding balances
	it('accounts for settlements when computing balances', () => {
		const alice = makeMember('alice', 'Alice');
		const bob = makeMember('bob', 'Bob');
		const expense = makeExpense('e1', 10000, 'EUR', '1', 'alice');
		const splits = [
			makeSplit('s1', 'e1', 'alice', 5000),
			makeSplit('s2', 'e1', 'bob', 5000)
		];
		// Bob pays Alice 5000 cents to settle
		const settlement = makeSettlement('set1', 'bob', 'alice', 5000);

		const balances = computeBalances([alice, bob], [expense], splits, [settlement]);

		const aliceBal = balances.find((b) => b.memberId === 'alice')!;
		const bobBal = balances.find((b) => b.memberId === 'bob')!;

		expect(aliceBal.settlementsReceived).toBe(5000);
		expect(aliceBal.balance).toBe(0);
		expect(bobBal.settlementsSent).toBe(5000);
		expect(bobBal.balance).toBe(0);
	});

	// Scenario: Multi-currency expense is converted to home currency using exchange rate
	it('converts foreign currency expenses to home currency', () => {
		const alice = makeMember('alice', 'Alice');
		// Expense of 10000 USD cents at rate 0.9 → 9000 home cents
		const expense = makeExpense('e1', 10000, 'USD', '0.9', 'alice');
		const splits = [makeSplit('s1', 'e1', 'alice', 10000)];

		const balances = computeBalances([alice], [expense], splits, []);
		const aliceBal = balances.find((b) => b.memberId === 'alice')!;

		// Alice paid 9000 home cents, owed 9000 home cents → balance 0
		expect(aliceBal.totalPaid).toBe(9000);
		expect(aliceBal.totalOwed).toBe(9000);
		expect(aliceBal.balance).toBe(0);
	});

	// Scenario: Deleted splits are excluded
	it('ignores deleted splits', () => {
		const alice = makeMember('alice', 'Alice');
		const expense = makeExpense('e1', 10000, 'EUR', '1', 'alice');
		const activeSplit = makeSplit('s1', 'e1', 'alice', 10000);
		const deletedSplit = { ...makeSplit('s2', 'e1', 'alice', 5000), deleted: true };

		const balances = computeBalances([alice], [expense], [activeSplit, deletedSplit], []);
		const aliceBal = balances.find((b) => b.memberId === 'alice')!;

		expect(aliceBal.totalOwed).toBe(10000);
	});

	// Scenario: Deleted settlements are excluded
	it('ignores deleted settlements', () => {
		const alice = makeMember('alice', 'Alice');
		const bob = makeMember('bob', 'Bob');
		const expense = makeExpense('e1', 10000, 'EUR', '1', 'alice');
		const splits = [makeSplit('s1', 'e1', 'alice', 5000), makeSplit('s2', 'e1', 'bob', 5000)];
		const deletedSettlement = { ...makeSettlement('set1', 'bob', 'alice', 5000), deleted: true };

		const balances = computeBalances([alice, bob], [expense], splits, [deletedSettlement]);
		const bobBal = balances.find((b) => b.memberId === 'bob')!;

		expect(bobBal.settlementsSent).toBe(0);
		expect(bobBal.balance).toBe(-5000);
	});
});

// ---------------------------------------------------------------------------
// computeMinTransfers
// ---------------------------------------------------------------------------

describe('computeMinTransfers', () => {
	// Scenario: A balanced group with no net balances produces no transfers
	it('returns no transfers when all balances are zero', () => {
		const alice = makeMember('alice', 'Alice');
		const bob = makeMember('bob', 'Bob');
		const balances = [
			{
				memberId: 'alice',
				memberName: 'Alice',
				totalPaid: 5000,
				totalOwed: 5000,
				settlementsSent: 0,
				settlementsReceived: 0,
				balance: 0
			},
			{
				memberId: 'bob',
				memberName: 'Bob',
				totalPaid: 5000,
				totalOwed: 5000,
				settlementsSent: 0,
				settlementsReceived: 0,
				balance: 0
			}
		];

		const transfers = computeMinTransfers(balances);
		expect(transfers).toHaveLength(0);
	});

	// Scenario: Two-person transfer where one owes the other
	it('produces a single transfer for a two-person imbalance', () => {
		const balances = [
			{
				memberId: 'alice',
				memberName: 'Alice',
				totalPaid: 10000,
				totalOwed: 5000,
				settlementsSent: 0,
				settlementsReceived: 0,
				balance: 5000
			},
			{
				memberId: 'bob',
				memberName: 'Bob',
				totalPaid: 0,
				totalOwed: 5000,
				settlementsSent: 0,
				settlementsReceived: 0,
				balance: -5000
			}
		];

		const transfers = computeMinTransfers(balances);
		expect(transfers).toHaveLength(1);
		expect(transfers[0]).toMatchObject({
			fromMemberId: 'bob',
			fromName: 'Bob',
			toMemberId: 'alice',
			toName: 'Alice',
			amount: 5000
		});
	});

	// Scenario: Minimum transfers for 4 people with mixed balances
	it('minimises the number of transfers for 4 members', () => {
		// alice: +3000, bob: -1000, carol: -1000, dave: -1000
		const balances = [
			{
				memberId: 'alice',
				memberName: 'Alice',
				totalPaid: 0,
				totalOwed: 0,
				settlementsSent: 0,
				settlementsReceived: 0,
				balance: 3000
			},
			{
				memberId: 'bob',
				memberName: 'Bob',
				totalPaid: 0,
				totalOwed: 0,
				settlementsSent: 0,
				settlementsReceived: 0,
				balance: -1000
			},
			{
				memberId: 'carol',
				memberName: 'Carol',
				totalPaid: 0,
				totalOwed: 0,
				settlementsSent: 0,
				settlementsReceived: 0,
				balance: -1000
			},
			{
				memberId: 'dave',
				memberName: 'Dave',
				totalPaid: 0,
				totalOwed: 0,
				settlementsSent: 0,
				settlementsReceived: 0,
				balance: -1000
			}
		];

		const transfers = computeMinTransfers(balances);
		// 3 debtors → 3 transfers to alice
		expect(transfers).toHaveLength(3);
		expect(transfers.every((t) => t.toMemberId === 'alice')).toBe(true);
		expect(transfers.every((t) => t.amount === 1000)).toBe(true);
		// Total outflow equals total inflow
		const total = transfers.reduce((s, t) => s + t.amount, 0);
		expect(total).toBe(3000);
	});
});
