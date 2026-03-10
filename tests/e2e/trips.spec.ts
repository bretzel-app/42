import { test, expect, createTrip, tripCard } from './helpers/fixtures.js';

test.describe('Trip management', () => {
	test('Scenario: User creates a new trip', async ({ authenticatedPage: page }) => {
		// Given the user is on the trip list
		// When they create a trip to Paris with a 1000 EUR budget
		await createTrip(page, { name: 'Paris 2025', destination: 'Paris, France', budget: '1000' });

		// Then the trip dashboard is displayed
		await expect(page.getByText('Paris 2025')).toBeVisible();
	});

	test('Scenario: Trip appears in the trip list', async ({ authenticatedPage: page }) => {
		// Given a trip "Tokyo 2025" exists
		await createTrip(page, { name: 'Tokyo 2025', destination: 'Tokyo, Japan' });

		// When the user navigates to the trip list
		await page.goto('/');

		// Then the trip card is visible
		await expect(tripCard(page, 'Tokyo 2025')).toBeVisible();
	});

	test('Scenario: User edits a trip', async ({ authenticatedPage: page }) => {
		// Given a trip "Rome 2025" exists
		await createTrip(page, { name: 'Rome 2025', destination: 'Rome, Italy' });

		// When the user edits the trip name
		await page.getByTestId('edit-trip-btn').click();
		await page.waitForURL(/\/edit/);
		await page.getByTestId('trip-name-input').fill('Rome Summer 2025');
		await page.getByTestId('trip-save-btn').click();

		// Then the updated name is displayed
		await expect(page.getByText('Rome Summer 2025')).toBeVisible();
	});

	test('Scenario: User deletes a trip', async ({ authenticatedPage: page }) => {
		// Given a trip "Delete Me" exists
		await createTrip(page, { name: 'Delete Me' });

		// When the user deletes the trip
		await page.getByTestId('edit-trip-btn').click();
		await page.waitForURL(/\/edit/);
		await page.getByText('Delete trip').click();
		await page.getByTestId('confirm-delete-btn').click();

		// Then the trip list no longer contains it
		await page.waitForURL('/');
		await expect(tripCard(page, 'Delete Me')).not.toBeVisible();
	});
});
