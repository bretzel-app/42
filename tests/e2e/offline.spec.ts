import { test, expect, createTrip, addExpense } from './helpers/fixtures.js';

/**
 * Simulate offline by aborting all API requests.
 * Pages/JS/CSS still load from the test server (no service worker in e2e),
 * but fetch() calls to /api/* are blocked — exercising IDB-first code paths.
 */
async function goOffline(page: import('@playwright/test').Page) {
	await page.route('**/api/**', (route) => route.abort('connectionrefused'));
}

async function goOnline(page: import('@playwright/test').Page) {
	await page.unrouteAll({ behavior: 'ignoreErrors' });
}

test.describe('Offline mode', () => {
	test('Scenario: Trip list renders from local data when offline', async ({ authenticatedPage: page }) => {
		// Given a trip "Offline Trip" was created while online
		await createTrip(page, { name: 'Offline Trip', destination: 'Mountains' });
		await page.goto('/');
		await expect(page.getByText('Offline Trip')).toBeVisible();

		// When the network goes down and the page is reloaded
		await goOffline(page);
		await page.goto('/');

		// Then the trip list still renders from local data
		await expect(page.getByText('Offline Trip')).toBeVisible();

		await goOnline(page);
	});

	test('Scenario: Edit trip form is populated from local data when offline', async ({ authenticatedPage: page }) => {
		// Given a trip "Edit Offline" exists with a destination
		await createTrip(page, { name: 'Edit Offline', destination: 'Barcelona' });

		// When the network goes down and the user navigates to the edit page
		await goOffline(page);
		await page.getByTestId('edit-trip-btn').click();
		await page.waitForURL(/\/edit/);

		// Then the form is populated with the trip data from local storage
		await expect(page.getByTestId('trip-name-input')).toHaveValue('Edit Offline');

		await goOnline(page);
	});

	test('Scenario: User can save trip edits while offline', async ({ authenticatedPage: page }) => {
		// Given a trip "Save Offline" exists
		await createTrip(page, { name: 'Save Offline', destination: 'Lisbon' });

		// When the network goes down and the user edits the trip
		await goOffline(page);
		await page.getByTestId('edit-trip-btn').click();
		await page.waitForURL(/\/edit/);
		await page.getByTestId('trip-name-input').fill('Save Offline Updated');
		await page.getByTestId('trip-save-btn').click();

		// Then the user is redirected to the dashboard with the updated name
		await page.waitForURL(/\/trips\/[^/]+$/);
		await expect(page.getByText('Save Offline Updated')).toBeVisible();

		// And the trip list shows the updated name
		await page.goto('/');
		await expect(page.getByText('Save Offline Updated')).toBeVisible();

		await goOnline(page);
	});

	test('Scenario: New expense form has correct currency when offline', async ({ authenticatedPage: page }) => {
		// Given a trip exists (home currency defaults to EUR)
		await createTrip(page, { name: 'Expense Offline' });

		// When the network goes down and the user navigates to add an expense
		await goOffline(page);
		await page.getByTestId('add-expense-btn').click();
		await page.waitForURL(/\/expenses\/new/);

		// Then the currency selector defaults to the trip's home currency
		await expect(page.getByTestId('expense-currency-select')).toHaveValue('EUR');

		await goOnline(page);
	});

	test('Scenario: Expense list renders from local data when offline', async ({ authenticatedPage: page }) => {
		// Given a trip with an expense exists
		await createTrip(page, { name: 'List Offline' });
		await addExpense(page, { amount: '42', category: 'food', note: 'Offline pizza' });

		// When the network goes down and the user views the expense list
		await goOffline(page);
		await page.goto(page.url()); // reload current page

		// Then the expense is still visible from local data
		await expect(page.getByText('Offline pizza')).toBeVisible();

		await goOnline(page);
	});
});
