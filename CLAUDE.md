# CLAUDE.md

## Project overview

42 by Bretzel — self-hostable holiday budget tracking app. Multi-user with password auth, offline-first PWA with CRDT-based sync. Travelers create trips, log expenses in multiple currencies, and view real-time dashboard analytics (spending breakdowns, projections, category charts).

## Tech stack

- **Framework**: SvelteKit with Svelte 5 (runes: `$state`, `$derived`, `$props`, `$effect`)
- **Adapter**: `@sveltejs/adapter-node` (builds to `build/`, runs via `node build`)
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Database**: SQLite via better-sqlite3 + Drizzle ORM (WAL mode, schema at `src/lib/server/db/schema.ts`)
- **Auth**: Multi-user with password auth (Argon2), role-based (admin/user), session cookies (30-day expiry)
- **PWA**: `@vite-pwa/sveltekit` for service worker and offline caching
- **Package manager**: pnpm

## Design system: Retro Parchment

The UI follows a **parchment + 8-bit retro** aesthetic — identical to the sibling app Crumbs. All design decisions must preserve this character.

### Color palette

All colors are CSS variables in `src/app.css`. Never use hardcoded Tailwind colors (e.g. `text-gray-500`, `bg-red-600`) — always reference CSS variables:

| Variable | Value | Usage |
|---|---|---|
| `--bg-base` | `#f0e6d3` | Page background (warm parchment) |
| `--bg-surface` | `#faf5eb` | Cards, panels, inputs |
| `--primary` | `#C8860A` | Brand gold — links, active states, accents |
| `--primary-hover` | `#E8A020` | Gold hover state |
| `--text` | `#1a1a2e` | Primary text (near-black) |
| `--text-muted` | `#6b6272` | Secondary text, placeholders |
| `--border` | `#1a1a2e` | Strong borders (editor, login card) |
| `--border-subtle` | `#d4cabb` | Default card borders, dividers |
| `--destructive` | `#a63d2f` | Delete actions, error icons |
| `--error-bg/border/text` | warm reds | Error states (themed, not clinical red) |
| `--success-bg/text` | warm greens | Success states |
| `--card-shadow` | `2px 2px 0px` | Hard-offset retro shadow (no blur) |
| `--card-shadow-hover` | `3px 3px 0px` | Hover shadow in primary gold |

### Typography

- **Body**: `JetBrains Mono` (monospace) — the hacker/dev aesthetic
- **Brand / empty states**: `Press Start 2P` (pixel font) — the 8-bit accent
- These two fonts are intentional. Do not replace them or add others.

### Visual rules

- **Shadows**: Always hard-offset (`2px 2px 0px`) with zero blur. Never use `shadow-sm`, `shadow-md` etc. — they look too modern.
- **Corners**: `rounded-sm` everywhere. Sharp, not rounded.
- **Borders**: Default card borders use `--border-subtle`. `--border` is for strong emphasis (editor, login card). Hover borders use `--primary`.
- **Animations**: Crisp and fast (150ms `ease-out`). No spring physics, no bounce. The retro feel comes from snappy transitions.
- **Background texture**: A subtle 4px pixel grid overlay at 3% opacity (defined in `body::before`).
- **Checkboxes**: Use `accent-color: var(--primary)` globally — gold checkboxes match the theme.
- **Icons**: Lucide icons throughout. Keep at 16-20px size.
- **Hover actions**: Never use `hidden group-hover:block` for action buttons — they're invisible on mobile (no hover). Use the opacity pattern instead: `max-md:opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100`. This keeps actions always visible on touch devices and hover-revealed on desktop.
- **Charts**: Pure SVG, no chart libraries. Style charts to match the retro parchment theme.

### Layout groups

- `(auth)` — Login/setup pages: minimal centered layout, no app chrome
- `(app)` — Main app: header, sidebar, footer, toast notifications

## Domain model

### Money handling

- **Amounts**: Stored as integers in cents (e.g. 47.50 EUR = `4750`). All arithmetic operates on cents.
- **Exchange rates**: Stored as text (decimal strings like `"1.08"`) to avoid IEEE 754 floating-point issues. Parsed to number only for computation.
- **Dashboard figures**: Always displayed in the trip's home currency.

### Categories (fixed)

Six expense categories, defined in `src/lib/types/categories.ts`:
- Food & Drinks, Accommodation, Transport, Activities, Shopping, Misc

### Entities

- **Trip**: name, destination, dates, people count, optional budget, home currency
- **Expense**: amount, currency, exchange rate, category, date, note — belongs to a trip
- **TripCurrency**: manual exchange rate per currency per trip

## Project structure

