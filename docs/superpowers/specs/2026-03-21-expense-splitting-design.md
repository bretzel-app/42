# Expense Splitting — Design Spec

## Overview

Add expense splitting to 42 so that group travelers can track who paid what, how expenses are divided, and settle debts at the end of a trip. The feature is opt-in: trips without named members continue to work exactly as they do today.

## Goals

- Track who paid each expense and how costs are split among trip members
- Calculate per-member balances (who owes whom)
- Suggest minimum transfers to settle all debts
- Record settlements and update balances accordingly
- Preserve backward compatibility: solo trips and unnamed-people trips are unaffected

## Non-Goals

- Real-time notifications or push alerts for balance changes
- Integration with payment services (Venmo, PayPal, etc.)
- Percentage-based splitting (only equal and custom amounts)
- Per-category splitting rules

---

## Data Model

### New Tables

#### `tripMembers`

Replaces `tripCollaborators`. Every person on a trip is a member — either linked to a 42 user account or a name-only placeholder.

| Column      | Type              | Notes                                      |
|-------------|-------------------|--------------------------------------------|
| `id`        | text (nanoid)     | PK                                         |
| `tripId`    | text              | FK → trips                                 |
| `name`      | text              | Display name ("Alice")                     |
| `userId`    | integer (nullable)| FK → users. null = unlinked (name-only)    |
| `addedBy`   | integer           | FK → users (who added this member)         |
| `deleted`   | integer (0/1)     | Soft delete for sync                       |
| `createdAt` | text              | ISO timestamp                              |
| `updatedAt` | text              | ISO timestamp                              |
| `version`   | integer           | CRDT version                               |

- Trip owner is auto-added as a member when the first non-owner member is added.
- The owner member cannot be removed.
- Linked members (userId set) can log in and see the trip, its expenses, and their balances.
- Unlinked members are display-name-only placeholders.

#### `expenseSplits`

How each expense is divided among members.

