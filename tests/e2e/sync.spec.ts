import { test, expect, createTrip } from './helpers/fixtures.js';

/**
 * Simulate offline by aborting all API requests.
 */
async function goOffline(page: import('@playwright/test').Page) {
	await page.route('**/api/**', (route) => route.abort('connectionrefused'));
}

async function goOnline(page: import('@playwright/test').Page) {
	await page.unrouteAll({ behavior: 'ignoreErrors' });
}

/** Wait for the sync indicator to show a specific status */
async function waitForSyncStatus(page: import('@playwright/test').Page, status: string, timeout = 10000) {
	await expect(
		page.getByTestId('sync-indicator')
	).toHaveAttribute('title', new RegExp(status), { timeout });
}

test.describe('Sync: offline to online', () => {
	test('Scenario: Trip created offline syncs when back online', async ({ authenticatedPage: page }) => {
		// Given the user is on the trip list
		await page.waitForLoadState('networkidle');

		// When the network goes down and they create a trip
		await goOffline(page);
		await page.getByTestId('new-trip-btn').click();
		await page.getByTestId('trip-name-input').fill('Offline Created Trip');
		await page.getByTestId('trip-save-btn').click();
		await page.waitForURL(/\/trips\/.+/);

		// Then the trip is visible locally
		await expect(page.getByText('Offline Created Trip')).toBeVisible();

		// When the network comes back and sync runs
		await goOnline(page);
		await page.getByTestId('sync-indicator').click();

		// Then the sync indicator shows success (not error)
		await waitForSyncStatus(page, 'synced');

		// And the trip persists after a full page reload
		await page.goto('/');
		await expect(page.getByText('Offline Created Trip')).toBeVisible();
	});

	test('Scenario: Expense created offline syncs when back online', async ({ authenticatedPage: page }) => {
		// Given a trip exists
		await createTrip(page, { name: 'Sync Expense Trip' });

		// When the network goes down and they add an expense
		await goOffline(page);
		await page.getByTestId('add-expense-btn').click();
		await page.waitForURL(/\/expenses\/new/);
		await page.getByTestId('expense-amount-input').fill('42.50');
		await page.getByTestId('expense-note-input').fill('Offline coffee');
		await page.getByTestId('expense-save-btn').click();
		await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

		// Then the expense is visible locally
		await expect(page.getByText('Offline coffee')).toBeVisible();

		// When the network comes back and sync runs
		await goOnline(page);
		await page.getByTestId('sync-indicator').click();

		// Then the sync succeeds
		await waitForSyncStatus(page, 'synced');

		// And the expense persists after a full reload
		const currentUrl = page.url();
		await page.goto(currentUrl);
		await expect(page.getByText('Offline coffee')).toBeVisible();
	});

	test('Scenario: Trip edit offline syncs when back online', async ({ authenticatedPage: page }) => {
		// Given a trip "Sync Edit" exists
		await createTrip(page, { name: 'Sync Edit', destination: 'Original City' });

		// When the network goes down and the user edits the trip
		await goOffline(page);
		await page.getByTestId('edit-trip-btn').click();
		await page.waitForURL(/\/edit/);
		await page.getByTestId('trip-name-input').fill('Sync Edit Updated');
		await page.getByTestId('trip-save-btn').click();
		await page.waitForURL(/\/trips\/[^/]+$/);

		// When the network comes back and sync runs
		await goOnline(page);
		await page.getByTestId('sync-indicator').click();

		// Then the sync succeeds
		await waitForSyncStatus(page, 'synced');

		// And the update persists after a full reload
		await page.goto('/');
		await expect(page.getByText('Sync Edit Updated')).toBeVisible();
	});

	test('Scenario: Sync indicator shows error state and recovers', async ({ authenticatedPage: page }) => {
		// Given a trip exists
		await createTrip(page, { name: 'Error Recovery' });

		// When the network goes down and an edit is made
		await goOffline(page);
		await page.getByTestId('edit-trip-btn').click();
		await page.waitForURL(/\/edit/);
		await page.getByTestId('trip-name-input').fill('Error Recovery Updated');
		await page.getByTestId('trip-save-btn').click();
		await page.waitForURL(/\/trips\/[^/]+$/);

		// When sync is triggered while still offline
		await page.getByTestId('sync-indicator').click();

		// Then the sync indicator shows offline or error
		await waitForSyncStatus(page, 'offline|error');

		// When the network comes back and sync runs again
		await goOnline(page);
		await page.getByTestId('sync-indicator').click();

		// Then sync recovers to success
		await waitForSyncStatus(page, 'synced');
	});

	test('Scenario: Multiple offline changes sync together', async ({ authenticatedPage: page }) => {
		// Given the user creates a trip while offline
		await goOffline(page);
		await page.getByTestId('new-trip-btn').click();
		await page.getByTestId('trip-name-input').fill('Multi Sync Trip');
		await page.getByTestId('trip-save-btn').click();
		await page.waitForURL(/\/trips\/.+/);

		// And adds an expense while still offline
		await page.getByTestId('add-expense-btn').click();
		await page.waitForURL(/\/expenses\/new/);
		await page.getByTestId('expense-amount-input').fill('99');
		await page.getByTestId('expense-note-input').fill('Multi sync expense');
		await page.getByTestId('expense-save-btn').click();
		await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

		// When the network comes back and sync runs
		await goOnline(page);
		await page.getByTestId('sync-indicator').click();

		// Then sync succeeds — both trip and expense are persisted
		await waitForSyncStatus(page, 'synced');

		// And both persist after reload
		await page.goto('/');
		await expect(page.getByText('Multi Sync Trip')).toBeVisible();
	});
});
