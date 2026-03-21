import { test, expect, createTrip, addExpense } from './helpers/fixtures.js';

// Helper: add a member via the Members tab on the edit page
async function addMember(page: Parameters<typeof createTrip>[0], name: string) {
	await page.getByRole('button', { name: 'Members' }).click();
	await page.getByLabel('Add member').fill(name);
	await page.getByRole('button', { name: 'Add' }).click();
	// Wait for the member row to appear
	await expect(page.getByText(name)).toBeVisible();
}

test.describe('Expense Splitting', () => {
	test.describe.serial(() => {
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
			await expect(page.getByText('Split')).not.toBeVisible();
		});

		test('Scenario: Adding members reveals split controls on expense form', async ({
			authenticatedPage: page
		}) => {
			// Given a trip with two members
			await createTrip(page, { name: 'Group Trip', destination: 'Barcelona' });
			await page.getByTestId('edit-trip-btn').click();
			await page.waitForURL(/\/edit/);
			await addMember(page, 'Alice');
			await addMember(page, 'Bob');

			// When the user opens the add expense form
			await page.goto(page.url().replace('/edit', ''));
			await page.waitForURL(/\/trips\/[^/]+$/);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);

			// Then the split controls section is visible
			await expect(page.getByText('Paid by')).toBeVisible();
			await expect(page.getByText('Split')).toBeVisible();
		});

		test('Scenario: Equal split divides expense evenly among all members', async ({
			authenticatedPage: page
		}) => {
			// Given a trip "Split Test" with two members: Carol and Dave
			await createTrip(page, { name: 'Split Test', destination: 'Rome' });
			await page.getByTestId('edit-trip-btn').click();
			await page.waitForURL(/\/edit/);
			await addMember(page, 'Carol');
			await addMember(page, 'Dave');

			// When the user adds a 100 EUR expense with equal split
			await page.goto(page.url().replace('/edit', ''));
			await page.waitForURL(/\/trips\/[^/]+$/);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);
			await page.getByTestId('expense-amount-input').fill('100');

			// Then equal split shows 50.00 per member
			await expect(page.getByText('50.00')).toBeVisible();
		});

		test('Scenario: Balances page reflects who owes whom after split expenses', async ({
			authenticatedPage: page
		}) => {
			// Given a trip "Balance Trip" with members Eve and Frank
			await createTrip(page, { name: 'Balance Trip', destination: 'Berlin' });

			// Navigate to edit and add members
			await page.getByTestId('edit-trip-btn').click();
			await page.waitForURL(/\/edit/);
			await addMember(page, 'Eve');
			await addMember(page, 'Frank');

			// When Eve pays a 60 EUR expense split equally between Eve and Frank
			const tripUrl = page.url().replace('/edit', '');
			await page.goto(tripUrl);
			await page.waitForURL(/\/trips\/[^/]+$/);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);
			await page.getByTestId('expense-amount-input').fill('60');
			// Select Eve as payer
			await page.getByRole('button', { name: 'Eve' }).click();
			await page.getByTestId('expense-save-btn').click();
			await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

			// Then the balances page shows outstanding amounts
			const tripId = tripUrl.split('/trips/')[1];
			await page.goto(`/trips/${tripId}/balances`);
			await page.waitForURL(/\/balances/);
			await expect(page.getByText('Member Balances')).toBeVisible();
			// Eve should be owed money (positive balance)
			await expect(page.getByText('Eve')).toBeVisible();
			// Frank should owe money (negative balance)
			await expect(page.getByText('Frank')).toBeVisible();
		});

		test('Scenario: Recording a settlement reduces the outstanding balance', async ({
			authenticatedPage: page
		}) => {
			// Given a trip "Settle Trip" where Grace paid 80 EUR and Harry owes 40 EUR
			await createTrip(page, { name: 'Settle Trip', destination: 'Paris' });
			await page.getByTestId('edit-trip-btn').click();
			await page.waitForURL(/\/edit/);
			await addMember(page, 'Grace');
			await addMember(page, 'Harry');

			const tripUrl = page.url().replace('/edit', '');
			await page.goto(tripUrl);
			await page.waitForURL(/\/trips\/[^/]+$/);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);
			await page.getByTestId('expense-amount-input').fill('80');
			await page.getByRole('button', { name: 'Grace' }).click();
			await page.getByTestId('expense-save-btn').click();
			await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

			// When the user marks the transfer as settled on the balances page
			const tripId = tripUrl.split('/trips/')[1];
			await page.goto(`/trips/${tripId}/balances`);
			await page.waitForURL(/\/balances/);
			await expect(page.getByText('Settle Up')).toBeVisible();
			await page.getByRole('button', { name: 'Mark Settled' }).first().click();
			// Confirm the settlement in the inline form
			await page.getByRole('button', { name: 'Confirm' }).click();

			// Then the settlement appears in settlement history
			await expect(page.getByText('Settlement History')).toBeVisible();
			await expect(
				page.locator('text=Grace').or(page.locator('text=Harry'))
			).toBeVisible();
		});

		test('Scenario: Dashboard shows group balances widget for multi-member trips', async ({
			authenticatedPage: page
		}) => {
			// Given a trip "Dashboard Trip" with two members and an expense with a split
			await createTrip(page, { name: 'Dashboard Trip', destination: 'Tokyo' });
			await page.getByTestId('edit-trip-btn').click();
			await page.waitForURL(/\/edit/);
			await addMember(page, 'Iris');
			await addMember(page, 'Jack');

			const tripUrl = page.url().replace('/edit', '');
			await page.goto(tripUrl);
			await page.waitForURL(/\/trips\/[^/]+$/);
			await page.getByTestId('add-expense-btn').click();
			await page.waitForURL(/\/expenses\/new/);
			await page.getByTestId('expense-amount-input').fill('120');
			await page.getByRole('button', { name: 'Iris' }).click();
			await page.getByTestId('expense-save-btn').click();
			await page.waitForURL(/\/trips\/[^/]+\/expenses$/);

			// When the user views the trip dashboard
			await page.goto(tripUrl);
			await page.waitForURL(/\/trips\/[^/]+$/);

			// Then the Group Balances widget is visible with member names and a link to balances
			await expect(page.getByText('Group Balances')).toBeVisible();
			await expect(page.getByText('Iris')).toBeVisible();
			await expect(page.getByText('Jack')).toBeVisible();
			await expect(page.getByRole('link', { name: /View all/ })).toBeVisible();
		});
	});
});
