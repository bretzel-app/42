import { test, expect, createTrip, addExpense, tripCard } from './helpers/fixtures.js';

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
		await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
		await expect(page.getByText('Spent:')).toBeVisible();
		await expect(page.getByText('300.00').first()).toBeVisible();
	});

	test('Scenario: Pre-trip expenses are included in the trip list budget gauge', async ({ authenticatedPage: page }) => {
		// Given a trip starting Mar 20 with a 1000 EUR budget
		await createTrip(page, {
			name: 'Pre-spend Test',
			budget: '1000',
			startDate: '2026-03-20',
			endDate: '2026-03-25'
		});

		// When the user adds a pre-trip expense (before start date) and an on-trip expense
		await addExpense(page, { amount: '300', category: 'transport', note: 'Flight', date: '2026-03-10' });
		await addExpense(page, { amount: '50', category: 'food', note: 'Dinner', date: '2026-03-21' });

		// Then the trips list budget gauge includes both expenses
		await page.goto('/');
		const card = tripCard(page, 'Pre-spend Test');
		await expect(card).toBeVisible();
		await expect(card.getByText('350')).toBeVisible();
	});

	test('Scenario: Expense list groups expenses by date', async ({ authenticatedPage: page }) => {
		// Given a trip with expenses
		await createTrip(page, { name: 'Grouped Test' });
		await addExpense(page, { amount: '50', category: 'transport', note: 'Metro ticket' });

		// Then the expense list shows the expense details
		await expect(page.getByTestId('expense-row')).toBeVisible();
		await expect(page.getByText('Metro ticket')).toBeVisible();
	});

	test('Scenario: Clicking a dashboard category opens the expenses list filtered to that category', async ({ authenticatedPage: page }) => {
		// Given a trip with expenses across multiple categories
		await createTrip(page, { name: 'Filter Test' });
		await addExpense(page, { amount: '40', category: 'food', note: 'Ramen' });
		await addExpense(page, { amount: '120', category: 'transport', note: 'Train ticket' });

		// When the user navigates to the dashboard and clicks the food category row
		await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
		const foodRow = page.locator('[data-testid="category-row"][data-category="food"]');
		await expect(foodRow).toBeVisible();
		await foodRow.click();

		// Then the URL carries the category filter and the chip displays the selected category
		await expect(page).toHaveURL(/\/expenses\?category=food$/);
		await expect(page.getByTestId('category-filter-chip')).toContainText('Food & Drinks');

		// And only food expenses are shown
		await expect(page.getByText('Ramen')).toBeVisible();
		await expect(page.getByText('Train ticket')).toHaveCount(0);

		// When the user clears the filter
		await page.getByTestId('clear-category-filter').click();

		// Then both expenses are shown again and the chip is gone
		await expect(page).toHaveURL(/\/expenses$/);
		await expect(page.getByTestId('category-filter-chip')).toHaveCount(0);
		await expect(page.getByText('Ramen')).toBeVisible();
		await expect(page.getByText('Train ticket')).toBeVisible();
	});
});
