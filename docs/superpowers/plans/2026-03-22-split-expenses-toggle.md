# Split Expenses Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-trip `splitExpenses` toggle that hides all expense splitting, balance, and settlement UI when disabled.

**Architecture:** Add a `splitExpenses` boolean column to the `trips` table (default true). Thread it through the type system, server service, API, sync, stores, and all UI pages that conditionally render split-related content. Data is preserved — the toggle only controls visibility.

**Tech Stack:** SvelteKit, Svelte 5, Drizzle ORM (SQLite), TypeScript

---

### Task 1: Database Schema & Type

**Files:**
- Modify: `src/lib/server/db/schema.ts:25-48` (trips table)
- Modify: `src/lib/types/index.ts:1-17` (Trip interface)

- [ ] **Step 1: Add `splitExpenses` column to schema**

In `src/lib/server/db/schema.ts`, add to the `trips` table definition, after the `homeCurrency` field:

```typescript
splitExpenses: integer('split_expenses', { mode: 'boolean' }).default(true).notNull(),
```

- [ ] **Step 2: Add `splitExpenses` to Trip type**

In `src/lib/types/index.ts`, add to the `Trip` interface after `homeCurrency`:

```typescript
splitExpenses: boolean;
```

- [ ] **Step 3: Push schema to DB**

Run: `pnpm db:push`
Expected: Schema updated successfully, `split_expenses` column added to `trips` table with default `1`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/types/index.ts
git commit -m "feat: add splitExpenses column to trips schema and type"
```

---

### Task 2: Server Service — `toTrip`, `createTrip`, `updateTrip`

**Files:**
- Modify: `src/lib/server/trips-service.ts:8-24` (toTrip mapper)
- Modify: `src/lib/server/trips-service.ts:121-143` (createTrip)
- Modify: `src/lib/server/trips-service.ts:145-177` (updateTrip)

- [ ] **Step 1: Add `splitExpenses` to `toTrip()` mapper**

In `src/lib/server/trips-service.ts`, add to the `toTrip` return object after `homeCurrency`:

```typescript
splitExpenses: row.splitExpenses,
```

- [ ] **Step 2: Add `splitExpenses` to `createTrip()` insert**

In `src/lib/server/trips-service.ts`, in the `createTrip` function's `.values({...})`, add after `homeCurrency`:

```typescript
splitExpenses: data.splitExpenses ?? true,
```

- [ ] **Step 3: Add `splitExpenses` to `updateTrip()` updates**

In `src/lib/server/trips-service.ts`, in the `updateTrip` function, add after the `homeCurrency` check:

```typescript
if (data.splitExpenses !== undefined) updates.splitExpenses = data.splitExpenses;
```

- [ ] **Step 4: Verify build compiles**

Run: `pnpm check`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/trips-service.ts
git commit -m "feat: thread splitExpenses through trip service CRUD"
```

---

### Task 3: Sync Server — Trip Create Branch

**Files:**
- Modify: `src/lib/sync/server.ts:41-58` (trip create branch)

- [ ] **Step 1: Add `splitExpenses` to sync create branch**

In `src/lib/sync/server.ts`, in the trip `create` insert (around line 43-58), add after `homeCurrency`:

```typescript
splitExpenses: (change.data.splitExpenses as boolean) ?? true,
```

**Note:** The sync server's `update` branch (lines 30–39) uses a generic `Object.entries(change.data)` loop that already handles `splitExpenses` automatically — no code change needed there.

- [ ] **Step 2: Commit**

```bash
git add src/lib/sync/server.ts
git commit -m "feat: include splitExpenses in sync server trip create"
```

---

### Task 4: Client Store — `createTrip` and IDB Backward Compatibility

**Files:**
- Modify: `src/lib/stores/trips.ts:46-100` (createTrip)

- [ ] **Step 1: Add `splitExpenses` to client `createTrip` store function**

In `src/lib/stores/trips.ts`, in the `createTrip` function, add `splitExpenses` to the data parameter type (after `homeCurrency?`):

```typescript
splitExpenses?: boolean;
```

And in the `trip: Trip` object construction, add after `homeCurrency`:

```typescript
splitExpenses: data.splitExpenses ?? true,
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/stores/trips.ts
git commit -m "feat: add splitExpenses to client trip store"
```

