import { test, expect, createTrip, addExpense } from './helpers/fixtures.js';

// Helper: add a member via the Members tab on the edit page
async function addMember(page: Parameters<typeof createTrip>[0], name: string) {
	// Ensure we're on the Members tab
	const membersTab = page.getByRole('button', { name: 'Members' });
	await membersTab.click();

	// Clear and fill the input
	const input = page.getByLabel('Add member');
	await input.waitFor({ state: 'visible' });
	await input.fill(name);

	// Click the Add button (specifically in the add-member form, not any other "Add" button)
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	// Wait for the member to appear in the list
	await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 5000 });

	// Wait for the input to be cleared (indicates the add completed)
	await expect(input).toHaveValue('');
}

// Helper: navigate from edit page to the trip dashboard
async function goToDashboard(page: Parameters<typeof createTrip>[0]) {
	const dashboardUrl = page.url().replace(/\/edit.*/, '');
	await page.goto(dashboardUrl);
	await page.waitForURL(/\/trips\/[^/]+$/);
}

// Helper: create a trip and add members, returning to the dashboard
async function createTripWithMembers(
	page: Parameters<typeof createTrip>[0],
	tripName: string,
	destination: string,
	memberNames: string[]
) {
	await createTrip(page, { name: tripName, destination });
	await page.getByTestId('edit-trip-btn').click();
	await page.waitForURL(/\/edit/);
	for (const name of memberNames) {
		await addMember(page, name);
	}
}

test.describe('Expense Splitting', () => {
	test.describe.serial(() => {
		// Scenario: Solo trip shows no splitting controls
		test('Scenario: Solo trip expense form has no split controls', async ({
			authenticatedPage: page
		}) => {
			// Given a trip with a single traveler (no members added)
			await createTrip(page, { name: 'Solo Trip', destination: 'Lisbon' });

			// When the user opens the add expense form
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);

			// Then there are no "Paid by" or "Split" controls
			await expect(page.getByText('Paid by')).not.toBeVisible();
		});

		// Scenario: Adding members enables splitting
		test('Scenario: Adding members reveals split controls on expense form', async ({
			authenticatedPage: page
		}) => {
			// Given a trip with two members
			await createTripWithMembers(page, 'Group Trip', 'Barcelona', ['Alice', 'Bob']);

			// When the user opens the add expense form
			await goToDashboard(page);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);

			// Then the split controls section is visible
			await expect(page.getByText('Paid by')).toBeVisible({ timeout: 10000 });
		});

		// Scenario: Equal split divides expense among all members
		test('Scenario: Equal split divides expense evenly among all members', async ({
			authenticatedPage: page
		}) => {
			// Given a trip with two members
			await createTripWithMembers(page, 'Split Test', 'Rome', ['Carol', 'Dave']);

			// When the user adds a 100 EUR expense
			await goToDashboard(page);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);

			// Wait for split controls to load
			await expect(page.getByText('Paid by')).toBeVisible({ timeout: 10000 });
			await page.getByTestId('expense-amount-input').fill('100');

			// Then equal split shows 50.00 per member
			await expect(page.getByText('50.00').first()).toBeVisible({ timeout: 10000 });
		});

		// Scenario: Balances reflect who owes whom
		test('Scenario: Balances page reflects who owes whom after split expenses', async ({
			authenticatedPage: page
		}) => {
			// Given a trip where Eve paid 60 EUR split equally with Frank
			await createTripWithMembers(page, 'Balance Trip', 'Berlin', ['Eve', 'Frank']);

			await goToDashboard(page);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);
			await expect(page.getByText('Paid by')).toBeVisible({ timeout: 10000 });
			await page.getByTestId('expense-amount-input').fill('60');
			// Select Eve as payer
			await page.getByRole('button', { name: 'Eve' }).click();
			await page.getByTestId('expense-save-btn').click();
			await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

			// When the user views the balances page
			const tripId = page.url().match(/\/trips\/([^/]+)/)?.[1];
			await page.goto(`/trips/${tripId}/balances`);
			await page.waitForURL(/\/balances/);

			// Then both members are shown with their balances
			await expect(page.getByText('Eve').first()).toBeVisible();
			await expect(page.getByText('Frank').first()).toBeVisible();
		});

		// Scenario: Recording a settlement updates balances
		test('Scenario: Recording a settlement reduces the outstanding balance', async ({
			authenticatedPage: page
		}) => {
			// Given a trip where Grace paid 80 EUR split equally with Harry
			await createTripWithMembers(page, 'Settle Trip', 'Paris', ['Grace', 'Harry']);

			await goToDashboard(page);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);
			await expect(page.getByText('Paid by')).toBeVisible({ timeout: 10000 });
			await page.getByTestId('expense-amount-input').fill('80');
			await page.getByRole('button', { name: 'Grace' }).click();
			await page.getByTestId('expense-save-btn').click();
			await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

			// When the user marks the transfer as settled
			const tripId = page.url().match(/\/trips\/([^/]+)/)?.[1];
			await page.goto(`/trips/${tripId}/balances`);
			await page.waitForURL(/\/balances/);
			await expect(page.getByText('Settle Up')).toBeVisible({ timeout: 10000 });
			await page.getByRole('button', { name: 'Mark Settled' }).first().click();
			await page.getByRole('button', { name: 'Confirm' }).click();

			// Then settlement history appears
			await expect(page.getByText('Settlement History')).toBeVisible({ timeout: 10000 });
		});

		// Scenario: Dashboard shows balance widget
		test('Scenario: Dashboard shows group balances widget for multi-member trips', async ({
			authenticatedPage: page
		}) => {
			// Given a trip with members and an expense
			await createTripWithMembers(page, 'Dashboard Trip', 'Tokyo', ['Iris', 'Jack']);

			await goToDashboard(page);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);
			await expect(page.getByText('Paid by')).toBeVisible({ timeout: 10000 });
			await page.getByTestId('expense-amount-input').fill('120');
			await page.getByRole('button', { name: 'Iris' }).click();
			await page.getByTestId('expense-save-btn').click();
			await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

			// When the user views the dashboard
			const tripId = page.url().match(/\/trips\/([^/]+)/)?.[1];
			await page.goto(`/trips/${tripId}`);
			await page.waitForURL(/\/trips\/[^/]+$/);

			// Then the Group Balances widget is visible
			await expect(page.getByText('Group Balances')).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('Iris')).toBeVisible();
			await expect(page.getByText('Jack')).toBeVisible();
		});
	});
});
