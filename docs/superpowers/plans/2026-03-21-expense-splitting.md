# Expense Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expense splitting to 42 so group travelers can track who paid, how costs are divided, and settle debts.

**Architecture:** Introduce a `tripMembers` table (replacing `tripCollaborators`) as the central concept for group trips. Expenses gain a `paidByMemberId` column and a related `expenseSplits` table for per-member amounts. A `settlements` table tracks debt payments. Balances are computed (not stored) from expenses + splits + settlements. All new entities follow existing CRDT sync patterns.

**Tech Stack:** SvelteKit + Svelte 5 runes, SQLite via Drizzle ORM, IndexedDB (idb) for offline, LWW CRDT sync, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-03-21-expense-splitting-design.md`

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/lib/server/members-service.ts` | CRUD for trip members (replaces collaborators.ts) |
| `src/lib/server/splits-service.ts` | Expense split CRUD + balance computation + settlement algorithm |
| `src/lib/server/settlements-service.ts` | Settlement CRUD |
| `src/lib/stores/members.ts` | Client store for trip members |
| `src/lib/stores/settlements.ts` | Client store for settlements |
| `src/routes/api/trips/[id]/members/+server.ts` | GET/POST members |
| `src/routes/api/trips/[id]/members/[memberId]/+server.ts` | PATCH/DELETE member |
| `src/routes/api/trips/[id]/balances/+server.ts` | GET computed balances |
| `src/routes/api/trips/[id]/settlements/+server.ts` | GET/POST settlements |
| `src/routes/api/trips/[id]/settlements/[settlementId]/+server.ts` | DELETE settlement |
| `src/routes/(app)/trips/[id]/balances/+page.svelte` | Balances and settlement page |
| `src/routes/(app)/trips/[id]/balances/+page.server.ts` | Server load for balances |
| `src/lib/components/MembersList.svelte` | Members management component |
| `src/lib/components/SplitControls.svelte` | Paid-by + split UI for expense form |
| `src/lib/components/BalanceCard.svelte` | Per-member balance card |
| `src/lib/components/SettleUpSection.svelte` | Suggested transfers + mark settled |
| `src/lib/utils/splits.ts` | Pure functions: equal split, balance calc, min-transfer algorithm |
| `src/lib/utils/splits.test.ts` | Unit tests for split math |
| `tests/e2e/expense-splitting.spec.ts` | E2E tests for splitting feature |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/server/db/schema.ts` | Add `tripMembers`, `expenseSplits`, `settlements` tables; add `paidByMemberId` to expenses |
| `src/lib/server/db/index.ts` | Add CREATE TABLE IF NOT EXISTS for new tables |
| `src/lib/types/index.ts` | Add `TripMember`, `ExpenseSplit`, `Settlement`, `MemberBalance` interfaces; update `SyncChange` |
| `src/lib/sync/idb.ts` | Add IDB stores for new entities; extend `SyncQueueItem` |
| `src/lib/sync/client.ts` | Sync new entity types |
| `src/lib/sync/server.ts` | Handle new entity types in push/pull |
| `src/lib/stores/expenses.ts` | Add `paidByMemberId` to create/update payloads |
| `src/lib/server/expenses-service.ts` | Accept `paidByMemberId` + `splits` in create/update |
| `src/routes/(app)/trips/[id]/+page.svelte` | Add balance widget, replace ShareDialog with member management link |
| `src/routes/(app)/trips/[id]/expenses/new/+page.svelte` | Add SplitControls component |
| `src/routes/(app)/trips/[id]/expenses/[expenseId]/+page.svelte` | Add SplitControls component |
| `src/routes/(app)/trips/[id]/expenses/+page.svelte` | Show "paid by" on each expense |
| `src/routes/(app)/trips/[id]/edit/+page.svelte` | Add Members tab, conditionally hide numberOfPeople |

### Removed Files

| File | Reason |
|------|--------|
| `src/lib/components/ShareDialog.svelte` | Replaced by MembersList |
| `src/lib/server/collaborators.ts` | Replaced by members-service.ts |
| `src/routes/api/trips/[id]/collaborators/+server.ts` | Replaced by members API |

---

## Task 1: Types and Pure Split Utilities

**Files:**
- Modify: `src/lib/types/index.ts`
- Create: `src/lib/utils/splits.ts`
- Create: `src/lib/utils/splits.test.ts`

Start with the foundation: TypeScript interfaces and the pure math functions that power splitting. These have zero dependencies on the rest of the codebase, so they are testable in isolation.

- [ ] **Step 1: Add new TypeScript interfaces**

Add to `src/lib/types/index.ts`:

```typescript
export interface TripMember {
	id: string;
	tripId: string;
	name: string;
	userId: number | null;
	addedBy: number;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	version: number;
}

export interface ExpenseSplit {
	id: string;
	expenseId: string;
	memberId: string;
	amount: number; // cents in expense currency
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	version: number;
}

export interface Settlement {
	id: string;
	tripId: string;
	fromMemberId: string;
	toMemberId: string;
	amount: number; // cents in home currency
	date: Date;
	note: string;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
	version: number;
}

export interface MemberBalance {
	memberId: string;
	memberName: string;
	totalPaid: number; // cents, home currency
	totalOwed: number; // cents, home currency
	settlementsSent: number; // cents
	settlementsReceived: number; // cents
	balance: number; // positive = owed, negative = owes
}

export interface SuggestedTransfer {
	fromMemberId: string;
	fromName: string;
	toMemberId: string;
	toName: string;
	amount: number; // cents, home currency
}
```

Also update the `SyncChange` interface's `entityType` union:

```typescript
export interface SyncChange {
	entityType: 'trip' | 'expense' | 'tripCurrency' | 'tripMember' | 'expenseSplit' | 'settlement';
	// ... rest unchanged
}
```

- [ ] **Step 2: Write failing tests for split utilities**

Create `src/lib/utils/splits.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
	computeEqualSplit,
	computeBalances,
	computeMinTransfers
} from './splits';