**Note:** The `updateTrip` store function already forwards all `Partial<Trip>` fields via spread — no change needed there. IDB backward compatibility is handled by the `?? true` default: old cached trips with `undefined` splitExpenses are treated as enabled.

---

### Task 5: Trip Edit Form — Add Toggle

**Files:**
- Modify: `src/routes/(app)/trips/[id]/edit/+page.svelte`

- [ ] **Step 1: Add `splitExpenses` state variable**

In the `<script>` section, after `let homeCurrency = $state('EUR');`, add:

```typescript
let splitExpenses = $state(true);
```

- [ ] **Step 2: Populate from fetched trip**

In the `onMount` callback, after `homeCurrency = fetched.homeCurrency;`, add:

```typescript
splitExpenses = fetched.splitExpenses ?? true;
```

- [ ] **Step 3: Include in `handleSave`**

In `handleSave`, add `splitExpenses` to the `updateTrip` call:

```typescript
await updateTrip(tripId, {
	name: name.trim(),
	destination: destination.trim(),
	startDate: fromDateInput(startDate),
	endDate: fromDateInput(endDate),
	numberOfPeople,
	totalBudget: budget,
	homeCurrency,
	splitExpenses
});
```

- [ ] **Step 4: Add checkbox UI in the details tab**

In the `{#if tab === 'details'}` form, add a checkbox after the budget input (`</div>` for budget), before the save/cancel buttons:

```svelte
<label class="flex items-start gap-3 cursor-pointer">
	<input
		type="checkbox"
		bind:checked={splitExpenses}
		class="mt-0.5 h-4 w-4"
		data-testid="split-expenses-toggle"
	/>
	<div>
		<span class="text-sm font-medium text-[var(--text)]">Track group expenses</span>
		<p class="text-xs text-[var(--text-muted)]">Split costs between members and track who owes what</p>
	</div>
</label>
```

This is a trip-level preference and should always be visible in the details form, regardless of member count.

- [ ] **Step 5: Verify the form renders correctly**