| Column      | Type              | Notes                                      |
|-------------|-------------------|--------------------------------------------|
| `id`        | text (nanoid)     | PK                                         |
| `expenseId` | text              | FK → expenses                              |
| `memberId`  | text              | FK → tripMembers                           |
| `amount`    | integer           | Share in cents (in expense's currency)      |
| `deleted`   | integer (0/1)     | Soft delete for sync                       |
| `createdAt` | text              | ISO timestamp                              |
| `updatedAt` | text              | ISO timestamp                              |
| `version`   | integer           | CRDT version                               |

- For equal splits, amounts are computed and stored (not computed on read).
- Rounding: remainder cents go to the first participant (e.g. €10 ÷ 3 = €3.34 + €3.33 + €3.33).
- Sum of all splits for an expense must equal the expense amount.

#### `settlements`

Recorded payments between members to settle debts.

| Column         | Type              | Notes                                   |
|----------------|-------------------|-----------------------------------------|
| `id`           | text (nanoid)     | PK                                      |
| `tripId`       | text              | FK → trips                              |
| `fromMemberId` | text              | FK → tripMembers (who pays)             |
| `toMemberId`   | text              | FK → tripMembers (who receives)         |
| `amount`       | integer           | Amount in cents (home currency)         |
| `date`         | text              | When the settlement happened            |
| `note`         | text (nullable)   | Optional note (e.g. "bank transfer")    |
| `deleted`      | integer (0/1)     | Soft delete for sync                    |
| `createdAt`    | text              | ISO timestamp                           |
| `updatedAt`    | text              | ISO timestamp                           |
| `version`      | integer           | CRDT version                            |

- Settlements are always in the trip's home currency.
- Partial settlements are allowed (settle less than the suggested amount).
- **Home currency constraint**: a trip's home currency cannot be changed once settlements exist. The trip edit form disables the currency field and shows a note explaining why.

### Changes to Existing Tables

#### `expenses` — add column

| Column           | Type            | Notes                                        |
|------------------|-----------------|----------------------------------------------|
| `paidByMemberId` | text (nullable) | FK → tripMembers. null = legacy expense       |

- New expenses on multi-member trips require a `paidByMemberId`.
- Existing expenses (pre-splitting) have `paidByMemberId = null` — they count toward total spent but not toward member balances.

### Migration

1. Existing `tripCollaborators` rows become `tripMembers` entries (with `userId` linked, `name` from user's `displayName`). Migrated rows get: `deleted = 0`, `version = 1`, `createdAt = tripCollaborators.addedAt`, `updatedAt = tripCollaborators.addedAt`.
2. The trip owner is also inserted as a `tripMembers` row for each trip that has collaborators.
3. Existing expenses get `paidByMemberId = null` (no splits created).
4. The `tripCollaborators` table is dropped after migration.

---

## "Number of People" vs Named Members

The existing `numberOfPeople` field on trips coexists with the new member system:

- **No named members**: `numberOfPeople` is used for dashboard stats (avg/person). No splitting features visible.
- **Named members exist (2+)**: member count becomes the source of truth. The `numberOfPeople` field is hidden on the edit form and synced to the member count.
- **Transition**: when the first non-owner member is added, `numberOfPeople` is updated to match member count. When all non-owner members are removed, `numberOfPeople` reverts to its stored value.

This means a user can create a "family trip for 4" without naming anyone and get per-person averages on the dashboard, with no splitting UI. Only when they explicitly add named members does splitting activate.

---

## Balance Calculation

For each member, balance is computed in the trip's home currency:

```
balance = (total paid, converted to home currency)
        - (total owed from splits, converted to home currency)
        - (settlements sent)
        + (settlements received)
```

- **Positive balance** → member is owed money
- **Negative balance** → member owes money
- **Zero** → settled

Multi-currency expenses are converted to home currency using the trip's exchange rates (same as existing dashboard logic).

### Minimum Transfer Algorithm

To suggest the fewest transfers to settle all debts:

1. Compute each member's net balance.
2. Sort into creditors (positive) and debtors (negative).
3. Greedily match the largest debtor with the largest creditor, transferring the minimum of the two amounts.
4. Repeat until all balances are zero.

This greedy approach produces optimal or near-optimal results for typical group sizes (2-8 people).

---

## UI Changes

### Visibility Rule

All splitting UI is **hidden** when the trip has fewer than 2 named members. This applies to:

- "Paid by" and "Split" sections on the expense form
- "Balances" tab in trip navigation
- "Group Balances" widget on the dashboard
- Settlement-related actions

### A. Trip Members Management

**Location**: Trip edit page, new "Members" tab (alongside "Details" and "Currencies").

**Replaces**: The current `ShareDialog` component and the collaborator system. The "share trip" button on the dashboard is replaced by member management on the edit page. The `ShareDialog.svelte` component is removed.

**UI elements**:
- Input field with dual purpose: type a name → add unlinked member; search by email → link to existing 42 user.
- Member list with avatar (initials), name, link status (OWNER / LINKED / name-only).
- "Link to account" action on unlinked members → searches users and associates `userId`.
- Remove button (×) on all members except the owner → soft delete.
- Tip/help text explaining linked vs unlinked members.

**Behaviors**:
- Trip owner is auto-added and cannot be removed.
- Adding a member updates `numberOfPeople` to match member count.
- Removing a member with existing expenses: soft delete, name preserved in split history, removed from future default splits, balance remains until settled.

### B. Expense Form — Split Controls

**Location**: New/edit expense form, below existing fields.

**Only visible when**: trip has 2+ named members.

**UI elements**:
- **"Paid by"** — horizontal member chips. Tap to select who paid. Defaults to current user (if they're a member) or the trip owner.
- **"Split" section** with mode toggle:
  - **EQUAL** (default) — checkboxes per member. All checked by default. Uncheck to exclude. Amount auto-calculated and displayed. Summary line: "€48.00 ÷ 4 people = €12.00 each".
  - **CUSTOM** — editable amount input per member. Validation: total of all amounts must equal expense amount. Shows running total with checkmark or warning.

**Behaviors**:
- Switching from CUSTOM back to EQUAL resets all amounts to equal.
- Editing an expense amount resets to equal split among same participants (toast: "Split has been reset to equal").
- If only 1 member is checked, the entire amount goes to them (valid — e.g. a personal expense during a group trip).

### C. Balances & Settlement View

**Location**: New route at `/trips/[id]/balances`.

**Only in navigation when**: trip has 2+ named members.

**UI sections**:

1. **Member Balances** — card per member showing: avatar, name, total paid, total owed, net balance (green positive / red negative).
2. **Settle Up** — bordered section with suggested minimum transfers. Each row: "Bob → Frederic: €143.50" with "Mark Settled" button. Clicking opens a small inline form (amount pre-filled, editable for partial settlement, optional note field).
3. **Settlement History** — chronological list of recorded settlements. Each shows: who paid whom, amount, date, optional note. Can be deleted if entered by mistake.

**Behaviors**:
- All amounts displayed in home currency.
- Balances are computed, not stored — derived from expenses + splits + settlements.
- "Mark Settled" pre-fills the suggested amount but allows editing (partial settlements).
- Banner at top if legacy expenses exist: "X expenses were created before splitting was enabled" with option to assign them.

### D. Dashboard Integration

**Location**: Existing trip dashboard page, new widget between stats grid and category breakdown.

**Only visible when**: trip has 2+ named members.

**UI elements**:
- **"Group Balances" card** with gold border/header. Compact rows: avatar initials, name, balance amount (green/red). Footer link: "X transfers needed to settle up →" linking to balances page.
- **"View all →"** link in card header → navigates to balances page.

**Behaviors**:
- Clicking any part of the widget navigates to the full balances page.
- Transfer count in footer reflects unsettled suggested transfers.

### E. Trip Navigation

For multi-member trips, the trip sub-navigation gains a "Balances" tab:

```
Dashboard | Expenses | Balances
```

For solo/unnamed trips, navigation remains unchanged:

```
Dashboard | Expenses
```

---

## Offline & Sync

All new tables (`tripMembers`, `expenseSplits`, `settlements`) follow the existing CRDT sync pattern:

- **IndexedDB stores**: add `tripMembers`, `expenseSplits`, `settlements` object stores.
- **Sync queue**: changes to these entities are queued for push like trips/expenses.
- **LWW merge**: conflicts resolved by `updatedAt` + `version` tiebreak (same as existing entities).
- **Soft delete**: `deleted` flag, not hard delete — required for sync.
- **Server sync**: `syncLog` entries created for all new entity types.
- **Offline balances**: balances are always computed client-side from local IDB data when offline. The `GET /api/trips/[id]/balances` endpoint is a convenience for server-side rendering and initial page load — not the source of truth for offline use.

---

## API Endpoints

New endpoints following existing patterns:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/trips/[id]/members` | List trip members |
| `POST` | `/api/trips/[id]/members` | Add a member |
| `PUT` | `/api/trips/[id]/members/[memberId]` | Update member (name, link) |
| `DELETE` | `/api/trips/[id]/members/[memberId]` | Soft-delete member |
| `GET` | `/api/trips/[id]/balances` | Computed balances + suggested transfers |
| `POST` | `/api/trips/[id]/settlements` | Record a settlement |
| `DELETE` | `/api/trips/[id]/settlements/[id]` | Delete a settlement |

Expense endpoints are unchanged — `paidByMemberId` and split data are included in the existing expense create/update payloads.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Delete member with expenses | Soft delete. Name preserved in split history. Removed from future default splits. Balance remains until settled. |
| Edit expense amount after custom split | Reset to equal split among same participants. Toast: "Split has been reset to equal." |
| Rounding on equal split | Remainder cents go to first participant. |
| Multi-currency settlement | Settlements always in home currency. |
| Legacy expenses (pre-splitting) | `paidByMemberId = null`, no splits. Count toward total spent, not member balances. Banner on balances page offers to assign them. |
| Trip with 1 member only (owner) | No splitting UI. Behaves as solo trip. |
| All debts settled | Settle Up section shows "All settled!" message. |
| Member linked to user who is deleted | Member remains (name preserved), `userId` set to null. |