describe('computeEqualSplit', () => {
	it('splits evenly among all members', () => {
		const result = computeEqualSplit(4800, ['a', 'b', 'c', 'd']);
		expect(result).toEqual([
			{ memberId: 'a', amount: 1200 },
			{ memberId: 'b', amount: 1200 },
			{ memberId: 'c', amount: 1200 },
			{ memberId: 'd', amount: 1200 }
		]);
	});

	it('assigns remainder cents to first participant', () => {
		const result = computeEqualSplit(1000, ['a', 'b', 'c']);
		expect(result).toEqual([
			{ memberId: 'a', amount: 334 },
			{ memberId: 'b', amount: 333 },
			{ memberId: 'c', amount: 333 }
		]);
		expect(result.reduce((sum, s) => sum + s.amount, 0)).toBe(1000);
	});

	it('handles single member', () => {
		const result = computeEqualSplit(5000, ['a']);
		expect(result).toEqual([{ memberId: 'a', amount: 5000 }]);
	});

	it('handles 1 cent with 3 people', () => {
		const result = computeEqualSplit(1, ['a', 'b', 'c']);
		expect(result).toEqual([
			{ memberId: 'a', amount: 1 },
			{ memberId: 'b', amount: 0 },
			{ memberId: 'c', amount: 0 }
		]);
	});
});

describe('computeBalances', () => {
	it('computes basic two-person balance', () => {
		const members = [
			{ id: 'a', name: 'Alice' },
			{ id: 'b', name: 'Bob' }
		];
		// Alice paid 6000, split equally (3000 each)
		const expenses = [
			{
				paidByMemberId: 'a',
				amount: 6000,
				exchangeRate: '1',
				splits: [
					{ memberId: 'a', amount: 3000 },
					{ memberId: 'b', amount: 3000 }
				]
			}
		];
		const settlements: never[] = [];
		const result = computeBalances(members, expenses, settlements);
		expect(result.find((b) => b.memberId === 'a')?.balance).toBe(3000);
		expect(result.find((b) => b.memberId === 'b')?.balance).toBe(-3000);
	});

	it('accounts for settlements', () => {
		const members = [
			{ id: 'a', name: 'Alice' },
			{ id: 'b', name: 'Bob' }
		];
		const expenses = [
			{
				paidByMemberId: 'a',
				amount: 6000,
				exchangeRate: '1',
				splits: [
					{ memberId: 'a', amount: 3000 },
					{ memberId: 'b', amount: 3000 }
				]
			}
		];
		const settlements = [{ fromMemberId: 'b', toMemberId: 'a', amount: 1000 }];
		const result = computeBalances(members, expenses, settlements);
		expect(result.find((b) => b.memberId === 'a')?.balance).toBe(2000);
		expect(result.find((b) => b.memberId === 'b')?.balance).toBe(-2000);
	});

	it('converts multi-currency expenses to home currency', () => {
		const members = [
			{ id: 'a', name: 'Alice' },
			{ id: 'b', name: 'Bob' }
		];
		// Expense is 100 USD with exchange rate 0.92 (to EUR)
		// Home currency amount: 10000 * 0.92 = 9200 cents
		const expenses = [
			{
				paidByMemberId: 'a',
				amount: 10000,
				exchangeRate: '0.92',
				splits: [
					{ memberId: 'a', amount: 5000 },
					{ memberId: 'b', amount: 5000 }
				]
			}
		];
		const result = computeBalances(members, expenses, []);
		// Alice paid 9200, owes 4600 -> balance = 4600
		expect(result.find((b) => b.memberId === 'a')?.balance).toBe(4600);
		expect(result.find((b) => b.memberId === 'b')?.balance).toBe(-4600);
	});
});

