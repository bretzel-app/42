import { test, expect, createTrip } from './helpers/fixtures.js';

test.describe('Manual coordinate entry', () => {
	test('Scenario: User attaches coordinates to an expense by entering them manually', async ({
		authenticatedPage: page
	}) => {
		// Given a trip exists
		await createTrip(page, { name: 'Coords Trip', destination: 'Paris' });

		// When the user adds an expense and enters Notre-Dame coordinates as "lat,lng"
		await page.getByTestId('add-expense-btn').click();
		await page.waitForURL(/\/expenses\/new/);
		await page.getByTestId('expense-amount-input').fill('10');
		await page.getByTestId('category-food').click();
		await page.getByTestId('expense-note-input').fill('Baguette near Notre-Dame');
		await page.getByTestId('location-manual').click();
		await page.getByTestId('location-input').fill('48.8530,2.3499');
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

	test('Scenario: Edits to coordinates on an existing expense persist after saving', async ({
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
		await page.getByTestId('location-input').fill('48.85, 2.35');
		await page.getByTestId('location-save').click();
		await page.getByTestId('expense-save-btn').click();
		await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

		// When the user opens the expense, changes the coordinates, and saves the form
		await page
			.getByTestId('expense-row')
			.filter({ hasText: 'Coffee' })
			.locator('a[href*="/expenses/"]')
			.click();
		await page.waitForURL(/\/expenses\/[^/]+$/);
		await expect(page.getByText('48.85000, 2.35000')).toBeVisible();
		await page.getByTestId('location-edit').click();
		await page.getByTestId('location-input').fill('38.141677,13.082806');
		await page.getByTestId('location-save').click();
		await expect(page.getByText('38.14168, 13.08281')).toBeVisible();
		await page.getByTestId('expense-save-btn').click();
		await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

		// Then reopening the expense shows the new coordinates — the edit was persisted
		await page
			.getByTestId('expense-row')
			.filter({ hasText: 'Coffee' })
			.locator('a[href*="/expenses/"]')
			.click();
		await page.waitForURL(/\/expenses\/[^/]+$/);
		await expect(page.getByText('38.14168, 13.08281')).toBeVisible();
		await expect(page.getByText('48.85000, 2.35000')).not.toBeVisible();
	});

	test('Scenario: Malformed input is rejected and blank input clears the location', async ({
		authenticatedPage: page
	}) => {
		// Given a trip exists
		await createTrip(page, { name: 'Validation Trip' });
		await page.getByTestId('add-expense-btn').click();
		await page.waitForURL(/\/expenses\/new/);
		await page.getByTestId('expense-amount-input').fill('5');
		await page.getByTestId('category-food').click();
		await page.getByTestId('location-manual').click();

		// When the input is missing the comma separator
		await page.getByTestId('location-input').fill('48.85');
		await page.getByTestId('location-save').click();

		// Then a format error is shown and no coordinates are stored
		await expect(page.getByText(/Enter coordinates as/i)).toBeVisible();

		// When an out-of-range latitude is entered
		await page.getByTestId('location-input').fill('200,2.35');
		await page.getByTestId('location-save').click();

		// Then an error about valid ranges is shown
		await expect(page.getByText(/Enter a valid lat/i)).toBeVisible();

		// When the user enters valid coordinates and saves
		await page.getByTestId('location-input').fill('48.85, 2.35');
		await page.getByTestId('location-save').click();
		await expect(page.getByText('48.85000, 2.35000')).toBeVisible();

		// And when the user re-enters the editor and blanks the input
		await page.getByTestId('location-edit').click();
		await page.getByTestId('location-input').fill('');
		await page.getByTestId('location-save').click();

		// Then the location is cleared back to the empty state
		await expect(page.getByTestId('location-manual')).toBeVisible();
	});
});
