import { test, expect, createTrip } from './helpers/fixtures.js';

test.describe('Manual coordinate entry', () => {
	test('Scenario: User attaches coordinates to an expense by entering them manually', async ({
		authenticatedPage: page
	}) => {
		// Given a trip exists
		await createTrip(page, { name: 'Coords Trip', destination: 'Paris' });

		// When the user adds an expense and enters Notre-Dame coordinates manually
		await page.getByTestId('add-expense-btn').click();
		await page.waitForURL(/\/expenses\/new/);
		await page.getByTestId('expense-amount-input').fill('10');
		await page.getByTestId('category-food').click();
		await page.getByTestId('expense-note-input').fill('Baguette near Notre-Dame');
		await page.getByTestId('location-manual').click();
		await page.getByTestId('location-lat-input').fill('48.8530');
		await page.getByTestId('location-lng-input').fill('2.3499');
		await page.getByTestId('location-save').click();

		// Then the coordinates are displayed on the form before submission
		await expect(page.getByText('48.85300, 2.34990')).toBeVisible();

		// And the expense saves with those coordinates, visible on the expenses list
		await page.getByTestId('expense-save-btn').click();
		await page.waitForURL(/\/trips\/[^/]+\/expenses$/);
		await expect(
			page
				.getByTestId('expense-row')
				.filter({ hasText: 'Baguette near Notre-Dame' })
				.getByRole('link', { name: 'Map' })
		).toBeVisible();
	});

	test('Scenario: User edits coordinates on an existing expense', async ({
		authenticatedPage: page
	}) => {
		// Given a trip with an expense that has manually entered coordinates
		await createTrip(page, { name: 'Edit Coords Trip' });
		await page.getByTestId('add-expense-btn').click();
		await page.waitForURL(/\/expenses\/new/);
		await page.getByTestId('expense-amount-input').fill('5');
		await page.getByTestId('category-food').click();
		await page.getByTestId('expense-note-input').fill('Coffee');
		await page.getByTestId('location-manual').click();
		await page.getByTestId('location-lat-input').fill('48.85');
		await page.getByTestId('location-lng-input').fill('2.35');
		await page.getByTestId('location-save').click();
		await page.getByTestId('expense-save-btn').click();
		await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

		// When the user opens the expense and changes the coordinates
		await page
			.getByTestId('expense-row')
			.filter({ hasText: 'Coffee' })
			.locator('a[href*="/expenses/"]')
			.click();
		await page.waitForURL(/\/expenses\/[^/]+$/);
		await expect(page.getByText('48.85000, 2.35000')).toBeVisible();
		await page.getByTestId('location-edit').click();
		await page.getByTestId('location-lat-input').fill('51.5074');
		await page.getByTestId('location-lng-input').fill('-0.1278');
		await page.getByTestId('location-save').click();

		// Then the new coordinates replace the old ones
		await expect(page.getByText('51.50740, -0.12780')).toBeVisible();
	});

	test('Scenario: Leaving one coordinate blank is rejected, leaving both blank clears the location', async ({
		authenticatedPage: page
	}) => {
		// Given a trip exists
		await createTrip(page, { name: 'Validation Trip' });
		await page.getByTestId('add-expense-btn').click();
		await page.waitForURL(/\/expenses\/new/);
		await page.getByTestId('expense-amount-input').fill('5');
		await page.getByTestId('category-food').click();
		await page.getByTestId('location-manual').click();

		// When only the latitude is filled
		await page.getByTestId('location-lat-input').fill('48.85');
		await page.getByTestId('location-save').click();

		// Then an error asks for both values and no coordinates are stored
		await expect(page.getByText(/Enter both latitude and longitude/i)).toBeVisible();

		// When an out-of-range latitude is entered
		await page.getByTestId('location-lat-input').fill('200');
		await page.getByTestId('location-lng-input').fill('2.35');
		await page.getByTestId('location-save').click();

		// Then an error about valid ranges is shown
		await expect(page.getByText(/Enter a valid lat/i)).toBeVisible();

		// When the user enters valid coordinates and saves
		await page.getByTestId('location-lat-input').fill('48.85');
		await page.getByTestId('location-lng-input').fill('2.35');
		await page.getByTestId('location-save').click();
		await expect(page.getByText('48.85000, 2.35000')).toBeVisible();

		// And when the user re-enters the editor and blanks both inputs
		await page.getByTestId('location-edit').click();
		await page.getByTestId('location-lat-input').fill('');
		await page.getByTestId('location-lng-input').fill('');
		await page.getByTestId('location-save').click();

		// Then the location is cleared back to the empty state
		await expect(page.getByTestId('location-manual')).toBeVisible();
	});
});