```
src/
  routes/
    +layout.svelte     # Root layout (imports CSS only)
    (auth)/            # Layout group: login/setup (minimal, no app chrome)
      +layout.svelte   # Centered parchment background
      login/           # Login page
      setup/           # First-time admin setup
    (app)/             # Layout group: main app (header, sidebar, footer)
      +layout.svelte   # App shell with Header, Sidebar, Toast
      +page.svelte     # Trip list (home)
      trips/
        new/           # Create trip
        [id]/
          +page.svelte       # Trip dashboard (budget gauge, stats, charts)
          edit/               # Edit trip
          expenses/
            +page.svelte     # Expense list for trip
            new/             # Quick expense entry
            [expenseId]/     # Edit expense
      settings/        # Settings (preferences, profile, users, about)
    api/auth/          # Login, logout, setup endpoints
    api/admin/users/   # Admin user management
    api/trips/         # Trip CRUD
    api/trips/[id]/expenses/  # Expense CRUD
    api/trips/[id]/currencies/ # Exchange rate management
    api/preferences/   # User preferences
    api/sync/          # Offline sync (push/pull)
  lib/
    components/        # Svelte components
      Layout/          # Header, Sidebar, Toast
    stores/            # Svelte stores (trips.ts, expenses.ts, toast.ts, preferences.svelte.ts)
    server/db/         # Drizzle schema + connection (schema.ts, index.ts)
    server/            # Auth logic, trip/expense services
    sync/              # Client sync (idb.ts), CRDT merge (crdt.ts), server sync
    types/             # TypeScript interfaces (Trip, Expense, TripCurrency, etc.)
    utils/             # Currency formatting, date helpers, number formatting
  hooks.server.ts      # Auth middleware (redirects unauthenticated users)
tests/
  e2e/                 # Playwright e2e tests (Gherkin-style)
```

## Commands

A `Makefile` wraps all common tasks for tool-agnostic usage. Run `make help` to list targets.

| Make target | pnpm equivalent | Description |
|---|---|---|
| `make dev` | `pnpm dev` | Start dev server |
| `make build` | `pnpm build` | Production build |
| `make preview` | `pnpm preview` | Preview production build |
| `make check` | `pnpm check` | Svelte type checking |
| `make test` | `pnpm test` | Run all tests (unit + e2e) |
| `make test-unit` | `pnpm test:unit` | Run unit tests only |
| `make test-e2e` | `pnpm test:e2e` | Run e2e tests only |
| `make lint` | `pnpm lint` | Run linter |
| `make db-push` | `pnpm db:push` | Push schema to DB |
| `make db-generate` | `pnpm db:generate` | Generate migrations |
| `make db-migrate` | `pnpm db:migrate` | Run migrations |
| `make db-studio` | `pnpm db:studio` | Open Drizzle Studio |
| `make install` | `pnpm install` | Install dependencies |
| `make docker-build` | — | Build Docker image |
| `make docker-up` | — | Start containers |
| `make docker-down` | — | Stop containers |
| `make docker-logs` | — | Tail container logs |
| `make clean` | — | Remove build artifacts + test DBs |

## Git conventions

- **Conventional commits**: Use `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:` prefixes
- **Commit regularly**: Bundle related changes into logical commits after each step or feature slice — don't accumulate a large diff
- **Main branch**: `main` — use as base for all PRs and feature branches
- **Feature branches**: Use `feat/<name>` branches with worktrees for isolation
- **Rebase before PR**: Always `git rebase origin/main` (not merge) before pushing or creating a PR to keep a clean linear history and avoid merge conflicts in the PR

## CI/CD

GitHub Actions with two workflows:

**CI** (`.github/workflows/ci.yml`) — runs on push to `main`/`claude/**` and PRs to `main`:
1. **Lint & Type Check** — `pnpm check`
2. **Unit Tests** — `pnpm test:unit`
3. **Build** — `pnpm build` (depends on steps 1+2)
4. **E2E Tests** — Playwright with Chromium (depends on step 3, uploads report on failure)
5. **Docker Build** — validates the Docker image builds (depends on step 3)

**Docker**: Multi-stage Dockerfile (node:22-slim), exposes port 3000, persists data to `/data` volume.

## Testing philosophy: BDD/TDD

Write tests first or alongside features. Tests serve as living documentation of expected behavior.

### Unit tests (Vitest)

- Location: `src/**/*.test.ts`
- Config: `vitest.config.ts` (node environment)
- Cover pure logic: currency conversion, date helpers, auth, sync, CRDT merge

### E2E tests (Playwright)

- Location: `tests/e2e/*.spec.ts`
- Config: `playwright.config.ts` (Chromium only, builds + previews app on port 4173)
- Test database: `./data/test-42.db` (cleaned via `global-setup.ts`)
- Auth tests use `test.describe.serial` because they depend on sequential database state

### Gherkin-style Given/When/Then

E2E tests follow Cucumber BDD conventions via comments. Follow the [Better Gherkin](https://cucumber.io/docs/bdd/better-gherkin) guidelines:

**Declarative, not imperative** — describe *what* the system does, not *how* the user interacts with the UI:
```
// Good: "When the user adds a 25 EUR food expense"
// Bad:  "When the user clicks the add button and types 25 in the amount field"
```

**Given describes state, not navigation:**
```
// Good: "Given a trip 'Paris 2025' with a 1000 EUR budget exists"
// Bad:  "Given the user clicks new trip and fills in the name"
```

**Collapse multi-step UI actions into a single intent:**
```
// Good: "When the user creates a trip to Paris with a 1000 EUR budget"
// Bad:  "When they fill in the name / And set the dates / And enter the budget / And click save"
```

**Scenario names describe outcomes/behavior, not actions:**
```
// Good: "Scenario: Dashboard shows projected overspend warning"
// Bad:  "Scenario: User views the dashboard after adding expenses"
```

**Resilience test** — ask: *"Will this comment need to change if the UI implementation changes?"* If yes, rewrite it to remove implementation details. The Playwright code underneath handles the *how*; the comments describe the *what*.

## Sibling app reference

42 mirrors the architecture of **Crumbs** (`/Users/frederic/Private/crumbs`). When in doubt about conventions, patterns, or code style, refer to the Crumbs codebase as the canonical reference.