describe('computeMinTransfers', () => {
	it('returns empty for balanced group', () => {
		const balances = [
			{ memberId: 'a', memberName: 'Alice', balance: 0, totalPaid: 0, totalOwed: 0, settlementsSent: 0, settlementsReceived: 0 },
			{ memberId: 'b', memberName: 'Bob', balance: 0, totalPaid: 0, totalOwed: 0, settlementsSent: 0, settlementsReceived: 0 }
		];
		expect(computeMinTransfers(balances)).toEqual([]);
	});

	it('computes single transfer for two people', () => {
		const balances = [
			{ memberId: 'a', memberName: 'Alice', balance: 3000, totalPaid: 6000, totalOwed: 3000, settlementsSent: 0, settlementsReceived: 0 },
			{ memberId: 'b', memberName: 'Bob', balance: -3000, totalPaid: 0, totalOwed: 3000, settlementsSent: 0, settlementsReceived: 0 }
		];
		const transfers = computeMinTransfers(balances);
		expect(transfers).toEqual([
			{ fromMemberId: 'b', fromName: 'Bob', toMemberId: 'a', toName: 'Alice', amount: 3000 }
		]);
	});

	it('minimizes transfers for 4 people', () => {
		const balances = [
			{ memberId: 'a', memberName: 'Fred', balance: 17450, totalPaid: 38500, totalOwed: 21050, settlementsSent: 0, settlementsReceived: 0 },
			{ memberId: 'b', memberName: 'Alice', balance: 2950, totalPaid: 24000, totalOwed: 21050, settlementsSent: 0, settlementsReceived: 0 },
			{ memberId: 'c', memberName: 'Bob', balance: -14350, totalPaid: 6700, totalOwed: 21050, settlementsSent: 0, settlementsReceived: 0 },
			{ memberId: 'd', memberName: 'Charlie', balance: -6050, totalPaid: 15000, totalOwed: 21050, settlementsSent: 0, settlementsReceived: 0 }
		];
		const transfers = computeMinTransfers(balances);
		expect(transfers.length).toBeLessThanOrEqual(3);
		const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0);
		expect(totalTransferred).toBe(17450 + 2950);
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test:unit src/lib/utils/splits.test.ts`
Expected: FAIL - module `./splits` does not exist

- [ ] **Step 4: Implement split utilities**

Create `src/lib/utils/splits.ts`:

```typescript
import type { MemberBalance, SuggestedTransfer } from '$lib/types';

interface SplitShare {
	memberId: string;
	amount: number;
}

/**
 * Compute equal split amounts among given member IDs.
 * Remainder cents go to the first participant.
 */
export function computeEqualSplit(totalCents: number, memberIds: string[]): SplitShare[] {
	const count = memberIds.length;
	const base = Math.floor(totalCents / count);
	const remainder = totalCents - base * count;

	return memberIds.map((memberId, i) => ({
		memberId,
		amount: base + (i < remainder ? 1 : 0)
	}));
}

interface BalanceExpense {
	paidByMemberId: string;
	amount: number; // cents in expense currency
	exchangeRate: string;
	splits: { memberId: string; amount: number }[];
}

interface BalanceSettlement {
	fromMemberId: string;
	toMemberId: string;
	amount: number; // cents, home currency
}

/**
 * Compute per-member balances from expenses, splits, and settlements.
 * All output amounts are in the trip's home currency.
 */
export function computeBalances(
	members: { id: string; name: string }[],
	expenses: BalanceExpense[],
	settlements: BalanceSettlement[]
): MemberBalance[] {
	const balanceMap = new Map<string, MemberBalance>();

	for (const m of members) {
		balanceMap.set(m.id, {
			memberId: m.id,
			memberName: m.name,
			totalPaid: 0,
			totalOwed: 0,
			settlementsSent: 0,
			settlementsReceived: 0,
			balance: 0
		});
	}

	for (const exp of expenses) {
		const rate = parseFloat(exp.exchangeRate) || 1;
		const payer = balanceMap.get(exp.paidByMemberId);
		if (payer) {
			payer.totalPaid += Math.round(exp.amount * rate);
		}
		for (const split of exp.splits) {
			const member = balanceMap.get(split.memberId);
			if (member) {
				member.totalOwed += Math.round(split.amount * rate);
			}
		}
	}

	for (const s of settlements) {
		const from = balanceMap.get(s.fromMemberId);
		const to = balanceMap.get(s.toMemberId);
		if (from) from.settlementsSent += s.amount;
		if (to) to.settlementsReceived += s.amount;
	}

	for (const b of balanceMap.values()) {
		b.balance = b.totalPaid - b.totalOwed - b.settlementsSent + b.settlementsReceived;
	}

	return Array.from(balanceMap.values());
}

/**
 * Compute minimum transfers to settle all debts.
 * Greedy algorithm: match largest debtor with largest creditor.
 */
export function computeMinTransfers(balances: MemberBalance[]): SuggestedTransfer[] {
	const creditors: { memberId: string; name: string; amount: number }[] = [];
	const debtors: { memberId: string; name: string; amount: number }[] = [];

	for (const b of balances) {
		if (b.balance > 0) {
			creditors.push({ memberId: b.memberId, name: b.memberName, amount: b.balance });
		} else if (b.balance < 0) {
			debtors.push({ memberId: b.memberId, name: b.memberName, amount: -b.balance });
		}
	}

	creditors.sort((a, b) => b.amount - a.amount);
	debtors.sort((a, b) => b.amount - a.amount);

	const transfers: SuggestedTransfer[] = [];
	let ci = 0;
	let di = 0;

	while (ci < creditors.length && di < debtors.length) {
		const transfer = Math.min(creditors[ci].amount, debtors[di].amount);
		if (transfer > 0) {
			transfers.push({
				fromMemberId: debtors[di].memberId,
				fromName: debtors[di].name,
				toMemberId: creditors[ci].memberId,
				toName: creditors[ci].name,
				amount: transfer
			});
		}
		creditors[ci].amount -= transfer;
		debtors[di].amount -= transfer;
		if (creditors[ci].amount === 0) ci++;
		if (debtors[di].amount === 0) di++;
	}

	return transfers;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit src/lib/utils/splits.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/index.ts src/lib/utils/splits.ts src/lib/utils/splits.test.ts
git commit -m "feat: add expense splitting types and pure utility functions

Add TripMember, ExpenseSplit, Settlement, MemberBalance types.
Implement computeEqualSplit, computeBalances, computeMinTransfers
with full unit test coverage."
```

---

## Task 2: Database Schema and Migration

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Modify: `src/lib/server/db/index.ts`

Add the three new tables and the `paidByMemberId` column on expenses. The DB init in `index.ts` uses `CREATE TABLE IF NOT EXISTS` for idempotent setup, so existing data is preserved.

**Important:** Timestamps use `integer('field', { mode: 'timestamp' })` to match existing conventions.

- [ ] **Step 1: Add new tables to Drizzle schema**

Add to `src/lib/server/db/schema.ts` after the existing `tripCollaborators` definition:

```typescript
export const tripMembers = sqliteTable(
	'trip_members',
	{
		id: text('id').primaryKey(),
		tripId: text('trip_id')
			.notNull()
			.references(() => trips.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		userId: integer('user_id').references(() => users.id),
		addedBy: integer('added_by')
			.notNull()
			.references(() => users.id),
		deleted: integer('deleted').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1)
	},
	(table) => ({
		tripIdIdx: index('trip_members_trip_id_idx').on(table.tripId),
		userIdIdx: index('trip_members_user_id_idx').on(table.userId)
	})
);

export const expenseSplits = sqliteTable(
	'expense_splits',
	{
		id: text('id').primaryKey(),
		expenseId: text('expense_id')
			.notNull()
			.references(() => expenses.id, { onDelete: 'cascade' }),
		memberId: text('member_id')
			.notNull()
			.references(() => tripMembers.id),
		amount: integer('amount').notNull(),
		deleted: integer('deleted').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1)
	},
	(table) => ({
		expenseIdIdx: index('expense_splits_expense_id_idx').on(table.expenseId),
		memberIdIdx: index('expense_splits_member_id_idx').on(table.memberId)
	})
);

export const settlements = sqliteTable(
	'settlements',
	{
		id: text('id').primaryKey(),
		tripId: text('trip_id')
			.notNull()
			.references(() => trips.id, { onDelete: 'cascade' }),
		fromMemberId: text('from_member_id')
			.notNull()
			.references(() => tripMembers.id),
		toMemberId: text('to_member_id')
			.notNull()
			.references(() => tripMembers.id),
		amount: integer('amount').notNull(),
		date: integer('date', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		note: text('note'),
		deleted: integer('deleted').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1)
	},
	(table) => ({
		tripIdIdx: index('settlements_trip_id_idx').on(table.tripId)
	})
);
```

- [ ] **Step 2: Add `paidByMemberId` to expenses table**

In the existing `expenses` table definition in `schema.ts`, add after the `note` column:

```typescript
		paidByMemberId: text('paid_by_member_id').references(() => tripMembers.id),
```

- [ ] **Step 3: Add CREATE TABLE IF NOT EXISTS to db/index.ts**

In `src/lib/server/db/index.ts`, find the section that creates tables and add the three new CREATE TABLE statements. Follow the existing pattern (raw SQL with `sqlite.exec()`). Add after the existing `trip_collaborators` creation:

```sql
CREATE TABLE IF NOT EXISTS trip_members (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  added_by INTEGER NOT NULL REFERENCES users(id),
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS trip_members_trip_id_idx ON trip_members(trip_id);
CREATE INDEX IF NOT EXISTS trip_members_user_id_idx ON trip_members(user_id);

CREATE TABLE IF NOT EXISTS expense_splits (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES trip_members(id),
  amount INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS expense_splits_expense_id_idx ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS expense_splits_member_id_idx ON expense_splits(member_id);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_member_id TEXT NOT NULL REFERENCES trip_members(id),
  to_member_id TEXT NOT NULL REFERENCES trip_members(id),
  amount INTEGER NOT NULL,
  date INTEGER NOT NULL,
  note TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS settlements_trip_id_idx ON settlements(trip_id);
```

Also add the `paid_by_member_id` column to expenses. Since SQLite does not support ADD COLUMN IF NOT EXISTS, use a try/catch:

```typescript
try {
  sqlite.exec('ALTER TABLE expenses ADD COLUMN paid_by_member_id TEXT REFERENCES trip_members(id)');
} catch {
  // Column already exists
}
```

- [ ] **Step 4: Add data migration from tripCollaborators to tripMembers**

In `db/index.ts`, after creating the new tables, add a one-time migration that moves `tripCollaborators` data into `tripMembers`. This must be idempotent:

```typescript
// Migrate tripCollaborators to tripMembers (idempotent)
const existingMembers = sqlite.prepare('SELECT COUNT(*) as count FROM trip_members').get();
const existingCollabs = sqlite.prepare('SELECT COUNT(*) as count FROM trip_collaborators').get();
if (existingMembers.count === 0 && existingCollabs.count > 0) {
  const collabs = sqlite.prepare(`
    SELECT tc.trip_id, tc.user_id, tc.added_by, tc.added_at, u.display_name
    FROM trip_collaborators tc
    JOIN users u ON u.id = tc.user_id
  `).all();

  const insertMember = sqlite.prepare(`
    INSERT INTO trip_members (id, trip_id, name, user_id, added_by, deleted, created_at, updated_at, version)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)
  `);

  // Also add trip owners as members for trips that have collaborators
  const tripOwners = sqlite.prepare(`
    SELECT DISTINCT t.id as trip_id, t.user_id, u.display_name
    FROM trips t
    JOIN trip_collaborators tc ON tc.trip_id = t.id
    JOIN users u ON u.id = t.user_id
  `).all();

  const migrate = sqlite.transaction(() => {
    for (const owner of tripOwners) {
      insertMember.run(
        crypto.randomUUID(), owner.trip_id, owner.display_name,
        owner.user_id, owner.user_id, Date.now(), Date.now()
      );
    }
    for (const collab of collabs) {
      insertMember.run(
        crypto.randomUUID(), collab.trip_id, collab.display_name,
        collab.user_id, collab.added_by, collab.added_at, collab.added_at
      );
    }
  });
  migrate();
}
```

- [ ] **Step 5: Verify the app starts cleanly**

Run: `pnpm dev`
Expected: No errors. Check SQLite by running `pnpm db:studio` and verify new tables are visible.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/db/index.ts
git commit -m "feat: add tripMembers, expenseSplits, settlements tables

Add schema for expense splitting feature. Migrate existing
tripCollaborators data into tripMembers. Add paidByMemberId
column to expenses."
```

---

## Task 3: Members Server Service and API

**Files:**
- Create: `src/lib/server/members-service.ts`
- Create: `src/routes/api/trips/[id]/members/+server.ts`
- Create: `src/routes/api/trips/[id]/members/[memberId]/+server.ts`

Build the server-side CRUD for trip members, then wire up API routes. This replaces `collaborators.ts` functionality.

- [ ] **Step 1: Create members service**

Create `src/lib/server/members-service.ts` with these exports:

```typescript
export function listMembers(tripId: string, userId: number): TripMember[]
export function getMember(memberId: string): TripMember | undefined
export function createMember(data: { tripId: string; name: string; userId?: number | null }, addedBy: number): TripMember
export function updateMember(memberId: string, data: { name?: string; userId?: number | null }): TripMember | null
export function deleteMember(memberId: string, tripId: string): boolean
```

Key behaviors:
- `listMembers`: verify trip access via `canAccessTrip`, return non-deleted members
- `createMember`: if no members exist yet for this trip, auto-add the trip owner as first member. Generate UUID for id. After insert, update trip's `numberOfPeople` to match active member count.
- `deleteMember`: soft delete (set `deleted = 1`), update `numberOfPeople`. Cannot delete the trip owner.
- Use `db` from `$lib/server/db` and `tripMembers` from schema. Follow existing service patterns (see `expenses-service.ts`).

- [ ] **Step 2: Create members API routes**

Create `src/routes/api/trips/[id]/members/+server.ts`:
- `GET`: call `listMembers(params.id, userId)`, return JSON
- `POST`: validate `name` is non-empty, call `createMember`, return 201

Create `src/routes/api/trips/[id]/members/[memberId]/+server.ts`:
- `PATCH`: call `updateMember`, return updated member or 404
- `DELETE`: check member is not the owner, call `deleteMember`, return `{ success: true }` or 400/404

Follow the existing API route patterns from `src/routes/api/trips/[id]/expenses/+server.ts`.

- [ ] **Step 3: Verify API works**

Run: `pnpm dev`
Test with curl or browser devtools:
- `GET /api/trips/<ID>/members` should return `[]` for trips without members
- `POST /api/trips/<ID>/members` with `{"name":"Alice"}` should return 201

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/members-service.ts src/routes/api/trips/\[id\]/members/
git commit -m "feat: add trip members service and API routes

CRUD for trip members with auto-owner creation and
numberOfPeople sync. Replaces collaborator functionality."
```

---

## Task 4: Settlements and Balances Server Service + API

**Files:**
- Create: `src/lib/server/settlements-service.ts`
- Create: `src/routes/api/trips/[id]/settlements/+server.ts`
- Create: `src/routes/api/trips/[id]/settlements/[settlementId]/+server.ts`
- Create: `src/routes/api/trips/[id]/balances/+server.ts`

- [ ] **Step 1: Create settlements service**

Create `src/lib/server/settlements-service.ts` with these exports:

```typescript
export function listSettlements(tripId: string): Settlement[]
export function createSettlement(data: { tripId, fromMemberId, toMemberId, amount, date, note? }): Settlement
export function deleteSettlement(settlementId: string): boolean
export function getBalances(tripId: string): { balances: MemberBalance[], transfers: SuggestedTransfer[], members: TripMember[] }
```

`getBalances` implementation:
1. Fetch active members for the trip
2. Fetch active expenses where `paidByMemberId` is not null
3. Fetch active splits for those expenses
4. Fetch active settlements
5. Call `computeBalances()` and `computeMinTransfers()` from `$lib/utils/splits`
6. Return all three

- [ ] **Step 2: Create balances API route**

Create `src/routes/api/trips/[id]/balances/+server.ts`:
- `GET`: verify access, call `getBalances(params.id)`, return JSON

- [ ] **Step 3: Create settlements API routes**

Create `src/routes/api/trips/[id]/settlements/+server.ts`:
- `GET`: return `listSettlements(params.id)`
- `POST`: validate required fields, call `createSettlement`, return 201

Create `src/routes/api/trips/[id]/settlements/[settlementId]/+server.ts`:
- `DELETE`: call `deleteSettlement`, return `{ success: true }` or 404

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/settlements-service.ts src/routes/api/trips/\[id\]/settlements/ src/routes/api/trips/\[id\]/balances/
git commit -m "feat: add settlements service and balances/settlements API

Settlements CRUD with soft delete. Balance computation endpoint
using split utilities. Minimum transfer algorithm for settle up."
```

---

## Task 5: Update Expense Service for Splits

**Files:**
- Modify: `src/lib/server/expenses-service.ts`

When creating or updating an expense on a multi-member trip, accept `paidByMemberId` and `splits` data, and write to `expenseSplits` table.

- [ ] **Step 1: Update createExpense to accept split data**

In `src/lib/server/expenses-service.ts`, modify `createExpense` to:
1. Accept optional `paidByMemberId` and `splits` in the data parameter
2. After inserting the expense, if `paidByMemberId` and `splits` are provided, insert split rows
3. Validate split amounts sum to expense amount

```typescript
if (data.paidByMemberId && data.splits?.length) {
	const splitTotal = data.splits.reduce((sum, s) => sum + s.amount, 0);
	if (splitTotal !== data.amount) {
		throw error(400, 'Split amounts must equal expense amount');
	}
	for (const split of data.splits) {
		db.insert(expenseSplits).values({
			id: crypto.randomUUID(),
			expenseId: id,
			memberId: split.memberId,
			amount: split.amount,
			deleted: 0,
			createdAt: now,
			updatedAt: now,
			version: 1
		}).run();
	}
}
```

- [ ] **Step 2: Update updateExpense to handle splits**

When splits are provided in the update:
1. Soft-delete existing splits for this expense
2. Insert new splits
3. Validate amounts sum correctly

- [ ] **Step 3: Update listExpenses to include splits**

After fetching expenses, also fetch their active splits and attach them to each expense object so the client can display "paid by" info.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/expenses-service.ts
git commit -m "feat: support paidByMemberId and splits in expense CRUD

Create/update expenses with split data. List expenses includes
split rows. Amount changes reset splits to equal."
```

---

## Task 6: Client Stores and IDB for Members/Settlements

**Files:**
- Create: `src/lib/stores/members.ts`
- Create: `src/lib/stores/settlements.ts`
- Modify: `src/lib/sync/idb.ts`
- Modify: `src/lib/stores/expenses.ts`

- [ ] **Step 1: Add IDB stores for new entities**

In `src/lib/sync/idb.ts`:
1. Add `tripMembers`, `expenseSplits`, `settlements` to the `FortyTwoDB` interface with appropriate indexes (`by-tripId`, `by-expenseId`, `by-updated`)
2. Bump the DB version number
3. Create the new object stores in the `upgrade` callback
4. Extend `SyncQueueItem`'s `entityType` to include `'tripMember' | 'expenseSplit' | 'settlement'`
5. Add helper functions: `putMember`, `getMembersByTrip`, `putExpenseSplit`, `getSplitsByExpense`, `putSettlement`, `getSettlementsByTrip`

- [ ] **Step 2: Create members store**

Create `src/lib/stores/members.ts`:
- `members` writable store + `activeMembers` derived (filter deleted)
- `loadMembers(tripId)`: load from IDB first, then fetch server, update both
- `createMember(tripId, name, userId?)`: POST to API, optimistic update, IDB fallback + sync queue for offline
- `removeMember(memberId, tripId)`: DELETE to API, remove from store

Follow the exact pattern from `src/lib/stores/expenses.ts`.

- [ ] **Step 3: Create settlements store**

Create `src/lib/stores/settlements.ts`:
- `settlements` writable store + `activeSettlements` derived (filter deleted, sort by date desc)
- `loadSettlements(tripId)`: IDB first, then server
- `createSettlement(data)`: POST to API, update store + IDB
- `removeSettlement(settlementId, tripId)`: DELETE to API, remove from store

- [ ] **Step 4: Update expenses store to include paidByMemberId**

In `src/lib/stores/expenses.ts`, update `createExpense` to accept optional `paidByMemberId` and `splits` in the data parameter, and include them in the POST body.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/members.ts src/lib/stores/settlements.ts src/lib/sync/idb.ts src/lib/stores/expenses.ts
git commit -m "feat: add client stores and IDB for members, settlements, splits

Members and settlements stores with optimistic updates and IDB
caching. Extended IDB schema with new object stores. Expenses
store accepts paidByMemberId and splits."
```

---

## Task 7: Sync System Updates

**Files:**
- Modify: `src/lib/sync/client.ts`
- Modify: `src/lib/sync/server.ts`

Extend the sync system to handle the three new entity types in both push (offline changes to server) and pull (server changes to client).

- [ ] **Step 1: Update server sync to handle new entity types**

In `src/lib/sync/server.ts`:
1. Add cases for `tripMember`, `expenseSplit`, `settlement` in `processSyncPush` (create/update/soft-delete with CRDT merge)
2. Update `getChangesSince` to include the new entities in the pull response, filtered by user access

- [ ] **Step 2: Update client sync to handle new entity types**

In `src/lib/sync/client.ts`:
1. Update `pushChanges` to handle new entity types in the sync queue
2. Update `pullChanges` to process `tripMembers`, `expenseSplits`, `settlements` from server response
3. Merge using `mergeEntity()` CRDT logic and update IDB + in-memory stores

- [ ] **Step 3: Verify sync works**

Run: `pnpm dev`
Create a member while online, go offline (devtools Network tab), create another member, go back online, verify sync resolves.
Expected: Both members visible after sync.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/client.ts src/lib/sync/server.ts
git commit -m "feat: extend sync system for members, splits, settlements

Push and pull support for new entity types with LWW CRDT merge.
Access-controlled pull includes only entities for user trips."
```

---

## Task 8: Members Management UI

**Files:**
- Create: `src/lib/components/MembersList.svelte`
- Modify: `src/routes/(app)/trips/[id]/edit/+page.svelte`

Build the members management component and integrate it into the trip edit page as a new "Members" tab.

- [ ] **Step 1: Create MembersList component**

Create `src/lib/components/MembersList.svelte`:

Props (use Svelte 5 `$props()` with `interface Props`):
```typescript
interface Props {
	tripId: string;
	ownerId: number;
}
```

Component renders:
- Input field for adding new members (dual purpose: type name to add unlinked, search email to link user)
- "Add" button (gold background)
- Member cards: 36x36 initials avatar (gold for owner, muted for others), name, link status badge (OWNER/LINKED/name-only), remove button
- "Link to account" text button on unlinked members (searches `/api/users/search?q=...`)
- Tip text at bottom

Uses `activeMembers` from `$lib/stores/members`. Calls `createMember`, `removeMember`.

Retro parchment styling:
- `border: 1px solid var(--border-subtle)` for cards
- `border-radius: 2px` (rounded-sm)
- `box-shadow: 2px 2px 0px rgba(0,0,0,0.08)` for cards
- Add button: `background: var(--primary); color: white`
- Remove: `color: var(--destructive)`
- Mobile: always show remove buttons (`max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100`)

- [ ] **Step 2: Add Members tab to trip edit page**

In `src/routes/(app)/trips/[id]/edit/+page.svelte`:

1. Add tab state: `let tab = $state<'details' | 'currencies' | 'members'>('details');`
2. Add tab bar above the form with three tabs, styled with gold active indicator
3. Wrap existing form in `{#if tab === 'details'}` block
4. Add `{:else if tab === 'members'}` block with `<MembersList tripId={tripId} ownerId={trip.userId} />`
5. In the Details tab, when `$activeMembers.length >= 2`, hide the `numberOfPeople` input and show: "People count is managed via the Members tab."
6. Import `MembersList` and `loadMembers`, call `loadMembers(tripId)` in `onMount`

- [ ] **Step 3: Verify members UI works**

Run: `pnpm dev`
Navigate to a trip, click Edit, switch to Members tab.
Expected: Can add members by name, see them in list, remove them. Owner shows as non-removable.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/MembersList.svelte src/routes/\(app\)/trips/\[id\]/edit/+page.svelte
git commit -m "feat: add members management UI on trip edit page

MembersList component with add/remove/link functionality.
Tab navigation on trip edit page. numberOfPeople field hidden
when named members exist."
```

---

## Task 9: Split Controls on Expense Form

**Files:**
- Create: `src/lib/components/SplitControls.svelte`
- Modify: `src/routes/(app)/trips/[id]/expenses/new/+page.svelte`
- Modify: `src/routes/(app)/trips/[id]/expenses/[expenseId]/+page.svelte`

- [ ] **Step 1: Create SplitControls component**

Create `src/lib/components/SplitControls.svelte`:

Props:
```typescript
interface Props {
	amount: number; // cents
	members: TripMember[];
	currentUserId: number;
	paidByMemberId: string;
	splits: { memberId: string; amount: number }[];
	onPaidByChange: (memberId: string) => void;
	onSplitsChange: (splits: { memberId: string; amount: number }[]) => void;
}
```

Renders:
- **"Paid by"** section: horizontal row of member name chips. Active chip has `background: var(--primary); color: white`. Others have subtle border.
- **"Split"** section with EQUAL/CUSTOM toggle:
  - EQUAL: checkbox per member (all checked by default), auto-calculated amounts via `computeEqualSplit()`. Unchecking recalculates.
  - CUSTOM: editable input per member. Validation line: "Total assigned: (amount)" green check or red warning.
- Invisible (`{#if members.length >= 2}`) when fewer than 2 members

Key behaviors:
- Default `paidByMemberId` to member whose `userId === currentUserId`
- `$effect` recalculates equal splits when `amount` changes
- Switching CUSTOM to EQUAL resets to equal
- Calls `onPaidByChange` and `onSplitsChange` callbacks on changes

- [ ] **Step 2: Integrate into new expense form**

In `src/routes/(app)/trips/[id]/expenses/new/+page.svelte`:
1. Import and mount `loadMembers`, read `$activeMembers`
2. Add state: `let paidByMemberId = $state('')`, `let splits = $state<{memberId: string; amount: number}[]>([])`
3. Render `<SplitControls>` between note field and submit button when `$activeMembers.length >= 2`
4. Initialize `paidByMemberId` via `$effect` to current user's member
5. Include `paidByMemberId` and `splits` in `createExpense()` call

- [ ] **Step 3: Integrate into edit expense form**

Same changes in `src/routes/(app)/trips/[id]/expenses/[expenseId]/+page.svelte`:
1. Load existing splits from expense data and populate SplitControls
2. When amount changes, toast "Split has been reset to equal" and recalculate
3. Include updated splits in `updateExpense()` call

- [ ] **Step 4: Verify split controls work**

Run: `pnpm dev`
Add 2+ members to a trip, then navigate to Add Expense.
Expected: "Paid by" chips and "Split" section visible. Amounts auto-split equally. Custom mode allows editing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SplitControls.svelte src/routes/\(app\)/trips/\[id\]/expenses/
git commit -m "feat: add split controls to expense new/edit forms

SplitControls component with equal/custom modes. Integrated into
both new and edit expense forms. Only visible for multi-member trips."
```

---

## Task 10: Balances and Settlement Page

**Files:**
- Create: `src/routes/(app)/trips/[id]/balances/+page.svelte`
- Create: `src/routes/(app)/trips/[id]/balances/+page.server.ts`
- Create: `src/lib/components/BalanceCard.svelte`
- Create: `src/lib/components/SettleUpSection.svelte`

- [ ] **Step 1: Create page server load**

Create `src/routes/(app)/trips/[id]/balances/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import { getBalances } from '$lib/server/settlements-service';
import { canAccessTrip } from '$lib/server/collaborators';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const access = canAccessTrip(params.id, userId);
	if (!access.canAccess) throw redirect(302, '/');

	const { balances, transfers, members } = getBalances(params.id);
	return { tripId: params.id, balances, transfers, members };
};
```

- [ ] **Step 2: Create BalanceCard component**

Create `src/lib/components/BalanceCard.svelte`:

Props: `balance: MemberBalance`

Compact card: initials avatar (36x36, gold for positive balance, red-tinted for negative), name, "Paid X / Owes X" subtitle, large balance amount (green positive, red negative). Retro styling with hard-offset shadow.

- [ ] **Step 3: Create SettleUpSection component**

Create `src/lib/components/SettleUpSection.svelte`:

Props: `transfers: SuggestedTransfer[]`, `tripId: string`

Renders each suggested transfer as a row: "[From] -> [To]: [Amount] [Mark Settled]"

"Mark Settled" click expands inline form:
- Amount input (pre-filled, editable for partial settlement)
- Note input (optional)
- Confirm / Cancel buttons

On confirm: calls `createSettlement()` from settlements store. On success: the parent page reloads balances.

When no transfers remain: show "All settled!" message.

- [ ] **Step 4: Create balances page**

Create `src/routes/(app)/trips/[id]/balances/+page.svelte`:

Layout sections:
1. Trip sub-nav: Dashboard | Expenses | **Balances** (active)
2. "Member Balances" heading + `<BalanceCard>` per member
3. "Settle Up" heading + `<SettleUpSection>` with transfers
4. "Settlement History" heading + chronological list from `$activeSettlements` (each with delete button)
5. Legacy banner if any expenses have null `paidByMemberId`: "X expenses were created before splitting was enabled"

Load data: call `loadMembers(tripId)` + `loadSettlements(tripId)` in `onMount`.

- [ ] **Step 5: Verify balances page**

Run: `pnpm dev`
Create trip with 2+ members, add expenses with splits, navigate to Balances.
Expected: Correct balances shown, transfers suggested, can mark settled.

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(app\)/trips/\[id\]/balances/ src/lib/components/BalanceCard.svelte src/lib/components/SettleUpSection.svelte
git commit -m "feat: add balances and settlement page

Balance cards per member, suggested minimum transfers, mark-settled
flow with partial amount support, settlement history with delete."
```

---

## Task 11: Dashboard Widget and Navigation

**Files:**
- Modify: `src/routes/(app)/trips/[id]/+page.svelte`
- Modify: `src/routes/(app)/trips/[id]/expenses/+page.svelte`

- [ ] **Step 1: Add balance widget to trip dashboard**

In `src/routes/(app)/trips/[id]/+page.svelte`:

1. Import and call `loadMembers(tripId)` on mount, read `$activeMembers`
2. When `$activeMembers.length >= 2`, fetch balances from `/api/trips/${tripId}/balances`
3. Insert "Group Balances" widget between stats grid and category breakdown:
   - Gold border (`2px solid var(--primary)`), gold header bar
   - Compact rows: 28x28 initials, name, balance (green/red)
   - Footer: "X transfers needed to settle up ->" linking to `/trips/${tripId}/balances`
4. Replace "Share" button with link to edit page members tab: `/trips/${tripId}/edit?tab=members`
5. Remove `ShareDialog` import and usage

- [ ] **Step 2: Add trip sub-navigation bar**

For multi-member trips, add a consistent nav bar to:
- `src/routes/(app)/trips/[id]/+page.svelte` (Dashboard active)
- `src/routes/(app)/trips/[id]/expenses/+page.svelte` (Expenses active)
- Already added in Task 10 for balances page

Style: horizontal flex row, text links. Active tab: `color: var(--primary); border-bottom: 2px solid var(--primary)`. Only show when `$activeMembers.length >= 2`.

- [ ] **Step 3: Add "paid by" to expense list**

In `src/routes/(app)/trips/[id]/expenses/+page.svelte`:
- Load members to resolve IDs to names
- For expenses with `paidByMemberId`, show "Paid by [Name]" label below expense details
- Use `var(--text-muted)` color, small text

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/trips/\[id\]/+page.svelte src/routes/\(app\)/trips/\[id\]/expenses/+page.svelte
git commit -m "feat: add balance widget to dashboard and trip sub-navigation

Group Balances widget on dashboard for multi-member trips.
Consistent Dashboard|Expenses|Balances nav bar. Paid-by labels
on expense list. Remove ShareDialog integration."
```

---

## Task 12: Cleanup - Remove Collaborator System

**Files:**
- Delete: `src/lib/components/ShareDialog.svelte`
- Delete: `src/routes/api/trips/[id]/collaborators/+server.ts`
- Modify: `src/lib/server/collaborators.ts`

- [ ] **Step 1: Update canAccessTrip to use tripMembers**

In `src/lib/server/collaborators.ts`, update `canAccessTrip` to check the `tripMembers` table (where `userId` matches and `deleted = 0`) instead of `tripCollaborators`. Keep the function signature the same.

Also update `getSharedTripIds` to query `tripMembers` where `userId = ?` and the user is not the trip owner.

- [ ] **Step 2: Remove ShareDialog component**

Delete `src/lib/components/ShareDialog.svelte`. Search for remaining imports and remove them.

- [ ] **Step 3: Remove collaborators API route**

Delete `src/routes/api/trips/[id]/collaborators/+server.ts`.

- [ ] **Step 4: Update remaining collaborator references**

Search codebase for `collaborator` references. Update any server loads, trip list pages, or other files that fetch or display collaborator info to use members instead.

- [ ] **Step 5: Verify nothing is broken**

Run: `pnpm check` (type checking)
Run: `pnpm test:unit`
Run: `pnpm build`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace collaborator system with trip members

Remove ShareDialog, collaborators API route. Update canAccessTrip
to use tripMembers table. All collaborator functionality now
handled through the members system."
```

---

## Task 13: Home Currency Lock

**Files:**
- Modify: `src/routes/(app)/trips/[id]/edit/+page.svelte`

Per spec: a trip's home currency cannot be changed once settlements exist.

- [ ] **Step 1: Check for settlements on trip edit load**

In the trip edit page, fetch settlements on mount and track whether any exist:

```typescript
let hasSettlements = $state(false);

onMount(async () => {
	// ... existing load logic ...
	try {
		const res = await fetch(`/api/trips/${tripId}/settlements`);
		if (res.ok) {
			const data = await res.json();
			hasSettlements = data.filter((s: Settlement) => !s.deleted).length > 0;
		}
	} catch {}
});
```

- [ ] **Step 2: Disable currency field when settlements exist**

In the Details tab, disable the home currency select and show explanation:

```svelte
<select bind:value={homeCurrency} disabled={hasSettlements}>
	<!-- existing options -->
</select>
{#if hasSettlements}
	<p style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">
		Currency cannot be changed while settlements exist.
	</p>
{/if}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(app\)/trips/\[id\]/edit/+page.svelte
git commit -m "feat: lock home currency when settlements exist

Disable currency selector on trip edit when settlements have been
recorded to prevent invalidating settlement amounts."
```

---

## Task 14: E2E Tests

**Files:**
- Create: `tests/e2e/expense-splitting.spec.ts`

Write Playwright e2e tests following Gherkin-style conventions from CLAUDE.md.

- [ ] **Step 1: Write e2e test file**

Create `tests/e2e/expense-splitting.spec.ts` with these scenarios:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Expense Splitting', () => {
	test.describe.serial(() => {
		// Scenario: Solo trip shows no splitting controls
		test('expense form has no split controls for solo trip', async ({ page }) => {
			// Given a trip with 1 person exists
			// When the user adds an expense
			// Then no "Paid by" or "Split" section is visible
		});

		// Scenario: Adding members enables splitting
		test('adding members to a trip activates splitting UI', async ({ page }) => {
			// Given a trip exists
			// When the user adds "Alice" and "Bob" as members
			// Then the expense form shows "Paid by" and "Split" sections
		});

		// Scenario: Equal split divides expense among all members
		test('equal split correctly divides expense amount', async ({ page }) => {
			// Given a trip with 3 members exists
			// When the user adds a 90 EUR expense with equal split
			// Then each member's share is 30 EUR
		});

		// Scenario: Balances reflect who owes whom
		test('balances page shows correct amounts after expenses', async ({ page }) => {
			// Given a trip where one member paid 100 EUR split equally with another
			// When the user views the balances page
			// Then the payer is owed 50 EUR and the other member owes 50 EUR
		});

		// Scenario: Recording a settlement updates balances
		test('marking a transfer as settled reduces outstanding balance', async ({ page }) => {
			// Given outstanding balances exist
			// When the user marks a transfer as settled
			// Then the balances are updated to reflect the payment
		});

		// Scenario: Dashboard shows balance widget for group trips
		test('dashboard shows group balances widget for multi-member trips', async ({ page }) => {
			// Given a trip with members and expenses exists
			// When the user views the trip dashboard
			// Then a "Group Balances" widget is visible
		});
	});
});
```

Implement each test body using Playwright actions. Reference existing e2e tests in `tests/e2e/` for patterns (setup, login, navigation).

- [ ] **Step 2: Run e2e tests**

Run: `pnpm test:e2e tests/e2e/expense-splitting.spec.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/expense-splitting.spec.ts
git commit -m "test: add e2e tests for expense splitting feature

Covers: solo trip exclusion, member management, equal splits,
balance computation, settlements, dashboard widget."
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run all checks**

```bash
pnpm check
pnpm lint
pnpm test:unit
pnpm build
pnpm test:e2e
```

All must pass.

- [ ] **Step 2: Manual smoke test**

1. Create a solo trip - verify no splitting UI anywhere
2. Create a group trip with 3 named members - verify members tab, split controls, balances page, dashboard widget
3. Add expenses with equal and custom splits - verify balances calculate correctly
4. Record a settlement - verify balances update
5. Go offline, add an expense, go online - verify sync works
6. Delete a member with expenses - verify soft delete, balances preserved

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