Run: `pnpm dev` and navigate to a trip edit page with 2+ members. Confirm the checkbox appears and saves correctly.

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(app\)/trips/\[id\]/edit/+page.svelte
git commit -m "feat: add splitExpenses toggle to trip edit form"
```

---

### Task 6: Dashboard — Hide Balances Widget and Balances Tab

**Files:**
- Modify: `src/routes/(app)/trips/[id]/+page.svelte:53-62` (balance fetch)
- Modify: `src/routes/(app)/trips/[id]/+page.svelte:245-271` (sub-navigation)
- Modify: `src/routes/(app)/trips/[id]/+page.svelte:325-378` (balances widget)

- [ ] **Step 1: Guard the balance fetch with `splitExpenses`**

In `src/routes/(app)/trips/[id]/+page.svelte`, change the balance fetch condition (around line 53) from:

```typescript
if ($activeMembers.length >= 2) {
```

to:

```typescript
if ($activeMembers.length >= 2 && trip?.splitExpenses !== false) {
```

- [ ] **Step 2: Guard the sub-navigation**

Change the sub-navigation condition (line 245) from:

```svelte
{#if $activeMembers.length >= 2}
```

to:

```svelte
{#if $activeMembers.length >= 2 && trip?.splitExpenses !== false}
```

And remove the Balances link from this block. Instead, conditionally show the Balances link only when `splitExpenses` is enabled. Replace the full sub-nav block:

```svelte
{#if $activeMembers.length >= 2}
	<div class="mb-6" style="border-bottom: 1px solid var(--border-subtle);">
		<div class="flex gap-0">
			<a
				href="/trips/{trip.id}"
				class="px-4 py-2.5 text-[13px] font-medium transition-colors"
				style="color: var(--primary); border-bottom: 2px solid var(--primary); margin-bottom: -1px;"
			>
				Dashboard
			</a>
			<a
				href="/trips/{trip.id}/expenses"
				class="px-4 py-2.5 text-[13px] transition-colors hover:text-[var(--text)]"
				style="color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px;"
			>
				Expenses
			</a>
			{#if trip.splitExpenses !== false}
				<a
					href="/trips/{trip.id}/balances"
					class="px-4 py-2.5 text-[13px] transition-colors hover:text-[var(--text)]"
					style="color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px;"
				>
					Balances
				</a>
			{/if}
		</div>
	</div>
{/if}
```

- [ ] **Step 3: Guard the balances widget**

Change the balances widget condition (line 325) from:

```svelte
{#if $activeMembers.length >= 2 && balances.length > 0}
```

to:

```svelte
{#if $activeMembers.length >= 2 && trip.splitExpenses !== false && balances.length > 0}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/trips/\[id\]/+page.svelte
git commit -m "feat: hide balances widget and tab when splitExpenses disabled"
```

---

### Task 7: Expense List — Hide "Paid by" and Balances Tab

**Files:**
- Modify: `src/routes/(app)/trips/[id]/expenses/+page.svelte:100-126` (sub-navigation)
- Modify: `src/routes/(app)/trips/[id]/expenses/+page.svelte:163-167` (paid by text)

- [ ] **Step 1: Guard the sub-navigation Balances link**

In `src/routes/(app)/trips/[id]/expenses/+page.svelte`, update the sub-navigation block (line 100) the same way as the dashboard. Keep `$activeMembers.length >= 2` for showing the nav, but wrap the Balances link:

```svelte
{#if trip?.splitExpenses !== false}
	<a
		href="/trips/{tripId}/balances"
		class="px-4 py-2.5 text-[13px] transition-colors hover:text-[var(--text)]"
		style="color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px;"
	>
		Balances
	</a>
{/if}
```

- [ ] **Step 2: Guard the "Paid by" text**

Change the condition (line 163) from:

```svelte
{#if expense.paidByMemberId && memberMap.get(expense.paidByMemberId)}
```

to:

```svelte
{#if trip?.splitExpenses !== false && expense.paidByMemberId && memberMap.get(expense.paidByMemberId)}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(app\)/trips/\[id\]/expenses/+page.svelte
git commit -m "feat: hide paid-by text and balances tab when splitExpenses disabled"
```

---

### Task 8: Expense Forms — Hide Split Controls

**Files:**
- Modify: `src/routes/(app)/trips/[id]/expenses/new/+page.svelte:189-200`
- Modify: `src/routes/(app)/trips/[id]/expenses/[expenseId]/+page.svelte:198-209`

- [ ] **Step 1: Guard split controls on new expense form**

In `src/routes/(app)/trips/[id]/expenses/new/+page.svelte`, change the condition (line 189) from:

```svelte
{#if $activeMembers.length >= 2}
```

to:

```svelte
{#if $activeMembers.length >= 2 && trip?.splitExpenses !== false}
```

- [ ] **Step 2: Guard split controls on edit expense form**

In `src/routes/(app)/trips/[id]/expenses/[expenseId]/+page.svelte`, change the condition (line 198) from:

```svelte
{#if $activeMembers.length >= 2}
```

to:

```svelte
{#if $activeMembers.length >= 2 && trip?.splitExpenses !== false}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(app\)/trips/\[id\]/expenses/new/+page.svelte src/routes/\(app\)/trips/\[id\]/expenses/\[expenseId\]/+page.svelte
git commit -m "feat: hide split controls on expense forms when splitExpenses disabled"
```

---

### Task 9: Balances Page — Server-Side Redirect

**Files:**
- Modify: `src/routes/(app)/trips/[id]/balances/+page.server.ts`

- [ ] **Step 1: Add redirect when splitExpenses is disabled**

In `src/routes/(app)/trips/[id]/balances/+page.server.ts`, import `getTrip` and add a guard after the access check:

```typescript
import type { PageServerLoad } from './$types';
import { getBalances } from '$lib/server/settlements-service';
import { canAccessTrip } from '$lib/server/collaborators';
import { getTrip } from '$lib/server/trips-service';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const access = canAccessTrip(params.id, userId);
	if (!access.canAccess) throw redirect(302, '/');

	const trip = getTrip(params.id, userId);
	if (trip?.splitExpenses === false) throw redirect(302, `/trips/${params.id}`);

	const { balances, transfers, members } = getBalances(params.id);
	return { tripId: params.id, balances, transfers, members };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/\(app\)/trips/\[id\]/balances/+page.server.ts
git commit -m "feat: redirect balances page when splitExpenses disabled"
```

---

### Task 10: API Behavior — Strip Splits When Disabled

**Files:**
- Modify: `src/lib/server/expenses-service.ts:83-139` (createExpense)
- Modify: `src/lib/server/expenses-service.ts:141-215` (updateExpense)
- Modify: `src/routes/api/trips/[id]/balances/+server.ts`

When `splitExpenses` is off for a trip, new expenses should not create split records, and the balance API should return empty results.

- [ ] **Step 1: Strip splits in `createExpense` when `splitExpenses` is off**

In `src/lib/server/expenses-service.ts`, in the `createExpense` function, after verifying trip access (line 87), look up the trip's `splitExpenses` flag and strip split data if disabled:

```typescript
import { getTrip } from './trips-service.js';
```

Then after `if (!verifyTripAccess(data.tripId, userId)) return null;` (line 87), add:

```typescript
// Strip split data if trip has splitting disabled
const trip = getTrip(data.tripId, userId);
if (trip?.splitExpenses === false) {
	data.paidByMemberId = null;
	data.splits = undefined;
}
```

- [ ] **Step 2: Strip splits in `updateExpense` when `splitExpenses` is off**

In the same file, in `updateExpense`, after verifying trip access (line 147), add:

```typescript
const trip = getTrip(tripId, userId);
if (trip?.splitExpenses === false) {
	data.paidByMemberId = null;
	data.splits = undefined;
}
```

- [ ] **Step 3: Guard the balance REST endpoint**

In `src/routes/api/trips/[id]/balances/+server.ts`, return empty when `splitExpenses` is off:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { canAccessTrip } from '$lib/server/collaborators.js';
import { getTrip } from '$lib/server/trips-service.js';
import { getBalances } from '$lib/server/settlements-service.js';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	const { canAccess } = canAccessTrip(params.id, userId);
	if (!canAccess) throw error(404, 'Not found');

	const trip = getTrip(params.id, userId);
	if (trip?.splitExpenses === false) {
		return json({ balances: [], transfers: [], members: [] });
	}

	return json(getBalances(params.id));
};
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/expenses-service.ts src/routes/api/trips/\[id\]/balances/+server.ts
git commit -m "feat: strip splits and return empty balances when splitExpenses disabled"
```

---

### Task 11: E2E Test — Split Expenses Toggle

**Files:**
- Modify: `tests/e2e/expense-splitting.spec.ts`

- [ ] **Step 1: Add test for the toggle**

Add to the end of `tests/e2e/expense-splitting.spec.ts`, inside the `test.describe.serial` block:

```typescript
// Scenario: Disabling group expenses hides split controls and balances
test('Scenario: Disabling split expenses hides all splitting UI', async ({
	authenticatedPage: page
}) => {
	// Given a trip with two members
	await createTripWithMembers(page, 'No Split Trip', 'Vienna', ['Leo', 'Mia']);

	// When the user disables group expenses in trip settings
	const detailsTab = page.getByRole('button', { name: 'Details' });
	await detailsTab.click();
	await page.getByTestId('split-expenses-toggle').uncheck();
	await page.getByTestId('trip-save-btn').click();
	await page.waitForURL(/\/trips\/[^/]+$/);

	// Then the dashboard does not show the Balances tab
	await expect(page.getByRole('link', { name: 'Balances' })).not.toBeVisible();

	// And the expense form does not show split controls
	await page.getByTestId('add-expense-btn').click();
	await page.waitForURL(/\/expenses\/new/);
	await expect(page.getByText('Paid by')).not.toBeVisible();
});
```

- [ ] **Step 2: Run e2e tests**

Run: `pnpm test:e2e`
Expected: All tests pass, including the new scenario.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/expense-splitting.spec.ts
git commit -m "test: add e2e test for splitExpenses toggle"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run type check**

Run: `pnpm check`
Expected: No type errors.

- [ ] **Step 2: Run unit tests**

Run: `pnpm test:unit`
Expected: All unit tests pass.

- [ ] **Step 3: Run e2e tests**

Run: `pnpm test:e2e`
Expected: All e2e tests pass.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds.
