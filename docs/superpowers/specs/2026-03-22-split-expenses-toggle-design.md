# Split Expenses Toggle — Design Spec

**Date**: 2026-03-22
**Status**: Approved

## Problem

When sharing a trip with a partner or family member who shares finances (e.g. joint bank account), the expense splitting, balance tracking, and settlement UI adds unnecessary complexity. Users need a way to collaborate on a trip without the group expense overhead.

## Solution

Add a per-trip `splitExpenses` boolean (default: enabled). When disabled, all expense splitting, balance computation, and settlement UI is hidden. Trip members still function normally for collaboration. Data is preserved — toggling back on restores everything.

## Database Change

Add `splitExpenses` integer column (SQLite boolean, 0/1) to the `trips` table with a default of `1` (enabled). All existing trips retain current behavior.

## Type Changes

Add `splitExpenses: boolean` to the `Trip` TypeScript type (default `true`).

## Server Change Sites

These server files have hardcoded field lists that must include `splitExpenses`:

- **`trips-service.ts` — `toTrip()` mapper**: Must include `splitExpenses` in the returned object (maps DB integer to boolean). Without this, the field is silently dropped from all API responses.
- **`trips-service.ts` — `createTrip()`**: Must forward `splitExpenses` from the request data into the INSERT. The field is settable at creation time (not edit-only).
- **`trips-service.ts` — `updateTrip()`**: Must forward `splitExpenses` from the update payload into the DB UPDATE.
- **`sync/server.ts` — trip `create` branch**: The hardcoded field list in the sync server's trip INSERT must include `splitExpenses`, otherwise offline-created trips with splitting disabled would lose the setting on sync.

## UI Changes

### Trip Edit Form

Add a checkbox near the members section:

```
[x] Track group expenses
    Split costs between members and track who owes what
```

Unchecking hides split-related UI across the trip. No confirmation dialog — data is preserved.

The edit page's `handleSave` function must include `splitExpenses` in the `updateTrip()` call. The client-side store's `updateTrip` must also forward the field.

### Hidden When Disabled

| Area | File(s) | What's hidden |
|---|---|---|
| Expense form (new/edit) | `trips/[id]/expenses/new/+page.svelte`, `[expenseId]/+page.svelte` | "Paid by" selector, split controls (`SplitControls.svelte`) |
| Expense list | `trips/[id]/expenses/+page.svelte` | "Paid by {memberName}" text per expense |
| Trip dashboard | `trips/[id]/+page.svelte` | Group balances widget |
| Sub-navigation (Balances tab) | `trips/[id]/+page.svelte` AND `trips/[id]/expenses/+page.svelte` | Balances tab link — condition changes from `members >= 2` to `members >= 2 && splitExpenses` |
| Balances page | `trips/[id]/balances/+page.server.ts` | Entire page — server load function must redirect to dashboard (it calls `getBalances()` directly, not the REST endpoint) |

### Unaffected

- Trip members (adding/removing people for collaboration)
- Expense CRUD (amounts, categories, currencies)
- Dashboard stats (total spend, budget gauge, category charts, projections)
- Offline sync

## API Behavior

- **Expense creation/update**: When `splitExpenses` is off, the API ignores `paidByMemberId` and `splits` payload — no split records are created for new expenses.
- **Balance endpoint** (`GET /api/trips/[id]/balances`): Returns empty balances and no suggested transfers when disabled.
- **Balance server load** (`balances/+page.server.ts`): Redirects to trip dashboard when `splitExpenses` is off. This load function bypasses the REST endpoint and calls `getBalances()` directly.
- **Existing data**: Split records, settlements, and `paidByMemberId` values already in the DB remain untouched. Re-enabling restores them.

## Sync & Offline

- The `splitExpenses` field is included in the trip's CRDT sync payload, same as other trip fields.
- The sync server's trip `create` branch must include `splitExpenses` in its hardcoded field list.
- **IDB backward compatibility**: Old cached trips in IndexedDB will have `splitExpenses: undefined`. Client code must treat `undefined` as `true` (splitting enabled) to preserve existing behavior. No IDB version bump needed — just a safe default at read time.
