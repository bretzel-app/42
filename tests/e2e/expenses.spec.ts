import { test, expect, createTrip, addExpense } from './helpers/fixtures.js';

test.describe('Expense management', () => {
	test('Scenario: User adds an expense to a trip', async ({ authenticatedPage: page }) => {
		// Given a trip "Berlin Weekend" exists
		await createTrip(page, { name: 'Berlin Weekend', destination: 'Berlin' });

		// When the user adds a 25 EUR food expense
		await addExpense(page, { amount: '25', category: 'food', note: 'Lunch at Mustafa' });

		// Then the expense appears in the trip
		await expect(page.getByText('Lunch at Mustafa')).toBeVisible();
	});

	test('Scenario: Dashboard shows expense totals', async ({ authenticatedPage: page }) => {
		// Given a trip with a 500 EUR budget
		await createTrip(page, { name: 'Budget Test', budget: '500' });

		// When the user adds expenses
		await addExpense(page, { amount: '100', category: 'food' });
		await addExpense(page, { amount: '200', category: 'accommodation' });

		// Then the dashboard shows the correct total spent
		await page.goto(page.url().replace(/\/expenses.*/, ''));
		await expect(page.getByText('Spent:')).toBeVisible();
		await expect(page.getByText('300.00').first()).toBeVisible();
	});

	test('Scenario: Expense list groups expenses by date', async ({ authenticatedPage: page }) => {
		// Given a trip with expenses
		await createTrip(page, { name: 'Grouped Test' });
		await addExpense(page, { amount: '50', category: 'transport', note: 'Metro ticket' });

		// When the user views the expense list
		await page.getByText('Expenses').click();

		// Then expenses are shown with their details
		await expect(page.getByTestId('expense-row')).toBeVisible();
		await expect(page.getByText('Metro ticket')).toBeVisible();
	});
});
